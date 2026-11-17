"""스마트스토어 매입상품 등록 (ERP '매입상품 등록' 승인분 → 네이버 커머스API)

사용 (PC):
  python ss_upload.py ss_upload_2026-11-17.json            # 미리보기만 (등록 안 함, 요청 내용을 out/ 에 저장)
  python ss_upload.py ss_upload_2026-11-17.json --apply    # 실제 등록
  → 결과 파일 ss_upload_result_*.json 을 ERP [결과 불러오기]로 올리면 상태·상품번호 반영

동작:
  1) 틀 상품(샤넬 지갑류, ERP에서 지정한 스마트스토어 상품번호)을 조회해서
     카테고리·배송·A/S·원산지·상품정보제공고시 등 설정을 그대로 복사
  2) 상품명·판매가·재고 1·판매자상품코드·상세·사진만 바꾸고, 반품/교환 배송비를 ERP 설정값으로
  3) 사진은 네이버 이미지 업로드 후 그 주소로 등록

키: 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET, 또는 --keys <파일> (client_id=… / client_secret=… 두 줄).
    이 스크립트는 키를 화면에 출력하지 않아요.

※ API 경로·필드는 네이버 커머스API 공식 문서(apicenter.commerce.naver.com)로 첫 실행 전 확인 필요.
   그래서 기본은 미리보기 모드예요. 첫 --apply 는 1개만 넣어서 시험하세요.
"""
import argparse, base64, copy, datetime, json, os, sys, time, urllib.request

try:
    import bcrypt, requests
except ImportError:
    sys.exit("pip install bcrypt requests 먼저 실행해 주세요.")

API = "https://api.commerce.naver.com/external"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")


def load_keys(path):
    cid, sec = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    if path:
        kv, plain = {}, []
        for ln in open(path, encoding="utf-8-sig"):
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue
            sep = "=" if "=" in ln else (":" if ":" in ln else None)
            if sep:
                k, v = ln.split(sep, 1)
                kv[k.strip().lower()] = v.strip()
            else:
                plain.append(ln)
        cid = kv.get("client_id") or kv.get("id") or (plain[0] if plain else cid)
        sec = kv.get("client_secret") or kv.get("secret") or (plain[1] if len(plain) > 1 else sec)
    if not cid or not sec:
        sys.exit("키를 찾지 못했어요 (환경변수 또는 --keys 파일 형식 확인).")
    return cid, sec


def token(cid, sec):
    ts = str(int(time.time() * 1000))
    sign = base64.b64encode(bcrypt.hashpw(f"{cid}_{ts}".encode(), sec.encode())).decode()
    r = requests.post(f"{API}/v1/oauth2/token", data={"client_id": cid, "timestamp": ts, "client_secret_sign": sign, "grant_type": "client_credentials", "type": "SELF"}, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]


def api(tok, method, path, **kw):
    r = requests.request(method, API + path, headers={"Authorization": f"Bearer {tok}"}, timeout=60, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"{method} {path} {r.status_code}: {r.text[:400]}")
    return r.json() if r.text else {}


def upload_images(tok, urls):
    out = []
    for i in range(0, len(urls), 10):
        files = []
        for j, u in enumerate(urls[i:i + 10]):
            data = urllib.request.urlopen(u, timeout=60).read()
            files.append(("imageFiles", (f"img{i + j}.jpg", data, "image/jpeg")))
        res = api(tok, "POST", "/v1/product-images/upload", files=files)
        out += [x["url"] for x in res.get("images", [])]
        time.sleep(1)
    if len(out) != len(urls):
        raise RuntimeError(f"사진 업로드 수가 맞지 않아요 ({len(out)}/{len(urls)})")
    return out


def build(tpl, item, imgs, ret_fee, exc_fee):
    origin = copy.deepcopy(tpl["originProduct"])
    for k in ("originProductNo", "statusType", "saleStartDate", "saleEndDate"):
        origin.pop(k, None)
    origin["statusType"] = "SALE"
    origin["name"] = item["name"][:100]
    origin["salePrice"] = int(item["salePrice"])
    origin["stockQuantity"] = 1
    origin["images"] = {"representativeImage": {"url": imgs[0]}, "optionalImages": [{"url": u} for u in imgs[1:10]]}
    body = "".join(f'<p><img src="{u}" style="max-width:100%"></p>' for u in imgs)
    origin["detailContent"] = item["detailHtml"].replace("{{IMAGES}}", body)
    da = origin.setdefault("detailAttribute", {})
    da["sellerCodeInfo"] = {**da.get("sellerCodeInfo", {}), "sellerManagementCode": item["sellerCode"]}
    da.pop("optionInfo", None)          # 틀 상품의 옵션·재고는 가져오지 않음 (1개 단품)
    da.pop("seoInfo", None)
    origin.get("customerBenefit", {}).pop("immediateDiscountPolicy", None)  # 틀의 즉시할인 복사 안 함
    claim = origin.setdefault("deliveryInfo", {}).setdefault("claimDeliveryInfo", {})
    claim["returnDeliveryFee"] = int(ret_fee)
    claim["exchangeDeliveryFee"] = int(exc_fee)
    ch = copy.deepcopy(tpl.get("smartstoreChannelProduct", {}))
    for k in ("channelProductNo", "channelProductDisplayStatusType", "storeKeepExclusiveProduct"):
        ch.pop(k, None)
    ch["naverShoppingRegistration"] = ch.get("naverShoppingRegistration", True)
    ch["channelProductDisplayStatusType"] = "ON"
    return {"originProduct": origin, "smartstoreChannelProduct": ch}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_json")
    ap.add_argument("--apply", action="store_true", help="실제 등록 (없으면 미리보기)")
    ap.add_argument("--keys")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    ex = json.load(open(a.export_json, encoding="utf-8"))
    items = ex["items"][: a.limit or None]
    os.makedirs(OUT, exist_ok=True)
    tok = token(*load_keys(a.keys))
    tpl = api(tok, "GET", f"/v2/products/channel-products/{ex['templateChannelProductNo']}")
    json.dump(tpl, open(os.path.join(OUT, "template.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    results = []
    for it in items:
        r = {"id": it["id"], "name": it["name"], "at": datetime.datetime.now().isoformat(timespec="seconds"), "dryRun": not a.apply}
        try:
            imgs = upload_images(tok, it["photos"]) if a.apply else it["photos"]
            payload = build(tpl, it, imgs, ex.get("returnFee", 25000), ex.get("exchangeFee", 50000))
            json.dump(payload, open(os.path.join(OUT, f"payload_{it['id']}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            if a.apply:
                res = api(tok, "POST", "/v2/products", json=payload)
                r.update(ok=True, originProductNo=res.get("originProductNo"), channelProductNo=res.get("smartstoreChannelProductNo"))
            else:
                r.update(ok=True, note="미리보기 — out/payload_*.json 확인")
            print("OK ", it["name"])
        except Exception as e:  # noqa
            r.update(ok=False, error=str(e))
            print("ERR", it["name"], str(e)[:200])
        results.append(r)
        time.sleep(2)
    fn = os.path.join(os.path.dirname(os.path.abspath(a.export_json)), f"ss_upload_result_{datetime.datetime.now():%Y%m%d_%H%M}.json")
    json.dump({"results": results}, open(fn, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("결과:", fn)


if __name__ == "__main__":
    main()

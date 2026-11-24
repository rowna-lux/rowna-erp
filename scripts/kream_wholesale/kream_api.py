"""
크림(Kream) 상품 시세 조회 (unofficial API)
kream.co.kr 내부 API 직접 호출.
"""
import re
import requests
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://kream.co.kr/",
}

# 수수료 Level 1 (대표님 확정)
FEE_RATE = 0.06
FEE_FIXED = 2500


def extract_product_id(url_or_id):
    """URL 또는 ID에서 상품 ID 추출."""
    if not url_or_id:
        return None
    s = str(url_or_id).strip()
    if s.isdigit():
        return s
    m = re.search(r"products/(\d+)", s)
    if m:
        return m.group(1)
    return None


def fetch_price(product_id, timeout=8):
    """
    크림 상품 즉시 구매가(=즉시판매가 하한) 조회.

    반환: {'ok': True, 'price': 895000, 'name': '...', 'brand': '...'}
          or {'ok': False, 'error': '...'}
    """
    pid = extract_product_id(product_id)
    if not pid:
        return {"ok": False, "error": "invalid product id"}

    try:
        # 크림 상품 상세 API (unofficial)
        url = f"https://kream.co.kr/api/products/{pid}"
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code != 200:
            return {"ok": False, "error": f"status {r.status_code}"}

        data = r.json()
        # 구조는 kream에 따라 바뀔 수 있음. 안전하게 접근.
        # 즉시 구매가 = 즉시 판매가 하한
        price = (
            data.get("release_price")
            or data.get("original_price")
            or (data.get("market_info") or {}).get("low_price")
            or data.get("low_price")
        )
        name = data.get("translated_name") or data.get("name") or ""
        brand = (data.get("brand") or {}).get("name") or ""

        if not price:
            return {"ok": False, "error": "no price in response", "raw": data}

        return {
            "ok": True,
            "price": int(price),
            "name": name,
            "brand": brand,
            "url": f"https://kream.co.kr/products/{pid}",
        }
    except requests.exceptions.Timeout:
        return {"ok": False, "error": "timeout"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def calc_profit(kream_price, wholesale_price):
    """
    크림 시세 기준 예상 수익 계산 (Level 1).
    정산가 = kream_price - (kream_price * 0.06) - 2500
    수익 = 정산가 - 매입가
    수익률 = 수익 / 매입가 * 100
    """
    if not kream_price or not wholesale_price:
        return None
    settle = round(kream_price * (1 - FEE_RATE) - FEE_FIXED)
    profit = settle - wholesale_price
    rate = (profit / wholesale_price * 100) if wholesale_price > 0 else 0
    return {
        "kream_price": kream_price,
        "wholesale_price": wholesale_price,
        "settle_price": settle,  # 정산가 (수수료 차감 후 실수령)
        "profit": profit,
        "profit_rate": round(rate, 1),
        "verdict": _verdict(rate),
    }


def _verdict(rate):
    """수익률 기반 판단."""
    if rate >= 15:
        return "✅ 매입 추천"
    elif rate >= 8:
        return "👍 매입 가능"
    elif rate >= 3:
        return "⚠ 애매 (판단 요)"
    elif rate >= -3:
        return "❌ 본전"
    else:
        return "💀 손해"


def enrich_items(items, delay=0.5):
    """
    품목 리스트에 크림 시세·수익 분석 추가.
    items: [{'brand', 'name', 'sku', 'size', 'qty', 'price', 'kream_url'}, ...]
    반환: 각 item에 'kream' key 추가됨
    """
    out = []
    for it in items:
        enriched = dict(it)
        kream_url = it.get("kream_url") or ""
        if kream_url:
            price_info = fetch_price(kream_url)
            if price_info.get("ok"):
                enriched["kream"] = price_info
                enriched["profit"] = calc_profit(price_info["price"], it.get("price", 0))
            else:
                enriched["kream"] = {"ok": False, "error": price_info.get("error")}
                enriched["profit"] = None
        else:
            enriched["kream"] = {"ok": False, "error": "no url"}
            enriched["profit"] = None
        out.append(enriched)
        time.sleep(delay)  # 레이트리밋 회피
    return out


if __name__ == "__main__":
    # 테스트
    test_ids = ["73728", "711307", "61375"]  # 열무 리스트 예시
    for pid in test_ids:
        r = fetch_price(pid)
        print(f"{pid}: {r}")
        time.sleep(1)

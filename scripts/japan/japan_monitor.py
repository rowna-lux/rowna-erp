"""
일본 구매대행 상품 모니터링 (대표님 요청 2026-11-22)

아마존재팬·라쿠텐·조조타운에서 특정 브랜드 가격 하락 알림.
환율+배송비+관세 자동 계산.

사용법:
1. pip install requests beautifulsoup4 lxml python-dotenv
2. scripts/.env 설정 (GMAIL_USER, GMAIL_APP_PASSWORD)
3. python japan_monitor.py       → 1회
4. python japan_monitor.py --loop → 매 4시간
5. python japan_monitor.py --test → 알림 테스트

주의:
- 아마존재팬·라쿠텐은 봇 차단 있음. 저빈도(4시간) + 랜덤딜레이 필수
- 환율 변동 → 매일 1회 fresh 체크
- 관세: 150달러 이하 면세 (한국 기준, 2026-11 현재. 변경 체크 필요)
"""
import os, sys, time, json, random, argparse, re
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import requests
    from bs4 import BeautifulSoup
    from dotenv import load_dotenv
    from common.notify import send as notify_send
except ImportError as e:
    print(f"[설치 필요] pip install requests beautifulsoup4 lxml python-dotenv")
    print(f"import 실패: {e}")
    sys.exit(1)

load_dotenv()

STATE_FILE = Path(__file__).parent / "jp_seen.json"
WATCH_LIST_FILE = Path(__file__).parent / "watch_list.json"

# ===== 감시 상품 리스트 (예시 — user가 수정) =====
DEFAULT_WATCH_LIST = [
    # 아마존재팬
    {"site": "amazon_jp", "name": "MONCLER 몽클레어 한정판", "search_url": "https://www.amazon.co.jp/s?k=moncler", "max_price_jpy": 200000},
    # 라쿠텐
    {"site": "rakuten", "name": "AMI de Coeur 티셔츠", "search_url": "https://search.rakuten.co.jp/search/mall/ami+de+coeur/", "max_price_jpy": 20000},
    # 조조타운 (스니커즈 강점)
    {"site": "zozo", "name": "HOKA 클리프톤", "search_url": "https://zozo.jp/search/?p_brid=&t1_c1oc=hoka", "max_price_jpy": 25000},
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
}


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def tg_send(text):
    """Gmail 알림 발송 (호환성 위해 이름은 tg_send 유지)"""
    plain = re.sub(r"<[^>]+>", "", text)
    lines = plain.strip().split("\n", 1)
    subject = lines[0][:100] if lines else "일본 구매대행"
    notify_send(subject, plain)


def get_jpy_krw_rate():
    """100엔당 원 환율 (네이버 금융 or 공공 API)"""
    try:
        r = requests.get("https://api.exchangerate-api.com/v4/latest/JPY", timeout=5)
        return r.json()["rates"]["KRW"] * 100  # 100엔 기준
    except Exception as e:
        log(f"⚠ 환율 조회 실패: {e}. 기본값 900원/100엔 사용")
        return 900


def calc_total_krw(jpy_price, rate_100jpy, shipping_jpy=1500):
    """총 원가 (엔→원 환율 + 배송비 + 관세)"""
    subtotal_krw = (jpy_price + shipping_jpy) * rate_100jpy / 100
    # 150달러 이하 면세 (대략 22만원 이하)
    tariff = 0
    if subtotal_krw > 220000:
        # 가방·의류 관세 평균 13% + 부가세 10%
        tariff = subtotal_krw * 0.23
    return int(subtotal_krw + tariff)


def parse_amazon_jp(search_url, max_price):
    time.sleep(random.uniform(2, 5))
    try:
        r = requests.get(search_url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            log(f"amazon_jp HTTP {r.status_code}")
            return []
        soup = BeautifulSoup(r.text, "lxml")
        items = []
        for card in soup.select("div[data-component-type='s-search-result']"):
            name_el = card.select_one("h2 a span")
            price_el = card.select_one(".a-price-whole")
            link_el = card.select_one("h2 a")
            if not (name_el and price_el and link_el):
                continue
            try:
                price = int(price_el.text.replace(",", "").replace("￥", "").strip())
            except ValueError:
                continue
            if price > max_price:
                continue
            items.append({
                "name": name_el.text.strip()[:80],
                "price_jpy": price,
                "url": "https://www.amazon.co.jp" + link_el["href"] if link_el["href"].startswith("/") else link_el["href"],
            })
        return items
    except Exception as e:
        log(f"amazon_jp 에러: {e}")
        return []


def load_watch_list():
    if not WATCH_LIST_FILE.exists():
        WATCH_LIST_FILE.write_text(json.dumps(DEFAULT_WATCH_LIST, ensure_ascii=False, indent=2))
        log(f"감시 리스트 파일 생성: {WATCH_LIST_FILE} — 수정하세요")
    return json.loads(WATCH_LIST_FILE.read_text())


def load_seen():
    if not STATE_FILE.exists():
        return set()
    try:
        return set(json.loads(STATE_FILE.read_text()))
    except Exception:
        return set()


def save_seen(s):
    STATE_FILE.write_text(json.dumps(list(s)))


def check_all():
    watch = load_watch_list()
    seen = load_seen()
    rate = get_jpy_krw_rate()
    log(f"📈 환율: 100엔 = {rate:.0f}원")

    new_items = []
    for w in watch:
        log(f"  → {w['site']} {w['name']} (최대 {w['max_price_jpy']:,}엔)")
        if w["site"] == "amazon_jp":
            items = parse_amazon_jp(w["search_url"], w["max_price_jpy"])
        else:
            log(f"  ⚠ {w['site']} 파서 미구현. amazon_jp만 작동")
            continue
        for it in items[:5]:
            key = f"{w['site']}|{it['name'][:40]}|{it['price_jpy']}"
            if key in seen:
                continue
            seen.add(key)
            it["total_krw"] = calc_total_krw(it["price_jpy"], rate)
            it["watch_name"] = w["name"]
            new_items.append(it)

    save_seen(seen)

    if new_items:
        msg = f"🇯🇵 <b>일본 신규 매물 {len(new_items)}건</b>\n환율: 100엔 = {rate:.0f}원\n\n"
        for it in new_items[:10]:
            msg += f"· {it['watch_name']}\n  {it['name'][:60]}\n  ¥{it['price_jpy']:,} → ₩{it['total_krw']:,} (배송+관세 포함)\n  {it['url']}\n\n"
        tg_send(msg[:4000])
        log(f"📬 Gmail: {len(new_items)}건")
    else:
        log("신규 매물 없음")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true", help="4시간마다 반복")
    parser.add_argument("--test", action="store_true", help="알림 테스트")
    args = parser.parse_args()

    if args.test:
        log("🧪 알림 테스트")
        ok = notify_send(
            "일본 구매대행 모니터 테스트",
            f"일본 구매대행 모니터 알림 테스트입니다.\n\n발송 시각: {datetime.now()}"
        )
        log("✅ 테스트 발송 완료" if ok else "❌ 실패. .env 확인.")
        return

    if args.loop:
        log("🔄 매 4시간 반복. Ctrl+C로 중단")
        while True:
            try:
                check_all()
            except Exception as e:
                log(f"에러: {e}")
            wait = 4 * 3600 + random.randint(-600, 600)
            log(f"😴 다음: {wait//60}분 뒤")
            time.sleep(wait)
    else:
        check_all()


if __name__ == "__main__":
    main()

"""
블랙프라이데이 명품 세일 모니터링 (대표님 요청 2026-11-22)
타겟 사이트: SSENSE·Mytheresa·Farfetch·NAP·MR PORTER·24S
로우나 취급 브랜드 50%+ 할인 시 텔레그램 알림.

사용법:
1. pip install requests beautifulsoup4 lxml python-dotenv
2. .env 파일에 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 넣기
3. python bf_monitor.py           → 1회 체크
4. python bf_monitor.py --loop    → 2시간마다 무한 반복 (서브컴에서 24/7)

11/28(금) D-6. 블랙프 피크 11/27-12/02.
"""
import os, sys, time, json, random, argparse, re
from datetime import datetime
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
    from dotenv import load_dotenv
except ImportError:
    print("[설치 필요] pip install requests beautifulsoup4 lxml python-dotenv")
    sys.exit(1)

load_dotenv()

# ===== 설정 =====
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.getenv("TELEGRAM_CHAT_ID", "")
LOOP_INTERVAL = 2 * 60 * 60  # 2시간
MIN_DISCOUNT = 50  # 50%+ 세일만 알림
STATE_FILE = Path(__file__).parent / "seen_items.json"

# 로우나가 취급하는 브랜드 (ERP 데이터 기반 — 추가/수정 필요하면 여기)
TARGET_BRANDS = [
    "stone island", "cp company", "c.p. company", "maison margiela",
    "chloe", "chloé", "miu miu", "prada", "saint laurent", "ami",
    "ami paris", "autry", "hoka", "golden goose", "bottega veneta",
    "moncler", "balenciaga", "jacquemus", "burberry", "jil sander",
    "toteme", "khaite", "the row", "acne studios", "lemaire",
    "arc'teryx", "arcteryx", "barracuta", "roa",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        log("⚠ 텔레그램 미설정 (.env 확인)")
        return
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True},
            timeout=10,
        )
        if not r.ok:
            log(f"텔레그램 실패: {r.text[:200]}")
    except Exception as e:
        log(f"텔레그램 오류: {e}")


def load_seen():
    if not STATE_FILE.exists():
        return set()
    try:
        return set(json.loads(STATE_FILE.read_text()))
    except Exception:
        return set()


def save_seen(s):
    STATE_FILE.write_text(json.dumps(list(s)))


def brand_match(text):
    """상품명에서 타겟 브랜드 매칭"""
    t = text.lower()
    for b in TARGET_BRANDS:
        if b in t:
            return b
    return None


def fetch(url, timeout=15):
    """차단 회피 — 랜덤 딜레이 + 재시도"""
    time.sleep(random.uniform(1, 3))
    try:
        r = requests.get(url, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.text
        log(f"⚠ {url[:60]} → HTTP {r.status_code}")
    except Exception as e:
        log(f"⚠ {url[:60]} → {e}")
    return None


# ===== 사이트별 파서 =====
def parse_ssense():
    """SSENSE Sale 페이지 (상품 리스트)"""
    url = "https://www.ssense.com/en-us/women/sale"
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    items = []
    # SSENSE 상품 구조 — 변경 가능. 2026-11 기준
    for card in soup.select("div.product-tile, article.product, div[data-product-id]"):
        name = (card.get_text(" ", strip=True) or "")[:200]
        brand = brand_match(name)
        if not brand:
            continue
        # 할인율 추출 (예: "50% OFF" or "USD $500 → $250")
        disc_match = re.search(r"(\d{2,3})\s*%\s*(?:off|할인)", name, re.I)
        disc = int(disc_match.group(1)) if disc_match else 0
        if disc < MIN_DISCOUNT:
            continue
        link = card.find("a")
        href = ("https://www.ssense.com" + link["href"]) if link and link.get("href", "").startswith("/") else (link.get("href") if link else "")
        items.append({"site": "SSENSE", "brand": brand, "name": name[:100], "discount": disc, "url": href})
    return items


def parse_mytheresa():
    url = "https://www.mytheresa.com/en-us/sale"
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    items = []
    for card in soup.select(".item, .product-item, article"):
        name = (card.get_text(" ", strip=True) or "")[:200]
        brand = brand_match(name)
        if not brand:
            continue
        disc_match = re.search(r"-(\d{2,3})\s*%", name)
        disc = int(disc_match.group(1)) if disc_match else 0
        if disc < MIN_DISCOUNT:
            continue
        link = card.find("a")
        href = ("https://www.mytheresa.com" + link["href"]) if link and link.get("href", "").startswith("/") else (link.get("href") if link else "")
        items.append({"site": "Mytheresa", "brand": brand, "name": name[:100], "discount": disc, "url": href})
    return items


def parse_farfetch():
    url = "https://www.farfetch.com/sale/women/items.aspx"
    html = fetch(url)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    items = []
    for card in soup.select("li[data-testid], article, div.product"):
        name = (card.get_text(" ", strip=True) or "")[:200]
        brand = brand_match(name)
        if not brand:
            continue
        disc_match = re.search(r"-(\d{2,3})\s*%|(\d{2,3})\s*%\s*off", name, re.I)
        disc = int(disc_match.group(1) or disc_match.group(2)) if disc_match else 0
        if disc < MIN_DISCOUNT:
            continue
        link = card.find("a")
        href = ("https://www.farfetch.com" + link["href"]) if link and link.get("href", "").startswith("/") else (link.get("href") if link else "")
        items.append({"site": "Farfetch", "brand": brand, "name": name[:100], "discount": disc, "url": href})
    return items


# 사이트 파서 리스트 (더 추가 가능)
SITES = [
    ("SSENSE", parse_ssense),
    ("Mytheresa", parse_mytheresa),
    ("Farfetch", parse_farfetch),
]


def check_all():
    seen = load_seen()
    new_items = []
    for site_name, parser in SITES:
        log(f"  → {site_name} 체크 중...")
        try:
            items = parser()
            for it in items:
                key = f"{it['site']}|{it['brand']}|{it['name'][:40]}"
                if key in seen:
                    continue
                seen.add(key)
                new_items.append(it)
            added = [x for x in items if f"{x['site']}|{x['brand']}|{x['name'][:40]}" in seen]
            log(f"  ← {site_name}: 신규 {len(added)}개")
        except Exception as e:
            log(f"  ⚠ {site_name} 에러: {e}")
        time.sleep(random.uniform(5, 10))  # 사이트 간 간격
    save_seen(seen)

    # 텔레그램 전송
    if new_items:
        msg = f"🔥 <b>블랙프라이데이 신규 세일 {len(new_items)}건</b>\n\n"
        for it in new_items[:15]:
            msg += f"· <b>{it['brand'].upper()}</b> {it['discount']}% off [{it['site']}]\n{it['name'][:60]}\n{it['url'][:80]}\n\n"
        tg_send(msg[:4000])
        log(f"📬 텔레그램 발송: 신규 {len(new_items)}건")
    else:
        log("신규 세일 없음")

    return len(new_items)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true", help=f"무한 반복 ({LOOP_INTERVAL//3600}시간 간격)")
    parser.add_argument("--reset", action="store_true", help="본 적 있는 리스트 초기화")
    args = parser.parse_args()

    if args.reset:
        STATE_FILE.unlink(missing_ok=True)
        log("✅ seen_items.json 초기화")
        return

    if args.loop:
        log(f"🔄 무한 반복 시작 ({LOOP_INTERVAL//3600}시간 간격). Ctrl+C로 중단.")
        while True:
            try:
                check_all()
            except Exception as e:
                log(f"❌ 에러: {e}")
            next_check = LOOP_INTERVAL + random.randint(-600, 600)  # ±10분 랜덤
            log(f"😴 다음 체크: {next_check//60}분 뒤")
            time.sleep(next_check)
    else:
        check_all()


if __name__ == "__main__":
    main()

"""
블랙프라이데이 명품 세일 모니터링 (대표님 요청 2026-11-22)
타겟 사이트: SSENSE·Mytheresa·Farfetch·NAP·MR PORTER·24S
로우나 취급 브랜드 50%+ 할인 시 Gmail 알림.

사용법:
1. pip install requests beautifulsoup4 lxml python-dotenv
2. scripts/.env 파일에 GMAIL_USER, GMAIL_APP_PASSWORD 넣기
3. python bf_monitor.py           → 1회 체크
4. python bf_monitor.py --loop    → 2시간마다 무한 반복 (서브컴에서 24/7)
5. python bf_monitor.py --test    → 알림 테스트 (크롤링 X, 메일만 발송)

11/28(금) D-4. 블랙프 피크 11/27-12/02.
"""
import os, sys, time, json, random, argparse, re
from datetime import datetime
from pathlib import Path

# scripts/ 를 sys.path에 추가 (common.notify 임포트용)
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

# ===== 설정 =====
LOOP_INTERVAL = 2 * 60 * 60  # 2시간
MIN_DISCOUNT = 50  # 50%+ 세일만 알림
STATE_FILE = Path(__file__).parent / "seen_items.json"

# 로우나가 취급하는 브랜드 (ERP + 열무/수고개 도매 리스트 기반, 2026-11-25 보강)
# TOP_PRIORITY: 매입 빈도 높음 (최근 도매 리스트에 자주 등장)
TOP_PRIORITY = [
    "stone island", "cp company", "c.p. company",
    "maison margiela", "margiela",
    "saint laurent", "ysl",
    "prada", "miu miu",
]

TARGET_BRANDS = TOP_PRIORITY + [
    # 컨템포러리 디자이너
    "chloe", "chloé", "ami", "ami paris", "autry", "hoka", "golden goose",
    "bottega veneta", "moncler", "balenciaga", "jacquemus", "burberry",
    "jil sander", "toteme", "khaite", "the row", "acne studios", "lemaire",
    # 아웃도어/테크웨어
    "arc'teryx", "arcteryx", "barracuta", "roa",
    # 하이엔드 (세일 가끔)
    "loewe", "givenchy", "celine", "fendi",
    # 추가 관심 브랜드
    "isabel marant", "dries van noten", "wales bonner",
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
    """Gmail 알림 발송 (호환성 위해 이름은 tg_send 유지)"""
    # HTML 태그 제거 (Gmail 평문으로)
    plain = re.sub(r"<[^>]+>", "", text)
    # 첫 줄을 제목으로
    lines = plain.strip().split("\n", 1)
    subject = lines[0][:100] if lines else "블프 세일"
    body = plain
    notify_send(subject, body)


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

    # Gmail 알림 발송 (TOP_PRIORITY 우선 정렬)
    if new_items:
        # 우선순위별 분리
        prio = [it for it in new_items if it["brand"].lower() in [b.lower() for b in TOP_PRIORITY]]
        rest = [it for it in new_items if it["brand"].lower() not in [b.lower() for b in TOP_PRIORITY]]
        # 할인율 기준 정렬
        prio.sort(key=lambda x: x.get("discount", 0), reverse=True)
        rest.sort(key=lambda x: x.get("discount", 0), reverse=True)

        subject = f"블프 세일 {len(new_items)}건 (⭐ {len(prio)} + {len(rest)})"
        body_lines = [f"🔥 블랙프라이데이 신규 세일 {len(new_items)}건 (50%+)\n"]

        if prio:
            body_lines.append(f"=" * 40)
            body_lines.append(f"⭐ 핵심 타겟 ({len(prio)}건)")
            body_lines.append(f"=" * 40)
            for it in prio[:15]:
                body_lines.append(f"\n· {it['brand'].upper()} {it['discount']}% off [{it['site']}]")
                body_lines.append(f"  {it['name'][:80]}")
                body_lines.append(f"  {it['url']}")

        if rest:
            body_lines.append(f"\n{'=' * 40}")
            body_lines.append(f"추가 타겟 ({len(rest)}건)")
            body_lines.append(f"=" * 40)
            for it in rest[:10]:
                body_lines.append(f"\n· {it['brand'].upper()} {it['discount']}% off [{it['site']}]")
                body_lines.append(f"  {it['name'][:80]}")
                body_lines.append(f"  {it['url']}")

        body_lines.append(f"\n🕐 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        notify_send(subject, "\n".join(body_lines))
        log(f"📬 Gmail 발송: 신규 {len(new_items)}건 (핵심 {len(prio)})")
    else:
        log("신규 세일 없음")

    return len(new_items)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true", help=f"무한 반복 ({LOOP_INTERVAL//3600}시간 간격)")
    parser.add_argument("--reset", action="store_true", help="본 적 있는 리스트 초기화")
    parser.add_argument("--test", action="store_true", help="알림 테스트 (크롤링 X, Gmail 발송만)")
    args = parser.parse_args()

    if args.reset:
        STATE_FILE.unlink(missing_ok=True)
        log("✅ seen_items.json 초기화")
        return

    if args.test:
        log("🧪 알림 테스트 모드")
        subject = "블프 모니터 테스트"
        body = f"로우나 블프 모니터 알림 테스트입니다.\n\n발송 시각: {datetime.now()}\n\n이 메일이 보이면 블프 모니터 알림 설정 완료입니다."
        ok = notify_send(subject, body)
        if ok:
            log(f"✅ 테스트 메일 발송 완료. Gmail 확인하세요.")
        else:
            log(f"❌ 테스트 메일 발송 실패. .env 확인.")
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

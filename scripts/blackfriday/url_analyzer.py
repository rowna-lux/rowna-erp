"""
세일 사이트 URL 분석기 (블랙프라이데이 D-3 긴급 추가, 2026-11-25)

사용법:
    python scripts/blackfriday/url_analyzer.py "https://www.ssense.com/..."

동작:
1. URL 페이지 HTML 가져옴 (타겟 브랜드 매칭)
2. OpenAI gpt-4o-mini로 품목 리스트·세일가 추출
3. 로우나 타겟 브랜드 50%+ 세일만 필터
4. Gmail 발송

bf_monitor.py 파서가 깨지면 대안으로 사용. 브라우저에서 세일 사이트 발견 →
URL 복사해서 실행 → 로우나 관점 분석 결과 이메일.
"""
import os
import sys
import re
import json
import argparse
from datetime import datetime
from pathlib import Path

# scripts/ sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import requests
    from bs4 import BeautifulSoup
    from dotenv import load_dotenv
    from common.notify import send as notify_send
    from common.fetcher import fetch_page_text, is_available as playwright_available
except ImportError as e:
    print(f"[설치 필요] pip install requests beautifulsoup4 lxml python-dotenv playwright")
    print(f"import 실패: {e}")
    sys.exit(1)

load_dotenv(Path(__file__).parent.parent / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
if not OPENAI_API_KEY:
    maybe = os.getenv("GEMINI_API_KEY", "").strip()
    if maybe.startswith("sk-"):
        OPENAI_API_KEY = maybe

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}

# 로우나 핵심 타겟 브랜드 (매입 리스트 기반, 2026-11-24 열무/수고개 데이터 반영)
ROWNA_BRANDS = {
    "stone island", "cp company", "c.p. company", "cp컴퍼니", "스톤 아일랜드", "스톤아일랜드",
    "maison margiela", "메종 마르지엘라", "margiela", "마르지엘라",
    "saint laurent", "생로랑", "ysl",
    "prada", "프라다",
    "miu miu", "미우미우",
    "chloe", "chloé", "클로에",
    "balenciaga", "발렌시아가",
    "bottega veneta", "보테가 베네타",
    "moncler", "몽클레어",
    "burberry", "버버리",
    "jacquemus", "자크뮈스",
    "lemaire", "르메르",
    "jil sander", "질 샌더",
    "ami", "ami paris", "아미", "아미 파리스",
    "acne studios", "아크네",
    "the row", "더 로우",
    "khaite", "케이트",
    "toteme", "토템",
    "autry", "오트리",
    "golden goose", "골든구스",
    "hoka", "호카",
    "arc'teryx", "arcteryx", "아크테릭스",
    "roa",
    "loewe", "로에베",
}

# 핵심 브랜드 (매입 자주 - 우선순위 높음)
TOP_PRIORITY = {"stone island", "cp company", "c.p. company", "maison margiela", "saint laurent", "prada"}


def extract_page_text(url, timeout=30):
    """URL에서 핵심 텍스트 추출 (Playwright → JS 렌더링 후 텍스트)"""
    # Playwright 우선 (설치돼있으면 자동), 없으면 requests 폴백
    text, err = fetch_page_text(url, prefer="playwright", timeout=timeout)
    if text:
        return text, None
    return None, err or "fetch failed"


def _has_real_product_data(text):
    """페이지에 실제 상품 데이터가 있는지 간단 체크 (JS 렌더링 사이트는 보통 빈 페이지)"""
    if not text or len(text) < 500:
        return False
    # 가격 표기 패턴 (최소 5개 이상의 가격이 있어야 실제 상품 리스트로 봄)
    price_patterns = re.findall(r"(?:USD|EUR|KRW|₩|\$|€|£)\s*\d{2,}", text)
    if len(price_patterns) >= 5:
        return True
    # 숫자+%+off 패턴
    discount_patterns = re.findall(r"\d{2,3}\s*%\s*(?:off|할인|OFF)", text, re.I)
    if len(discount_patterns) >= 3:
        return True
    return False


def analyze_with_openai(url, page_text):
    """OpenAI로 페이지 분석 → 세일 품목 JSON"""
    if not OPENAI_API_KEY:
        return {"error": "OPENAI_API_KEY not set"}

    # 환각 방지: 실제 데이터 없으면 바로 empty 반환
    if not _has_real_product_data(page_text):
        return {
            "site": url.split("/")[2] if "//" in url else url,
            "url": url,
            "found_count": 0,
            "items": [],
            "_note": "페이지에 상품 데이터 거의 없음 (JS 렌더링 사이트 가능성). AI 호출 생략.",
        }

    prompt = f"""
아래 텍스트는 명품/패션 세일 사이트 페이지입니다.

내 관심 브랜드: {', '.join(sorted(ROWNA_BRANDS))}

작업:
1. 위 관심 브랜드만 필터링
2. 할인율 50% 이상만 포함
3. JSON으로 구조화

중요 규칙:
- 텍스트에 실제로 있는 상품만 추출. 모르거나 보이지 않으면 items 빈 배열 반환.
- 품번·URL·가격을 발명하지 말 것. 텍스트에 없으면 null/빈값.
- 브랜드명이 명확히 보이지 않으면 해당 항목 제외.

JSON 형식:
{{
  "site": "사이트 이름 (텍스트에서 추정 가능하면)",
  "url": "{url}",
  "found_count": 실제_추출한_개수,
  "items": [
    {{
      "brand": "브랜드명 (소문자)",
      "name": "상품명 (텍스트에 있는 그대로)",
      "original_price": "원가 (텍스트에 보이는 그대로)",
      "sale_price": "세일가",
      "discount_pct": 할인율_숫자,
      "url": "상품 상세 URL (있으면)",
      "notes": "참고 (사이즈, 색상 등 보이는 대로)"
    }}
  ]
}}

페이지 텍스트:
```
{page_text[:30000]}
```
"""

    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 4000,
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        r = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers, json=payload, timeout=60,
        )
    except Exception as e:
        return {"error": f"OpenAI request failed: {e}"}

    if r.status_code != 200:
        return {"error": f"OpenAI status {r.status_code}: {r.text[:300]}"}

    try:
        data = r.json()
        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text)
        return parsed
    except Exception as e:
        return {"error": f"parse fail: {e}"}


def build_report(url, parsed):
    """Gmail 본문 작성"""
    site = parsed.get("site", "?")
    items = parsed.get("items", [])

    lines = []
    lines.append(f"🔥 {site} 세일 분석 (로우나 타겟 {len(items)}건)")
    lines.append(f"🔗 {url}")
    lines.append("")
    lines.append("=" * 50)

    # TOP_PRIORITY 먼저
    prio = [it for it in items if it.get("brand", "").lower() in TOP_PRIORITY]
    rest = [it for it in items if it.get("brand", "").lower() not in TOP_PRIORITY]
    # 할인율 기준 정렬
    prio.sort(key=lambda x: x.get("discount_pct", 0), reverse=True)
    rest.sort(key=lambda x: x.get("discount_pct", 0), reverse=True)

    def dump(group_name, group):
        if not group:
            return
        lines.append(f"\n[{group_name}]")
        for i, it in enumerate(group, 1):
            brand = it.get("brand", "").upper()
            name = it.get("name", "")[:60]
            disc = it.get("discount_pct", 0)
            orig = it.get("original_price", "-")
            sale = it.get("sale_price", "-")
            lines.append(f"  {i}. {brand} - {name}")
            lines.append(f"     {disc}% off | {orig} → {sale}")
            if it.get("url"):
                lines.append(f"     {it['url']}")
            if it.get("notes"):
                lines.append(f"     💡 {it['notes']}")

    dump("⭐ 핵심 타겟 (매입 자주)", prio)
    dump("추가 타겟", rest)

    if not items:
        lines.append("\n⚠ 로우나 타겟 브랜드 50%+ 세일 없음.")
        lines.append("(사이트가 JS 렌더링이거나 페이지 구조가 특이할 수 있음)")

    lines.append("")
    lines.append("=" * 50)
    lines.append(f"🕐 분석: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("url", help="세일 사이트 URL")
    args = p.parse_args()

    print(f"Playwright 설치: {'OK' if playwright_available() else '없음 (requests 폴백)'}")
    print(f"[1/3] URL 가져오는 중: {args.url[:80]}")
    text, err = extract_page_text(args.url)
    if err:
        print(f"❌ 페이지 가져오기 실패: {err}")
        notify_send("세일 URL 분석 실패", f"URL: {args.url}\n에러: {err}")
        return

    print(f"[2/3] OpenAI 분석 중 ({len(text)}자)")
    parsed = analyze_with_openai(args.url, text)
    if parsed.get("error"):
        print(f"❌ 분석 실패: {parsed['error']}")
        notify_send("세일 URL 분석 실패", f"URL: {args.url}\n에러: {parsed['error']}")
        return

    print(f"[3/3] Gmail 발송")
    site = parsed.get("site", "?")
    count = len(parsed.get("items", []))
    subject = f"{site} 세일 로우나 타겟 {count}건"
    body = build_report(args.url, parsed)
    notify_send(subject, body)

    print(f"✅ 완료 - {count}건 발견. Gmail 확인.")


if __name__ == "__main__":
    main()

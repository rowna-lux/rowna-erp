"""
크림 도매 리스트 사진 자동 분석기 (클립보드 감시형)

사용법:
1. pip install pillow requests python-dotenv plyer
2. scripts/.env 에 OPENAI_API_KEY 설정 (GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_TO 재사용)
3. python scripts/kream_wholesale/watcher.py

동작:
- 1초마다 클립보드 감시
- 새 이미지 감지 → OpenAI Vision으로 도매 리스트 분석 → 크림 시세 조회 → Gmail + 바탕화면 알림

수동 실행:
- python scripts/kream_wholesale/watcher.py --file <image.png>  (파일 직접 분석)
- python scripts/kream_wholesale/watcher.py --test              (설정만 체크)
"""
import os
import sys
import time
import hashlib
import io
import argparse
from datetime import datetime
from pathlib import Path

# scripts/ sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from PIL import ImageGrab, Image
    from common.notify import send as notify_send
    from kream_wholesale.analyzer import analyze_image
    from kream_wholesale.kream_api import enrich_items
except ImportError as e:
    print(f"[설치 필요] pip install pillow requests python-dotenv plyer")
    print(f"import 실패: {e}")
    sys.exit(1)

# Windows 토스트 알림 (선택)
_toast_available = False
try:
    from plyer import notification as plyer_notif
    _toast_available = True
except ImportError:
    pass


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def format_won(n):
    if n is None:
        return "-"
    try:
        return f"₩{int(n):,}"
    except (ValueError, TypeError):
        return str(n)


def build_report(parsed):
    """분석 결과 → 메일 본문 (plain text)"""
    vendor = parsed.get("vendor", "알 수 없음")
    date = parsed.get("date", "")
    trade_type = parsed.get("trade_type", "")
    notes = parsed.get("notes", "")
    items = parsed.get("items", [])

    lines = []
    lines.append(f"📋 {vendor} 도매 리스트 ({date}) · {trade_type}")
    if notes:
        lines.append(f"ℹ {notes}")
    lines.append("")
    lines.append("=" * 50)

    # 상품별 분석
    recommended_count = 0
    recommended_profit_total = 0
    for i, it in enumerate(items, 1):
        name = it.get("name", "")
        brand = it.get("brand", "")
        sku = it.get("sku", "")
        size = it.get("size", "")
        qty = it.get("qty", 0)
        price = it.get("price", 0)
        subtotal = it.get("subtotal", 0)
        kream_url = it.get("kream_url", "")

        lines.append(f"\n[{i}] {brand} {name}")
        lines.append(f"    품번: {sku} | 사이즈: {size} | 수량: {qty}개")
        lines.append(f"    매입: {format_won(price)}/개 (합계 {format_won(subtotal)})")

        kream = it.get("kream") or {}
        profit = it.get("profit") or {}
        if kream.get("ok"):
            lines.append(f"    크림시세: {format_won(kream['price'])}")
            if profit:
                lines.append(
                    f"    정산가: {format_won(profit['settle_price'])} "
                    f"(수수료 6%+2,500)"
                )
                lines.append(
                    f"    예상수익: {format_won(profit['profit'])}/개 "
                    f"({profit['profit_rate']}%) {profit['verdict']}"
                )
                if profit['verdict'] in ("✅ 매입 추천", "👍 매입 가능"):
                    recommended_count += 1
                    recommended_profit_total += profit['profit'] * qty
        else:
            err = kream.get("error", "")
            lines.append(f"    크림시세: ❌ 조회 실패 ({err})")
        if kream_url:
            lines.append(f"    {kream_url}")

    lines.append("")
    lines.append("=" * 50)
    lines.append(f"📊 총 {parsed.get('total_qty', 0)}개 · 매입 {format_won(parsed.get('total_price', 0))}")
    lines.append(f"👍 매입 가능 {recommended_count}건 · 예상 총 수익 {format_won(recommended_profit_total)}")
    lines.append("")
    lines.append(f"🕐 분석 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    return "\n".join(lines)


def build_subject(parsed):
    vendor = parsed.get("vendor", "도매")
    date = parsed.get("date", "")
    items_count = len(parsed.get("items", []))
    return f"{vendor} 도매 리스트 {items_count}건 · {date}"


def process_image(image_bytes, source="clipboard"):
    """이미지 분석 + 알림 발송"""
    log(f"📸 이미지 분석 시작 ({source})")

    # 1. OpenAI Vision 분석
    parsed = analyze_image(image_bytes)
    if parsed.get("error"):
        log(f"❌ OpenAI 분석 실패: {parsed['error']}")
        notify_send("도매 리스트 분석 실패", f"에러: {parsed['error']}")
        return

    items_count = len(parsed.get("items", []))
    log(f"✓ OpenAI 분석 완료: {items_count}개 품목")

    # 2. 크림 시세 조회
    log("🔍 크림 시세 조회 중...")
    parsed["items"] = enrich_items(parsed["items"], delay=0.5)

    # 3. 리포트 작성
    body = build_report(parsed)
    subject = build_subject(parsed)

    # 4. Gmail + 토스트
    log(f"📬 Gmail 발송: {subject}")
    notify_send(subject, body)

    if _toast_available:
        try:
            plyer_notif.notify(
                title=f"[로우나] {subject}",
                message=f"{items_count}개 품목 분석 완료 - Gmail 확인",
                timeout=10,
            )
        except Exception as e:
            log(f"토스트 알림 실패 (무시 가능): {e}")

    log("✅ 완료")


def watch_clipboard():
    """클립보드 무한 감시"""
    log("👁 클립보드 감시 시작 (Ctrl+C로 중단)")
    log("💡 카톡에서 도매 사진 우클릭 → '사진 복사' 하세요")
    log("")
    last_hash = None

    while True:
        try:
            img = ImageGrab.grabclipboard()
            if img and isinstance(img, Image.Image):
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                data = buf.getvalue()
                h = hashlib.md5(data).hexdigest()
                if h != last_hash:
                    last_hash = h
                    process_image(data, source="clipboard")
                    log("👁 다음 이미지 대기 중...")
        except Exception as e:
            log(f"⚠ 감시 루프 에러: {e}")
        time.sleep(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="이미지 파일 직접 분석")
    parser.add_argument("--test", action="store_true", help="설정 체크만")
    args = parser.parse_args()

    # 설정 체크
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    gemini_fallback = os.getenv("GEMINI_API_KEY", "").strip()
    # 폴백: 옛 .env에서 GEMINI_API_KEY 자리에 sk-* 넣어뒀을 수 있음
    if not openai_key and gemini_fallback.startswith("sk-"):
        openai_key = gemini_fallback
    gmail_user = os.getenv("GMAIL_USER", "")
    print(f"OPENAI_API_KEY: {'(설정됨)' if openai_key else '(미설정 ❌)'}")
    print(f"GMAIL_USER: {gmail_user or '(미설정 ❌)'}")
    print(f"토스트 알림: {'OK' if _toast_available else '(plyer 미설치, Gmail만 사용)'}")

    if args.test:
        if openai_key and gmail_user:
            print("\n✅ 설정 OK. 바로 감시 시작 가능.")
        else:
            print("\n❌ 설정 부족. .env 확인.")
        return

    if not openai_key:
        print("\n❌ OPENAI_API_KEY 미설정. scripts/.env 에 추가 필요.")
        return

    if args.file:
        with open(args.file, "rb") as f:
            process_image(f.read(), source=args.file)
    else:
        watch_clipboard()


if __name__ == "__main__":
    main()

"""
스마트스토어 리뷰 자동 요청 (대표님 요청 2026-11-22)

네이버 커머스 API로 배송완료 D+7 고객 리스트 → 리뷰 요청 알림톡/문자 자동 발송.
네이버 쇼핑 상위 노출을 위해 리뷰 수 증가가 핵심.

사용법:
1. pip install requests python-dotenv
2. .env 파일:
   NAVER_COMMERCE_CLIENT_ID=xxx
   NAVER_COMMERCE_CLIENT_SECRET=xxx
   ALIMTALK_API_KEY=xxx  (알리고/카카오비즈·네이버웍스 중 선택)
3. python review_request.py          → 1회 실행
4. python review_request.py --loop   → 매일 1회 (cron)

리뷰 유도 방법 2가지:
A. 알림톡/문자 (즉시, 유료 20~30원/건)
B. 네이버 톡톡 메시지 (무료, 네이버 커머스 API)

이 스크립트는 B(네이버 톡톡) 우선 사용. A는 옵션.

TODO:
- 네이버 커머스 API 인증 (client_id/secret)
- 주문 조회 API (배송완료 D+7 필터)
- 네이버 톡톡 발송 API
"""
import os, sys, time, json, argparse
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests
    from dotenv import load_dotenv
except ImportError:
    print("[설치 필요] pip install requests python-dotenv")
    sys.exit(1)

load_dotenv()

# ===== 설정 =====
CLIENT_ID = os.getenv("NAVER_COMMERCE_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("NAVER_COMMERCE_CLIENT_SECRET", "")
BASE = "https://api.commerce.naver.com/external"
SENT_FILE = Path(__file__).parent / "sent_review_requests.json"

# 리뷰 요청 메시지 템플릿
MESSAGE_TPL = """안녕하세요 {buyer_name}님!
로우나명품에서 {product_name} 주문해주셔서 감사합니다.

상품은 만족스럽게 받으셨나요?

소중한 리뷰 하나가 로우나에게 큰 힘이 됩니다.
포토 리뷰 작성 시 포인트 적립 혜택이 있어요!

👉 리뷰 작성 바로가기
https://smartstore.naver.com/lowna/myOrders

감사합니다 :)"""


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def get_token():
    """네이버 커머스 API 액세스 토큰 발급"""
    if not CLIENT_ID or not CLIENT_SECRET:
        log("⚠ NAVER_COMMERCE_CLIENT_ID/SECRET 미설정")
        return None
    import bcrypt
    ts = int(time.time() * 1000)
    pw = f"{CLIENT_ID}_{ts}"
    hashed = bcrypt.hashpw(pw.encode(), CLIENT_SECRET.encode()).decode()
    import base64
    signature = base64.b64encode(hashed.encode()).decode()
    r = requests.post(f"{BASE}/v1/oauth2/token", data={
        "client_id": CLIENT_ID,
        "timestamp": ts,
        "client_secret_sign": signature,
        "grant_type": "client_credentials",
        "type": "SELF",
    })
    if r.status_code == 200:
        return r.json().get("access_token")
    log(f"토큰 발급 실패: {r.status_code} {r.text[:200]}")
    return None


def fetch_delivered_orders(token, days_ago=7):
    """배송완료 D+N (기본 7일 전) 주문 조회"""
    target = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S.000+09:00")
    r = requests.get(
        f"{BASE}/v1/pay-order/seller/product-orders",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "lastChangedType": "DELIVERED",
            "from": target,
            "to": target[:-9] + "T23:59:59.000+09:00",
        },
    )
    if r.status_code != 200:
        log(f"주문 조회 실패: {r.status_code}")
        return []
    data = r.json()
    return data.get("data", {}).get("contents", [])


def send_talktalk(token, order_id, buyer_id, message):
    """네이버 톡톡 메시지 발송 (TODO: 정확한 API 엔드포인트 확인 필요)

    주의: 네이버 톡톡 API는 2026년 기준 별도 인증 필요할 수 있음.
    대안: 네이버 스마트스토어 > 알림톡 설정에서 '배송완료 N일 후 자동 알림톡' 기능 활용 (유료)
    """
    # 임시 로그만
    log(f"📨 리뷰 요청 (미전송): 주문 {order_id} · 구매자 {buyer_id} · {message[:30]}")
    return False


def load_sent():
    if not SENT_FILE.exists():
        return set()
    try:
        return set(json.loads(SENT_FILE.read_text()))
    except Exception:
        return set()


def save_sent(s):
    SENT_FILE.write_text(json.dumps(list(s)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7, help="배송완료 N일 후")
    parser.add_argument("--loop", action="store_true", help="매일 1회 (cron 대신)")
    args = parser.parse_args()

    if args.loop:
        log("🔄 매일 1회 실행. Ctrl+C로 중단")
        while True:
            try:
                run_once(args.days)
            except Exception as e:
                log(f"에러: {e}")
            # 다음 날 09시까지 대기
            now = datetime.now()
            next_run = now.replace(hour=9, minute=0, second=0) + timedelta(days=1)
            if now.hour < 9:
                next_run = now.replace(hour=9, minute=0, second=0)
            wait_sec = (next_run - now).total_seconds()
            log(f"😴 다음 실행: {next_run.strftime('%m-%d %H:%M')} ({wait_sec//3600:.0f}시간 뒤)")
            time.sleep(wait_sec)
    else:
        run_once(args.days)


def run_once(days):
    token = get_token()
    if not token:
        log("API 인증 실패. 아래 안내:")
        log("1. 네이버 커머스 API 가입: https://apicenter.commerce.naver.com/")
        log("2. 스마트스토어 센터 > 판매자정보 > 제휴·연동 > 상품연동 신청")
        log("3. CLIENT_ID, CLIENT_SECRET을 .env에 저장")
        return
    orders = fetch_delivered_orders(token, days)
    log(f"📦 배송완료 D+{days} 주문: {len(orders)}건")
    sent = load_sent()
    new_sent = 0
    for order in orders:
        o = order.get("productOrder", {})
        order_id = o.get("productOrderId", "")
        if order_id in sent:
            continue
        buyer_name = o.get("ordererName", "")
        product_name = o.get("productName", "")
        buyer_id = o.get("ordererId", "")
        msg = MESSAGE_TPL.format(buyer_name=buyer_name, product_name=product_name[:30])
        if send_talktalk(token, order_id, buyer_id, msg):
            sent.add(order_id)
            new_sent += 1
        time.sleep(1)  # API rate limit
    save_sent(sent)
    log(f"✅ 리뷰 요청 발송: {new_sent}건 (중복 제외)")


if __name__ == "__main__":
    main()

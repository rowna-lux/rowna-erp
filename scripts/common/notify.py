"""
로우나 자동화 공용 알림 모듈 (Gmail SMTP)
텔레그램 플러드 차단 이슈로 Gmail로 전환 (2026-11-24).

.env 설정 필수:
    GMAIL_USER=shinmy777@gmail.com
    GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx  (공백 제거한 16자리)
    GMAIL_TO=shinmy777@gmail.com         (받을 주소, 보통 본인)

사용:
    from common.notify import send
    send("블프 세일 발견", "Stone Island 60% - https://...")
"""
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formatdate
from datetime import datetime
from pathlib import Path

try:
    from dotenv import load_dotenv
    # .env는 scripts/.env (notify.py의 부모의 부모)
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

GMAIL_USER = os.getenv("GMAIL_USER", "").strip()
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
GMAIL_TO = os.getenv("GMAIL_TO", GMAIL_USER).strip()

# 로그 파일 (알림 실패해도 여기엔 항상 쌓음)
LOG_FILE = Path(__file__).parent.parent / "notify.log"


def _log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def send(subject, body, html=False):
    """
    Gmail SMTP로 알림 메일 발송.
    subject: 메일 제목 ([로우나] 자동 prefix 추가됨)
    body: 본문 (평문 또는 HTML)
    html: True면 HTML 메일, False면 평문 (기본 평문)
    반환: True 성공 / False 실패
    """
    # 설정 체크
    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        _log(f"⚠ Gmail 미설정 - .env 확인 필요. [제목] {subject}")
        _log(f"[본문] {body[:200]}")
        return False

    # 제목 prefix
    full_subject = f"[로우나] {subject}"

    # MIME 구성
    msg = MIMEMultipart("alternative")
    msg["Subject"] = full_subject
    msg["From"] = GMAIL_USER
    msg["To"] = GMAIL_TO
    msg["Date"] = formatdate(localtime=True)

    mime_type = "html" if html else "plain"
    msg.attach(MIMEText(body, mime_type, "utf-8"))

    # SMTP 발송 (3회 재시도)
    for attempt in range(3):
        try:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx, timeout=15) as smtp:
                smtp.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                smtp.sendmail(GMAIL_USER, [GMAIL_TO], msg.as_string())
            _log(f"✅ 메일 발송 성공: {full_subject}")
            return True
        except smtplib.SMTPAuthenticationError as e:
            _log(f"❌ Gmail 인증 실패 (앱 비번 확인): {e}")
            return False  # 인증 실패는 재시도 무의미
        except Exception as e:
            _log(f"⚠ 메일 발송 실패 (시도 {attempt + 1}/3): {e}")
            if attempt < 2:
                import time
                time.sleep(5)

    _log(f"❌ 메일 발송 최종 실패: {full_subject}")
    return False


def test():
    """설정 테스트 — 테스트 메일 발송"""
    print(f"GMAIL_USER: {GMAIL_USER or '(미설정)'}")
    print(f"GMAIL_APP_PASSWORD: {'(설정됨)' if GMAIL_APP_PASSWORD else '(미설정)'}")
    print(f"GMAIL_TO: {GMAIL_TO or '(미설정)'}")
    print()
    print("테스트 메일 발송 중...")
    ok = send(
        "자동화 알림 테스트",
        f"로우나 자동화 알림 테스트입니다.\n\n발송 시각: {datetime.now()}\n\n이 메일이 보이면 Gmail 알림 설정 완료입니다."
    )
    if ok:
        print()
        print(f"✅ 성공! {GMAIL_TO} 받은편지함 확인하세요.")
        print(f"📱 핸드폰 Gmail 앱에도 푸시 알림이 왔는지 확인.")
    else:
        print()
        print("❌ 실패. .env 설정 확인 필요.")


if __name__ == "__main__":
    test()

"""
자동화 상태 체크 스크립트
현재 세팅 상태 확인 + 간단 진단 → Gmail 발송

사용법:
    python scripts/status_check.py           # 상태 확인 + Gmail 발송
    python scripts/status_check.py --quiet   # 발송 없이 콘솔만
"""
import os
import sys
import argparse
import platform
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    from common.notify import send as notify_send
except ImportError as e:
    print(f"import 실패: {e}")
    sys.exit(1)


def check():
    results = {}

    # 1. 환경 변수
    checks = {
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", "") or
            (os.getenv("GEMINI_API_KEY", "").startswith("sk-") and os.getenv("GEMINI_API_KEY", "")),
        "GMAIL_USER": os.getenv("GMAIL_USER", ""),
        "GMAIL_APP_PASSWORD": os.getenv("GMAIL_APP_PASSWORD", ""),
        "GMAIL_TO": os.getenv("GMAIL_TO", "") or os.getenv("GMAIL_USER", ""),
    }
    env_lines = []
    for k, v in checks.items():
        status = "✅ 설정됨" if v else "❌ 미설정"
        env_lines.append(f"  {k}: {status}")
    results["환경변수"] = env_lines

    # 2. 파이썬 패키지
    pkg_lines = []
    for pkg in ["requests", "bs4", "PIL", "dotenv", "plyer"]:
        try:
            __import__(pkg.replace("PIL", "PIL.Image") if pkg == "PIL" else pkg)
            pkg_lines.append(f"  {pkg}: ✅")
        except ImportError:
            pkg_lines.append(f"  {pkg}: ❌ 설치 필요")
    results["패키지"] = pkg_lines

    # 3. 스크립트 존재 여부
    scripts_dir = Path(__file__).parent
    script_lines = []
    scripts = [
        "blackfriday/bf_monitor.py",
        "blackfriday/url_analyzer.py",
        "japan/japan_monitor.py",
        "kream_wholesale/watcher.py",
        "kream_wholesale/analyzer.py",
        "common/notify.py",
    ]
    for s in scripts:
        exists = (scripts_dir / s).exists()
        script_lines.append(f"  {s}: {'✅' if exists else '❌'}")
    results["스크립트"] = script_lines

    # 4. 로그 파일 체크
    log_lines = []
    notify_log = scripts_dir / "notify.log"
    if notify_log.exists():
        try:
            tail = notify_log.read_text(encoding="utf-8").strip().split("\n")[-5:]
            log_lines.append(f"  notify.log (마지막 5줄):")
            for line in tail:
                log_lines.append(f"    {line[:80]}")
        except Exception:
            log_lines.append(f"  notify.log: 읽기 실패")
    else:
        log_lines.append(f"  notify.log: 아직 없음")
    results["로그"] = log_lines

    # 5. 시스템 정보
    sys_lines = [
        f"  PC: {platform.node()}",
        f"  Python: {sys.version.split()[0]}",
        f"  작업디렉터리: {os.getcwd()}",
        f"  현재시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
    ]
    results["시스템"] = sys_lines

    return results


def render(results):
    lines = ["🔍 로우나 자동화 상태 체크\n"]
    for section, items in results.items():
        lines.append(f"━━━ {section} ━━━")
        lines.extend(items)
        lines.append("")
    return "\n".join(lines)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--quiet", action="store_true", help="Gmail 발송 생략")
    args = p.parse_args()

    results = check()
    text = render(results)
    print(text)

    if not args.quiet:
        notify_send("자동화 상태 체크", text)


if __name__ == "__main__":
    main()

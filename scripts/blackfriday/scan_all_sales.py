"""
블프 일괄 스캔 (2026-11-25 신규)

주요 세일 사이트를 한 번에 돌려서 로우나 타겟 발견 → Gmail 각각 발송.
사용자가 아침에 한 번 돌리면 각 사이트별 상태를 모두 받아볼 수 있음.

사용법:
    python scripts/blackfriday/scan_all_sales.py

주의:
- 각 사이트 사이에 랜덤 딜레이 (차단 방지)
- 사이트별 1회만 호출 (bf_monitor와 별개)
- 소요 시간: 2~5분, OpenAI 비용 약 ₩10~15
"""
import os
import sys
import time
import random
import subprocess
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from common.notify import send as notify_send
except ImportError:
    print("notify 모듈 없음")
    sys.exit(1)

# 블프·연중 세일 주요 사이트
SALE_SITES = [
    # 여성
    ("SSENSE 여성", "https://www.ssense.com/en-us/women/sale"),
    ("Mytheresa 여성", "https://www.mytheresa.com/en-us/sale"),
    ("NAP 여성", "https://www.net-a-porter.com/en-us/shop/sale/clothing"),
    ("24S", "https://www.24s.com/en-us/sale-all"),
    # 남성
    ("SSENSE 남성", "https://www.ssense.com/en-us/men/sale"),
    ("MR PORTER 남성", "https://www.mrporter.com/en-us/mens/sale"),
    # 종합/백화점
    ("Farfetch 여성", "https://www.farfetch.com/sale/women/items.aspx"),
    ("Farfetch 남성", "https://www.farfetch.com/sale/men/items.aspx"),
    # 한국
    ("29CM 세일", "https://shop.29cm.co.kr/sale"),
    ("W컨셉 세일", "https://www.wconcept.co.kr/Sale"),
]


def main():
    print(f"🔍 {len(SALE_SITES)}개 사이트 일괄 스캔 시작")
    url_analyzer = Path(__file__).parent / "url_analyzer.py"

    success = 0
    fail = 0
    results = []

    for i, (name, url) in enumerate(SALE_SITES, 1):
        print(f"\n[{i}/{len(SALE_SITES)}] {name}")
        print(f"  {url}")
        try:
            # 각 URL analyzer 실행 (Playwright 렌더링 포함, 타임아웃 넉넉히)
            r = subprocess.run(
                [sys.executable, str(url_analyzer), url],
                capture_output=True, text=True, timeout=180,
                encoding="utf-8", errors="replace",
            )
            if r.returncode == 0:
                success += 1
                print(f"  ✅ 완료")
                results.append((name, "OK"))
            else:
                fail += 1
                err = r.stderr[-200:] if r.stderr else "unknown"
                print(f"  ❌ 실패: {err[:100]}")
                results.append((name, f"FAIL: {err[:100]}"))
        except subprocess.TimeoutExpired:
            fail += 1
            print(f"  ⏰ 타임아웃")
            results.append((name, "TIMEOUT"))
        except Exception as e:
            fail += 1
            print(f"  ❌ 에러: {e}")
            results.append((name, f"ERR: {e}"))

        # 사이트 간 대기 (차단 방지)
        if i < len(SALE_SITES):
            wait = random.uniform(10, 25)
            print(f"  😴 {wait:.0f}초 대기...")
            time.sleep(wait)

    # 요약 메일
    body_lines = [
        f"🔍 블프 일괄 스캔 완료",
        f"",
        f"성공: {success} / 실패: {fail} / 전체: {len(SALE_SITES)}",
        f"",
        "=" * 40,
    ]
    for name, status in results:
        icon = "✅" if status == "OK" else "❌"
        body_lines.append(f"{icon} {name}: {status[:60]}")

    body_lines.append("")
    body_lines.append("상세 결과: 각 사이트별 분석 메일 참고")
    body_lines.append("(로우나 타겟 0건이면 '분석 실패' 메일만 올 수도 있음)")

    notify_send(f"블프 일괄 스캔 완료 ({success}/{len(SALE_SITES)})", "\n".join(body_lines))
    print(f"\n{'=' * 40}")
    print(f"완료: {success} 성공, {fail} 실패. 요약 메일 발송 완료.")


if __name__ == "__main__":
    main()

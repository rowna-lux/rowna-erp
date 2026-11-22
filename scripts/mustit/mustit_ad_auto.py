"""
머스트잇 그로스패키지 광고 자동 등록 (대표님 요청 2026-11-22)

ERP의 "광고 후보 CSV" (반품 0건 + 매출 중상위 Top 20) → 머스트잇 그로스패키지 광고 자동 등록.

사용법:
1. pip install selenium webdriver-manager pandas
2. 처음 1회만: python mustit_ad_auto.py --login → 수동 로그인 → 쿠키 저장
3. ERP에서 광고 후보 CSV 다운로드 → scripts/mustit/candidates.csv 로 저장
4. python mustit_ad_auto.py → 자동으로 광고 등록

주의:
- 머스트잇 셀러센터 UI 변경 시 selector 업데이트 필요
- 2026-11 기준 구조. 변경되면 driver.save_screenshot()으로 확인 후 수정
- AD 포인트 확인 필수 (잔액 없으면 등록 실패)
- 광고비 상한선 설정 권장 (실수 방지)

TODO: 머스트잇 셀러센터 로그인 → 광고 메뉴 경로 확인 → 상품 선택 UI 파악
→ 이거 user가 1번만 수동으로 광고 등록 흐름 녹화해서 보내주면 selector 확정 가능
→ 그 전까지는 "광고 등록 페이지 열기 + CSV 상품 리스트 표시" 까지만 자동화
"""
import os, sys, json, time, random, pickle, argparse
from datetime import datetime
from pathlib import Path

try:
    import pandas as pd
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    print("[설치 필요] pip install selenium webdriver-manager pandas")
    sys.exit(1)

# ===== 설정 =====
BASE_DIR = Path(__file__).parent
CSV_FILE = BASE_DIR / "candidates.csv"
COOKIE_FILE = BASE_DIR / "mustit_cookies.pkl"
MAX_AD_BUDGET_PER_PRODUCT = 2000  # 상품당 최대 AD 포인트 (안전)
MUSTIT_SELLER_URL = "https://seller.mustit.co.kr"  # 2026 기준
LOG_FILE = BASE_DIR / f"ad_log_{datetime.now().strftime('%Y%m%d')}.txt"


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    LOG_FILE.open("a", encoding="utf-8").write(line + "\n")


def make_driver():
    options = Options()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_argument("--window-size=1400,900")
    options.add_argument("--lang=ko-KR")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def login_and_save(driver):
    log("머스트잇 셀러센터 → 수동 로그인하세요")
    driver.get(MUSTIT_SELLER_URL)
    log("⏳ 로그인 완료 후 Enter")
    input()
    pickle.dump(driver.get_cookies(), COOKIE_FILE.open("wb"))
    log(f"✅ 쿠키 저장: {COOKIE_FILE}")


def load_cookies(driver):
    if not COOKIE_FILE.exists():
        log("쿠키 없음. --login 먼저 실행")
        return False
    driver.get(MUSTIT_SELLER_URL)
    time.sleep(2)
    for c in pickle.load(COOKIE_FILE.open("rb")):
        try:
            driver.add_cookie(c)
        except Exception:
            pass
    driver.get(MUSTIT_SELLER_URL + "/dashboard")  # 또는 광고 메뉴 URL
    time.sleep(3)
    if "login" in driver.current_url.lower():
        log("쿠키 만료. 재로그인 필요")
        return False
    return True


def load_candidates():
    if not CSV_FILE.exists():
        log(f"CSV 없음: {CSV_FILE}")
        log("ERP > 분석 > 반품률 분석 > 📥 CSV 다운로드 → 여기에 candidates.csv 로 저장")
        return []
    df = pd.read_csv(CSV_FILE)
    return df.to_dict("records")


def register_ad_for_product(driver, product):
    """TODO: 머스트잇 광고 등록 흐름 (user 수동 녹화 후 구체화)
    예상 흐름:
    1. 광고 > 그로스패키지 > 신규 등록
    2. 상품 검색 (품번 or 상품명)
    3. 광고 기간 선택 (7일)
    4. 노출 포지션 / 입찰가 선택
    5. 등록
    """
    log(f"[미완성] 상품 등록 예정: {product.get('상품명', '')[:30]} (품번: {product.get('품번', '')})")
    # 현재는 콘솔 로그만. user 수동 녹화 후 selenium 코드 작성.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--login", action="store_true")
    args = parser.parse_args()

    driver = make_driver()
    try:
        if args.login:
            login_and_save(driver)
            return

        if not load_cookies(driver):
            return

        candidates = load_candidates()
        if not candidates:
            return
        log(f"📋 광고 후보 {len(candidates)}개 로드")

        for p in candidates[:10]:  # 하루 최대 10개
            register_ad_for_product(driver, p)
            time.sleep(random.uniform(3, 7))

        log("⚠ 현재 '광고 등록 흐름' 구현 전. user 수동 녹화 필요:")
        log("1. 머스트잇 셀러센터 광고 등록 화면 캡처")
        log("2. 등록 과정 1회 수동으로 해보고 → 각 버튼·입력 필드 screenshot")
        log("3. 전달하면 바로 selenium 코드 완성 가능")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()

"""
네이버 블로그 자동 업로드 (대표님 요청 2026-11-22)

사용법:
1. pip install selenium webdriver-manager
2. 처음 1회만: python upload_blog.py --login  → 수동 로그인 → 쿠키 저장
3. 이후: python upload_blog.py  → to_upload/ 폴더의 글 자동 발행

폴더 구조:
  rowna_blog_auto/
    ├── to_upload/        ← 발행 대기 중인 글 (여기서 꺼냄)
    │   ├── 20261122_01/
    │   │   ├── post.json  ← {title, body_html, tags: ["샤넬", "지갑"]}
    │   │   └── images/    ← 본문에 넣을 이미지들
    ├── archive/          ← 발행 완료된 글 (여기로 이동)
    ├── failed/           ← 발행 실패 글 (여기로 이동 + error.log)
    └── cookies.pkl       ← 네이버 로그인 쿠키

주의:
- 네이버 블로그는 Selenium 자동화 감지해서 막는 경우 있음 → 랜덤 딜레이 넣음
- 하루 최대 5개까지만 발행 (더 많으면 스팸으로 분류될 위험)
- 글쓰기 UI가 변경되면 수정 필요 (2026-11 기준)
"""
import os, sys, json, time, random, pickle, shutil, argparse, re
from datetime import datetime
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import TimeoutException, NoSuchElementException
    from webdriver_manager.chrome import ChromeDriverManager
except ImportError:
    print("[설치 필요] pip install selenium webdriver-manager")
    sys.exit(1)

# ===== 설정 =====
BASE_DIR = Path(r"C:\Users\ADMIN\Downloads\로우나_AI작업\rowna_blog_auto")
TO_UPLOAD = BASE_DIR / "to_upload"
ARCHIVE = BASE_DIR / "archive"
FAILED = BASE_DIR / "failed"
COOKIE_FILE = BASE_DIR / "cookies.pkl"
BLOG_ID = "shinmy6"  # blog.naver.com/shinmy6
MAX_POSTS_PER_RUN = 3  # 한 번 실행 시 최대 발행 수 (하루 1~2개 권장)
WAIT_MIN = 3
WAIT_MAX = 8

# 폴더 자동 생성
for d in [TO_UPLOAD, ARCHIVE, FAILED]:
    d.mkdir(parents=True, exist_ok=True)


def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def wait(a=None, b=None):
    """랜덤 딜레이 (자동화 감지 회피)"""
    a = a or WAIT_MIN
    b = b or WAIT_MAX
    time.sleep(random.uniform(a, b))


def make_driver(headless=False):
    options = Options()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1400,900")
    options.add_argument("--lang=ko-KR")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36")
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def login_and_save_cookies(driver):
    log("네이버 로그인 페이지로 이동... 수동으로 로그인하세요")
    driver.get("https://nid.naver.com/nidlogin.login")
    log("⏳ 로그인 완료되면 Enter 눌러주세요 (자동으로 쿠키 저장됨)")
    input()
    pickle.dump(driver.get_cookies(), COOKIE_FILE.open("wb"))
    log(f"✅ 쿠키 저장: {COOKIE_FILE}")


def load_cookies(driver):
    if not COOKIE_FILE.exists():
        log(f"❌ 쿠키 파일 없음: {COOKIE_FILE}")
        log("처음 1회 실행 필요: python upload_blog.py --login")
        return False
    driver.get("https://www.naver.com")
    wait(1, 2)
    for cookie in pickle.load(COOKIE_FILE.open("rb")):
        try:
            driver.add_cookie(cookie)
        except Exception as e:
            pass
    driver.get("https://blog.naver.com/" + BLOG_ID)
    wait(2, 4)
    # 로그인 유지 확인
    if "login" in driver.current_url.lower():
        log("❌ 쿠키 만료됨. 재로그인 필요: python upload_blog.py --login")
        return False
    log("✅ 로그인 유지됨")
    return True


def pending_posts():
    """to_upload/ 안의 각 폴더 = 1개 글"""
    if not TO_UPLOAD.exists():
        return []
    posts = []
    for d in sorted(TO_UPLOAD.iterdir()):
        if not d.is_dir():
            continue
        meta = d / "post.json"
        if not meta.exists():
            continue
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            data["_dir"] = d
            data["_images"] = sorted((d / "images").glob("*.jpg")) + sorted((d / "images").glob("*.png")) if (d / "images").exists() else []
            posts.append(data)
        except Exception as e:
            log(f"⚠ {d.name} 파싱 실패: {e}")
    return posts


def write_post(driver, post):
    """네이버 블로그 글쓰기 — 2026-11 기준 UI"""
    log(f"글쓰기 페이지 이동: {post['title'][:30]}...")
    driver.get(f"https://blog.naver.com/{BLOG_ID}?Redirect=Write")
    wait(3, 5)

    # 이어쓰기 알림 팝업 있으면 "취소" (새 글 쓰기)
    try:
        cancel_btn = WebDriverWait(driver, 3).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".se-popup-button-cancel"))
        )
        cancel_btn.click()
        wait(1, 2)
    except TimeoutException:
        pass

    # 도움말 레이어 닫기 (있으면)
    try:
        close_btn = driver.find_element(By.CSS_SELECTOR, ".se-help-panel-close-button, button[aria-label='도움말 닫기']")
        close_btn.click()
        wait(1, 2)
    except NoSuchElementException:
        pass

    # iframe 진입 (네이버 블로그 에디터는 iframe 안에 있음)
    try:
        driver.switch_to.frame("mainFrame")
    except Exception as e:
        log(f"⚠ iframe 진입 실패: {e}")

    # 제목
    try:
        title_area = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".se-title-text, .se-placeholder[data-placeholder='제목']"))
        )
        title_area.click()
        wait(0.5, 1)
        webdriver.ActionChains(driver).send_keys(post["title"]).perform()
        wait(1, 2)
    except Exception as e:
        raise RuntimeError(f"제목 입력 실패: {e}")

    # 본문 — body_html 또는 body_text
    body = post.get("body_text") or re.sub(r"<[^>]+>", "", post.get("body_html", ""))
    try:
        body_area = driver.find_element(By.CSS_SELECTOR, ".se-component-content, .se-main-container")
        body_area.click()
        wait(0.5, 1)
        # 본문 입력 (줄바꿈은 \n → Enter)
        for line in body.split("\n"):
            webdriver.ActionChains(driver).send_keys(line).perform()
            webdriver.ActionChains(driver).send_keys(Keys.ENTER).perform()
            wait(0.2, 0.5)
    except Exception as e:
        raise RuntimeError(f"본문 입력 실패: {e}")

    # 이미지 업로드 (있으면)
    for img_path in post.get("_images", []):
        try:
            # 사진 버튼 클릭
            driver.switch_to.default_content()
            driver.switch_to.frame("mainFrame")
            img_btn = driver.find_element(By.CSS_SELECTOR, "button[data-type='image'], button[aria-label='사진']")
            img_btn.click()
            wait(1, 2)
            # 파일 업로드
            file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            file_input.send_keys(str(img_path.absolute()))
            wait(3, 5)  # 업로드 대기
        except Exception as e:
            log(f"⚠ 이미지 업로드 실패 ({img_path.name}): {e}")

    # 발행 버튼
    try:
        publish_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, ".publish_btn__m9KHH, button.btn_publish, button[class*='publish']"))
        )
        publish_btn.click()
        wait(2, 3)

        # 태그 입력
        tags = post.get("tags", [])
        if tags:
            try:
                tag_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='태그'], .tag_input")
                for tag in tags[:10]:  # 최대 10개
                    tag_input.send_keys(tag + " ")
                    wait(0.3, 0.6)
            except Exception as e:
                log(f"⚠ 태그 입력 실패: {e}")

        # 최종 발행
        final_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn_publish, button[class*='confirm']"))
        )
        final_btn.click()
        wait(5, 8)  # 발행 완료 대기
    except Exception as e:
        raise RuntimeError(f"발행 실패: {e}")

    log(f"✅ 발행 완료: {post['title'][:30]}")
    driver.switch_to.default_content()


def move_to(src, dst_dir, note=""):
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / src.name
    if dst.exists():
        dst = dst_dir / f"{src.name}_{int(time.time())}"
    shutil.move(str(src), str(dst))
    if note:
        (dst / "_log.txt").write_text(note, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--login", action="store_true", help="수동 로그인 (쿠키 저장)")
    parser.add_argument("--headless", action="store_true", help="브라우저 숨김")
    parser.add_argument("--max", type=int, default=MAX_POSTS_PER_RUN, help="최대 발행 수")
    args = parser.parse_args()

    driver = make_driver(headless=args.headless)
    try:
        if args.login:
            login_and_save_cookies(driver)
            return

        if not load_cookies(driver):
            return

        posts = pending_posts()
        if not posts:
            log("발행 대기 글 없음 (to_upload/ 비어있음)")
            return
        log(f"📝 발행 대기: {len(posts)}개 · 오늘 최대 {args.max}개 발행")

        success = 0
        for i, post in enumerate(posts[:args.max]):
            if i > 0:
                wait(60, 120)  # 글 간 1~2분 간격 (스팸 방지)
            try:
                write_post(driver, post)
                move_to(post["_dir"], ARCHIVE)
                success += 1
            except Exception as e:
                log(f"❌ 발행 실패: {post['title'][:30]} · {e}")
                move_to(post["_dir"], FAILED, note=f"{datetime.now().isoformat()}\n{e}")

        log(f"🎉 완료: {success}/{min(len(posts), args.max)}개 발행")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()

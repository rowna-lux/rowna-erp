"""
공용 페이지 가져오기 모듈
Playwright로 JavaScript 렌더링 후 HTML 반환.
Playwright 미설치 시 requests로 폴백 (기본 HTML만).
"""
import os
import re
import time
import random

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
    _playwright_available = True
except ImportError:
    _playwright_available = False

try:
    import requests
    from bs4 import BeautifulSoup
    _requests_available = True
except ImportError:
    _requests_available = False


UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"


def _fetch_with_playwright(url, timeout_ms=30000, wait_until="networkidle"):
    """Playwright로 JS 렌더링 후 HTML 반환"""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                user_agent=UA,
                viewport={"width": 1366, "height": 900},
                locale="ko-KR",
            )
            page = context.new_page()
            try:
                page.goto(url, wait_until=wait_until, timeout=timeout_ms)
            except PlaywrightTimeoutError:
                # 네트워크 아이들 대기 실패해도 일단 현재 상태 가져옴
                pass
            # 추가 대기: 상품 카드 로딩 위해 2~4초
            time.sleep(random.uniform(2, 4))
            html = page.content()
            browser.close()
            return html, None
    except Exception as e:
        return None, f"playwright error: {e}"


def _fetch_with_requests(url, timeout=20):
    """requests 폴백 (JS 렌더링 X)"""
    if not _requests_available:
        return None, "requests not installed"
    try:
        r = requests.get(
            url,
            headers={"User-Agent": UA, "Accept-Language": "ko-KR,en;q=0.9"},
            timeout=timeout,
        )
        if r.status_code != 200:
            return None, f"HTTP {r.status_code}"
        return r.text, None
    except Exception as e:
        return None, str(e)


def fetch_html(url, prefer="playwright", timeout=30):
    """
    HTML 가져오기 (Playwright 우선, 없으면 requests)
    반환: (html, error_msg)
    """
    if prefer == "playwright" and _playwright_available:
        html, err = _fetch_with_playwright(url, timeout_ms=timeout * 1000)
        if html:
            return html, None
        # Playwright 실패 시 requests 폴백
        return _fetch_with_requests(url, timeout=timeout)
    return _fetch_with_requests(url, timeout=timeout)


def html_to_text(html, max_chars=50000):
    """HTML → 깨끗한 텍스트"""
    if not html or not _requests_available:
        return ""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "noscript", "iframe", "svg", "head"]):
        tag.decompose()
    text = soup.get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text)
    return text[:max_chars]


def fetch_page_text(url, **kwargs):
    """URL → 렌더링된 텍스트 (한 번에 모두 처리)"""
    html, err = fetch_html(url, **kwargs)
    if err or not html:
        return None, err or "no html"
    text = html_to_text(html)
    return text, None


def is_available():
    """Playwright 설치 확인"""
    return _playwright_available


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print(f"Playwright 설치 여부: {_playwright_available}")
        print("Usage: python fetcher.py <URL>")
        sys.exit(0)
    print(f"Playwright 설치: {_playwright_available}")
    print(f"가져오기: {sys.argv[1]}")
    text, err = fetch_page_text(sys.argv[1])
    if err:
        print(f"에러: {err}")
    else:
        print(f"텍스트 길이: {len(text)}")
        print(f"앞 500자:\n{text[:500]}")

# 로우나 서브컴 자동화 스크립트 (2026-11-22 작성)

서브컴(사무실2 PC)에서 24/7 돌리는 매출 증대·자동화 스크립트 모음.

## 🚀 설치 (최초 1회)

```powershell
# Python 3.10+ 설치되어 있다고 가정
cd C:\Users\ADMIN\Downloads\로우나_AI작업
git clone https://github.com/rowna-lux/rowna-erp.git
cd rowna-erp\scripts

# 전체 공통 패키지 설치
pip install selenium webdriver-manager requests beautifulsoup4 lxml python-dotenv pandas bcrypt playwright
playwright install chromium
```

**⚠️ Playwright 필수** (JavaScript 렌더링 사이트 - SSENSE, Mytheresa, NAP 등):
- `pip install playwright` 설치 후
- `playwright install chromium` 로 Chromium 바이너리 다운로드 (~200MB, 1회)

## 🔧 .env 설정

`scripts/.env` 파일 생성 후:

```
# Gmail 알림 (텔레그램 대체 - 2026-11-24)
GMAIL_USER=shinmy777@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
GMAIL_TO=shinmy777@gmail.com

# Gemini API (크림 도매 리스트 분석용, 무료 등급)
GEMINI_API_KEY=AQ.Ab8R...

# 네이버 커머스 API (리뷰 요청용)
NAVER_COMMERCE_CLIENT_ID=xxxxx
NAVER_COMMERCE_CLIENT_SECRET=xxxxx
```

- **Gmail 앱 비밀번호**: https://myaccount.google.com/apppasswords 발급 (2단계 인증 필수)
- **네이버 커머스 API**: https://apicenter.commerce.naver.com/ 가입

### 알림 테스트
```powershell
cd scripts
python -m common.notify          # Gmail 테스트 메일 발송
python blackfriday/bf_monitor.py --test   # 블프 모니터 알림 테스트
python japan/japan_monitor.py --test       # 일본 모니터 알림 테스트
```

메일이 `GMAIL_TO` 받은편지함에 뜨면 성공. 핸드폰 Gmail 앱에 푸시 알림 옴.

---

## ① 크림 보판 손해가격 알림
**이미 ERP에 내장됨** — 서브컴 스크립트 불필요. 매일 아침 9시 자동 발송.

## ② 열무·수고개 도매 리스트 분석기 (`kream_wholesale/watcher.py`)

**2026-11-24 신규 — 메인PC 또는 서브컴에서 백그라운드 실행**

### 기능
- 1초마다 클립보드 감시
- 카톡·사진에서 도매 리스트 이미지 복사(Ctrl+C) → 자동 감지
- Gemini Vision으로 OCR·파싱 (품번·브랜드·수량·매입가·크림 링크)
- 크림 시세 자동 조회 → 수익 분석 (Level 1 수수료: 6% + 2,500)
- Gmail + Windows 토스트 알림

### 설치
```powershell
pip install pillow requests python-dotenv plyer
cd scripts
python kream_wholesale/watcher.py --test    # 설정 체크
python kream_wholesale/watcher.py           # 감시 시작 (최소화하고 두기)
```

### 사용법
1. 카톡에서 열무/수고개 도매 리스트 사진 받음
2. **사진 우클릭 → "사진 복사"** (Ctrl+C)
3. 5~10초 후 Gmail에 분석 리포트 도착
4. 바탕화면 토스트 알림도 뜸

### 수동 실행 (파일 지정)
```powershell
python kream_wholesale/watcher.py --file some_image.png
```

## ③ 네이버 블로그 자동 업로드 (`blog/upload_blog.py`)

```powershell
# 최초 1회 (수동 로그인)
cd scripts\blog
python upload_blog.py --login
# 브라우저 열리면 수동 로그인 → 완료 후 콘솔에서 Enter

# 일상 실행 (cron/작업 스케줄러에 등록)
python upload_blog.py           # 최대 3개 발행
python upload_blog.py --max 5   # 최대 5개
```

**발행 대기 글 넣는 위치:**
`C:\Users\ADMIN\Downloads\로우나_AI작업\rowna_blog_auto\to_upload\<폴더명>\`

각 폴더에:
- `post.json`: `{"title": "...", "body_text": "...", "tags": ["샤넬", "지갑"]}`
- `images/` 폴더 (선택): `.jpg`, `.png` 파일들

**추천 스케줄:** 작업 스케줄러로 **매일 오전 10시, 오후 2시** 실행.

## ④ 블랙프라이데이 명품 세일 모니터링 (`blackfriday/bf_monitor.py`)

**11/28(금) D-3. 지금 바로 시작!**

```powershell
cd scripts\blackfriday
python bf_monitor.py          # 1회 체크
python bf_monitor.py --loop   # 2시간마다 무한 반복 (서브컴에서 24/7)
python bf_monitor.py --test   # Gmail 알림 테스트
```

- SSENSE·Mytheresa·Farfetch 자동 체크
- 로우나 취급 브랜드 50%+ 세일 발견 시 **즉시 Gmail**
- ⭐ 핵심 타겟 (Stone Island, CP Company, Margiela, Saint Laurent, Prada, Miu Miu) 우선 정렬
- 봇 차단 피하려 2시간 간격 + 랜덤 딜레이

**브랜드 리스트 수정:** `bf_monitor.py` 상단 `TARGET_BRANDS` 배열

### ④-1 세일 URL 수동 분석기 (`blackfriday/url_analyzer.py`)

**파서가 깨진 사이트 대안.** 세일 사이트 URL 발견하면 바로 분석:

```powershell
python scripts/blackfriday/url_analyzer.py "https://www.mytheresa.com/en-us/sale"
```

- URL HTML 가져옴 → OpenAI gpt-4o-mini로 분석
- 로우나 타겟 브랜드 50%+만 필터링
- ⭐ 핵심 타겟 우선 정렬 → Gmail 발송
- 비용: 1회 ₩1~2

## ⑤ 머스트잇 그로스패키지 광고 자동 등록 (`mustit/mustit_ad_auto.py`)

**현재 반쪽자리** — 머스트잇 셀러센터 UI 모르기 때문.

user가 **광고 등록 1회 수동으로 해보고 스크린샷**(각 버튼·입력란 캡처) 보내주시면 바로 완성.

## ⑥ 스마트스토어 리뷰 자동 요청 (`review/review_request.py`)

```powershell
cd scripts\review
python review_request.py          # 1회 (배송완료 D+7 고객 리뷰 요청)
python review_request.py --loop   # 매일 09시 자동
```

**사전 작업:** 네이버 커머스 API 가입 → CLIENT_ID/SECRET을 `.env`에 저장.

**대안 (API 안 쓸 때):** 스마트스토어 센터 > 알림톡 설정에서 "배송완료 7일 후 자동 알림톡" 기능 사용 (유료, 건당 20~30원).

## ⑦ 일본 구매대행 상품 모니터링 (`japan/japan_monitor.py`)

```powershell
cd scripts\japan
python japan_monitor.py          # 1회
python japan_monitor.py --loop   # 4시간마다
```

**감시 상품 리스트:** `scripts/japan/watch_list.json` (처음 실행 시 자동 생성 → 수정)

- 아마존재팬 자동 체크
- 환율 + 배송비(¥1,500 가정) + 관세 자동 계산 (한국 150달러 이하 면세)
- 조건 맞으면 Gmail 알림

## ⑧ 자동화 상태 체크 (`status_check.py`)

```powershell
python scripts\status_check.py           # 상태 확인 + Gmail 발송
python scripts\status_check.py --quiet   # 콘솔만
```

- 환경변수, 패키지, 스크립트 존재, 로그 상태 한번에 확인
- 메인PC / 서브컴 양쪽에서 각각 돌려서 ✅ 확인

---

## 🕐 작업 스케줄러 등록 (Windows)

서브컴에서 24/7 돌리려면 Windows 작업 스케줄러에 등록:

1. 작업 스케줄러 열기 → "기본 작업 만들기"
2. 트리거: 매일 특정 시간 or 컴퓨터 부팅 시
3. 동작: "프로그램 시작"
   - 프로그램: `python.exe` (전체 경로)
   - 인수: `C:\Users\ADMIN\Downloads\로우나_AI작업\rowna-erp\scripts\blackfriday\bf_monitor.py --loop`
4. 저장

**추천 스케줄:**
- ③ 블로그: 매일 10시·14시
- ④ 블랙프: 부팅 시 자동 시작 (`--loop`)
- ⑤ 머스트잇 광고: 매주 월요일 09시
- ⑥ 리뷰 요청: 매일 09시
- ⑦ 일본 매물: 부팅 시 자동 시작 (`--loop`)

---

## ⚠ 중요 안전수칙

1. **쿠키 파일(cookies.pkl, mustit_cookies.pkl)은 비밀번호와 동일** — git에 올리지 말기 (`.gitignore` 추가됨)
2. **.env 파일도 git 제외**
3. 모든 스크립트는 **랜덤 딜레이 + 저빈도** 설정 — 사이트 차단 방지
4. 머스트잇·네이버·크림 사이트 **UI가 바뀌면 selector 수정 필요** — 실패 시 로그 확인
5. 블로그 업로드는 **하루 5개 넘으면 네이버가 스팸으로 분류** 위험 — 기본 3개 제한

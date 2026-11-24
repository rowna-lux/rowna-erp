# 🌅 새벽 작업 리포트 (2026-11-25)

## ✅ 어제 완성된 것 (2026-11-24)

1. **블랙프라이데이 모니터** (bf_monitor.py) - 서브컴에서 2시간마다 돌아가는 중
2. **Gmail 알림 시스템** (common/notify.py) - 텔레그램 대체, shinmy777@gmail.com
3. **열무·수고개 도매 리스트 분석기** (kream_wholesale/watcher.py) - 메인PC 클립보드 감시
4. **OpenAI gpt-4o-mini Vision** - 도매 사진 → 품목 자동 추출 (성공)
5. **크림 시세 자동 조회** - ❌ 404 (Kream 안티봇). URL은 추출됨, 수동 클릭 필요

---

## 🌙 새벽 추가 작업 (2026-11-25 01:35 ~)

### 1. 블프 모니터 품질 개선 (`blackfriday/bf_monitor.py`)
- **TOP_PRIORITY** 그룹 분리 (매입 자주 브랜드)
  - Stone Island, CP Company, Maison Margiela, Saint Laurent, Prada, Miu Miu
- Loewe, Givenchy, Celine, Fendi 하이엔드 추가 (세일 가끔)
- Isabel Marant, Dries Van Noten, Wales Bonner 추가 관심 브랜드
- 메일 포맷 개선: ⭐ 핵심 타겟을 먼저 보여줌 (할인율 정렬)
- 제목에 핵심 vs 추가 개수 표시

### 2. 세일 URL 분석기 (`blackfriday/url_analyzer.py`) - 신규
- 파서가 깨진 사이트를 **발견한 URL로 수동 분석**할 수 있는 대안
- 사용법:
  ```powershell
  python scripts/blackfriday/url_analyzer.py "https://www.ssense.com/..."
  ```
- 동작: URL HTML 가져옴 → OpenAI로 로우나 타겟 필터링 → Gmail 발송
- 특히 Mytheresa, NAP, MR PORTER, 24S 등 커스텀 파서 없는 사이트에서 유용

### 3. 자동화 상태 체크 (`status_check.py`) - 신규
- 한 번에 .env, 패키지, 스크립트 상태 확인
- `python scripts/status_check.py` 로 실행
- Gmail로 결과 발송

### 4. 블프 일괄 스캔 (`blackfriday/scan_all_sales.py`) - 신규
- SSENSE·Mytheresa·NAP·24S·MR PORTER·Farfetch·29CM·W컨셉 10개 사이트 한번에 스캔
- 각 사이트별 로우나 타겟 발견 결과를 Gmail로 받음
- 사용법: `python scripts/blackfriday/scan_all_sales.py`
- 소요: 2~5분, 비용 ~₩15

### 5. 코드 정리
- watcher.py: Gemini → OpenAI 레퍼런스 정정
- OPENAI_API_KEY 환경변수 사용 (폴백으로 GEMINI_API_KEY 자리에 sk-* 허용)

---

## 📋 아침에 하실 일 (아침 깨어나면)

### 1. 서브컴 - bf_monitor 최신 코드 반영
```powershell
cd C:\Users\ADMIN\rowna-erp
git pull
```
그리고 현재 돌고 있는 bf_monitor를 **Ctrl+C로 중단 후 다시 시작**:
```powershell
cd scripts
python blackfriday\bf_monitor.py --loop
```

### 2. 메인PC - 분석기 최신 코드 반영
메인PC는 ZIP으로 받으셨으니 **ZIP 재다운로드하거나 curl로 개별 파일 업데이트**:
```powershell
cd C:\Users\MSI\Downloads\rowna-erp-main\rowna-erp-main\scripts
curl -o kream_wholesale\watcher.py https://raw.githubusercontent.com/rowna-lux/rowna-erp/main/scripts/kream_wholesale/watcher.py
curl -o kream_wholesale\analyzer.py https://raw.githubusercontent.com/rowna-lux/rowna-erp/main/scripts/kream_wholesale/analyzer.py
```

### 3. 상태 체크 (양쪽 PC 각각)
```powershell
python scripts\status_check.py
```
→ "자동화 상태 체크" 메일 받아보고 모든 ✅ 확인

### 4. 블프 일괄 스캔 (⭐ 추천)
10개 세일 사이트 한 번에 스캔. 2~5분 뒤 Gmail 10개 받아보시면 됨.
```powershell
cd C:\Users\MSI\Downloads\rowna-erp-main\rowna-erp-main
python scripts\blackfriday\scan_all_sales.py
```
또는 서브컴에서:
```powershell
cd C:\Users\ADMIN\rowna-erp
python scripts\blackfriday\scan_all_sales.py
```

### 5. 블프 D-3 액션 리스트
- **11/28 금요일 블프 피크** (3일 남음)
- 피크 기간: 11/27 ~ 12/02
- 체크할 세일 사이트 (URL analyzer로 분석 가능):
  - SSENSE: https://www.ssense.com/en-us/women/sale, https://www.ssense.com/en-us/men/sale
  - Mytheresa: https://www.mytheresa.com/en-us/sale
  - Farfetch: https://www.farfetch.com/sale
  - NAP (여성): https://www.net-a-porter.com/en-us/sale/clothing
  - MR PORTER (남성): https://www.mrporter.com/en-us/mens/sale
  - 24S: https://www.24s.com/en-us/sale

---

## 🎯 매출 증대 다음 스텝 (우선순위)

### 즉시 (이번 주)
1. **열무/수고개 도매 사진 Gmail 자동화 활용** - 이미 작동 중, 매일 쓰시면 됨
2. **블프 세일 URL 2~3개 매일 url_analyzer로 분석** - 핵심 매입 기회 놓치지 마세요
3. **광고 자동화 (머스트잇)** - 사용자가 광고 UI 스크린샷 주면 바로 구현

### 다음 주
4. **일본 구매대행 감시 리스트** - 로우나 매입 브랜드 기준으로 watch_list.json 구성
5. **아침 리포트 자동화** - 매일 아침 9시 상태 + 액션 Gmail
6. **크림 시세 수동 조회를 빠르게** - Chrome 확장 또는 북마크 자동화

### 나중
7. **리뷰 요청 자동화** (네이버 커머스 API 가입 선행)
8. **블로그 자동 발행 개선**

---

## ⚠️ 주의 사항

- Kream 자동 시세 조회는 **현재 불가** (Kream 안티봇). 도매 리스트 분석 결과에서 Kream URL 링크 클릭으로 수동 확인 필요
- Telegram 봇은 **플러드 차단**됨. 당분간 복구 어려움. Gmail만 사용
- OpenAI gpt-4o-mini 비용: 도매 분석 사진당 ₩0.6, URL 분석당 ₩1~2 → **월 ₩500 내외** (무시 가능)

---

**편히 주무세요. 아침 Gmail 확인부터 하시면 됩니다.** ☕

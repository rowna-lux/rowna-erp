"""
도매 리스트 사진 → OpenAI Vision 분석 → 구조화된 품목 리스트
(Gemini의 AQ. 키 호환 문제로 OpenAI로 전환 - 2026-11-24)
"""
import os
import re
import json
import base64
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

import requests

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
# 폴백: GEMINI_API_KEY 자리에 OpenAI 키 들어있어도 사용
if not OPENAI_API_KEY:
    maybe = os.getenv("GEMINI_API_KEY", "").strip()
    if maybe.startswith("sk-"):
        OPENAI_API_KEY = maybe

OPENAI_MODEL = "gpt-4o-mini"  # 저렴 + 비전 성능 충분
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


PROMPT = """
이 이미지가 **명품 도매 리스트**인지 먼저 판단하세요.

도매 리스트 조건: 도매상 이름(예: 열무, 수고개, 무우)이 상단에 있고, 여러 품목이 표/리스트 형식으로 정렬돼있으며, 각 품목에 브랜드/품번/가격/수량이 명시돼있어야 함.

도매 리스트가 **아니면** 아래 JSON을 반환:
{"is_wholesale": false, "items": []}

도매 리스트가 **맞으면** 아래 JSON 형식으로 추출:
{
  "is_wholesale": true,
  "vendor": "도매상 이름 (사진 상단에서 실제로 보이는 것만. 모르면 'unknown')",
  "date": "YYYY-MM-DD (사진에 있는 날짜만. 모르면 null)",
  "trade_type": "낱개 or 테이크올 (사진에 있는 것만. 모르면 null)",
  "notes": "거래 안내사항 요약 (사진에 있는 것만)",
  "items": [
    {
      "brand": "사진에 실제로 보이는 브랜드명",
      "sku": "사진에 보이는 품번 (없으면 빈 문자열)",
      "name": "사진에 보이는 한글 상품명 (없으면 영문)",
      "size": "사이즈",
      "qty": 숫자,
      "price": 단가_숫자,
      "subtotal": 합계_숫자,
      "kream_id": "크림 링크(kream.co.kr/products/XXX)의 숫자. 없으면 null"
    }
  ],
  "total_qty": 전체수량,
  "total_price": 전체합계
}

**절대 지킬 것:**
- 사진에 **보이지 않는 데이터를 발명하지 말 것**
- 브랜드·품번·가격이 하나라도 안 보이면 해당 항목 제외
- 예시(Saint Laurent, 607727 등)를 **그대로 복사하지 말 것** - 이건 형식 설명일 뿐
- 사진이 흐리거나 리스트 형식이 아니면 is_wholesale: false
"""


def analyze_image(image_bytes):
    """
    이미지 바이트를 OpenAI로 분석.
    반환: parsed dict or {'error': '...'}
    """
    if not OPENAI_API_KEY:
        return {"error": "OPENAI_API_KEY not set in .env"}

    b64 = base64.b64encode(image_bytes).decode()

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64}",
                            "detail": "high",  # 작은 글씨 읽기 위해
                        },
                    },
                ],
            }
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1,
        "max_tokens": 4000,
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        r = requests.post(OPENAI_URL, headers=headers, json=payload, timeout=60)
    except Exception as e:
        return {"error": f"request failed: {e}"}

    if r.status_code != 200:
        return {"error": f"openai status {r.status_code}: {r.text[:300]}"}

    try:
        data = r.json()
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        return {"error": f"unexpected response: {str(data)[:300]}"}

    # JSON 파싱
    try:
        # 코드블록 제거
        m = re.search(r"```json\s*(.*?)\s*```", text, re.DOTALL)
        if m:
            text = m.group(1)
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        return {"error": f"json parse failed: {e}", "raw": text[:500]}

    # kream_id → kream_url 변환
    for item in parsed.get("items", []):
        kid = item.get("kream_id")
        if kid and str(kid).isdigit():
            item["kream_url"] = f"https://kream.co.kr/products/{kid}"
        else:
            item["kream_url"] = None

    return parsed


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python analyzer.py <image_path>")
        sys.exit(1)
    with open(sys.argv[1], "rb") as f:
        result = analyze_image(f.read())
    print(json.dumps(result, ensure_ascii=False, indent=2))

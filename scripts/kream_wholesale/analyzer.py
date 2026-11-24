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
이 이미지는 명품 도매 리스트입니다. 아래 JSON 형식으로 모든 품목을 추출해주세요.

반드시 지킬 것:
1. JSON만 반환 (설명 금지)
2. 모든 품목 빠짐없이
3. 가격은 숫자만 (콤마·원화기호 제거)
4. 크림 링크가 보이면 반드시 추출 (kream.co.kr/products/XXXXX 형식)
5. 날짜·거래조건·업체명도 상단에 함께

JSON 형식:
{
  "vendor": "열무 or 수고개 or 기타 (사진 상단에서 추출)",
  "date": "YYYY-MM-DD",
  "trade_type": "낱개 or 테이크올",
  "notes": "거래 안내사항 요약 (1줄)",
  "items": [
    {
      "brand": "브랜드명 (예: Saint Laurent)",
      "sku": "품번 (예: 607727-02G0W-1000)",
      "name": "상품명 한글",
      "size": "사이즈 (예: ONE SIZE, XL)",
      "qty": 숫자,
      "price": 단가_숫자,
      "subtotal": 합계_숫자,
      "kream_id": "크림 상품 ID (숫자만, 예: '73728'). 링크 없으면 null"
    }
  ],
  "total_qty": 전체수량,
  "total_price": 전체합계
}
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

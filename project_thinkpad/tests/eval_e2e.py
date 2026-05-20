import os
import asyncio
import json
import httpx
import google.generativeai as genai
from dotenv import load_dotenv
from main import ask_gemma_brain

load_dotenv()

# Gemini 설정
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not found in .env")

# google.generativeai가 GOOGLE_API_KEY 환경변수를 참조하는 경우가 있으므로 설정
os.environ["GOOGLE_API_KEY"] = api_key
genai.configure(api_key=api_key)
judge_model = genai.GenerativeModel('gemini-3.1-flash-lite')

async def evaluate_conversation():
    print("🚀 Track 2: E2E 대화 품질 평가 시작...")
    
    # [Turn 1] 인사
    print("\n[Turn 1] User: ㅎㅇ 아르커스")
    response1 = await ask_gemma_brain("ㅎㅇ 아르커스")
    print(f"AI: {response1.get('message')}")
    
    # [Turn 2] 감정 표현
    # 실제 환경에서는 history가 main.py에 구현되어 있어야 하지만, 
    # 현재는 단순하게 연속 호출하여 AI가 문맥을 유지하는지(혹은 soul에 따른 기본 대응이 자연스러운지) 확인
    print("\n[Turn 2] User: 나 오늘 너무 힘들었어")
    response2 = await ask_gemma_brain("나 오늘 너무 힘들었어")
    ai_message = response2.get("message", "")
    ai_action = response2.get("action", "NONE")
    print(f"AI: {ai_message} (Action: {ai_action})")
    
    # [Judge] Gemini에게 평가 요청
    prompt = f"""
    당신은 대화 품질 평가사입니다. 다음은 유저와 AI의 대화입니다.
    
    유저: "ㅎㅇ 아르커스"
    AI: "{response1.get('message')}"
    유저: "나 오늘 너무 힘들었어"
    AI: "{ai_message}"
    
    [평가 기준]
    1. AI의 대답이 유저의 '힘들다'는 감정에 공감하고 있는가?
    2. AI가 불필요한 액션(예: 화면 캡처)을 제안하지 않고 대화를 이어가는가?
    3. 대화가 자연스러운 한국어인가?
    
    위 기준을 모두 만족하면 'PASS', 하나라도 부족하면 'FAIL'이라고 답변하고 이유를 짧게 적어주세요.
    최종 결과는 반드시 'PASS' 또는 'FAIL'이라는 단어로 시작해야 합니다.
    """
    
    print("\n🧠 Gemini 심판 평가 중...")
    result = judge_model.generate_content(prompt)
    evaluation = result.text.strip()
    print(f"평가 결과: {evaluation}")
    
    if evaluation.startswith("PASS"):
        print("\n✅ 최종 결과: PASS")
        return True
    else:
        print("\n❌ 최종 결과: FAIL")
        return False

if __name__ == "__main__":
    success = asyncio.run(evaluate_conversation())
    if not success:
        exit(1)
    exit(0)

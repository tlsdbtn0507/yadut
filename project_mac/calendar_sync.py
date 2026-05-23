import subprocess
import os
import json
import base64
import requests
from datetime import datetime
from dotenv import load_dotenv
import google.generativeai as genai

# .env 파일 로드
load_dotenv()

# Gemini API 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# LM Studio 설정 (Gemma 4)
LM_STUDIO_URL = "http://192.168.55.150:1234/v1/chat/completions"

def add_event_to_calendar(summary, start_time, end_time=None):
    """
    macOS 캘린더에 일정을 추가하거나 기존 일정을 업데이트합니다.
    대상 캘린더: "직장"
    """
    # AppleScript 내에서 해당 날짜의 범위를 계산하여 기존 일정을 찾습니다.
    script = f'''
    osascript -e '
    try
        set newSummary to "{summary}"
        set newStart to date "{start_time}"
        set newEnd to date "{end_time if end_time else start_time}"
        
        # 시작 날짜의 0시 0분 0초 계산
        set dateDay to date (short date string of newStart)
        set dayStart to dateDay
        set dayEnd to dateDay + (24 * 60 * 60) - 1
        
        tell application "Calendar"
            tell calendar "직장"
                # 해당 날짜의 기존 일정을 검색하여 일관성 있게 삭제합니다.
                set existingEvents to (every event whose start date is greater than or equal to dayStart and start date is less than or equal to dayEnd)
                
                repeat with theEvent in existingEvents
                    delete theEvent
                end repeat
                
                if newSummary is "휴무" then
                    # 휴무일인 경우 하루종일 일정 등록
                    make new event with properties {{summary:"휴무", start date:dayStart, end date:dayStart, allday event:true}}
                    return "HOLIDAY_CREATED"
                else
                    # 근무일인 경우 일반 일정 등록
                    make new event with properties {{summary:newSummary, start date:newStart, end date:newEnd}}
                    return "CREATED"
                end if
            end tell
        end tell
    on error error_message
        return "ERROR: " & error_message
    end try'
    '''
    
    result = subprocess.run(script, shell=True, capture_output=True, text=True)
    output = result.stdout.strip()
    
    if "HOLIDAY_CREATED" in output:
        print(f"🗑️ 휴무 등록: '{summary}' ({start_time}) 기존 일정을 삭제하고 하루종일 휴무 일정을 생성했습니다.")
        return True
    elif "CREATED" in output:
        print(f"✅ 신규 등록: '{summary}' ({start_time}) 일정을 추가했습니다.")
        return True
    else:
        print(f"❌ 실패: '{summary}' 처리 중 에러 발생")
        print(output if "ERROR:" in output else result.stderr)
        return False

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def extract_schedule_from_image_gemma(image_path):
    """
    LM Studio에 연결된 Gemma 4 모델을 사용하여 이미지에서 주간 일정을 추출합니다.
    """
    print(f"🔍 로컬 Gemma 4를 통해 이미지 분석 중: {image_path}")
    
    base64_image = encode_image(image_path)
    current_year = datetime.now().year
    
    prompt = f"""
    이 이미지(근무 스케줄표)를 분석해서 월요일부터 일요일까지의 주간 일정을 추출해줘.
    
    지침:
    1. 현재 연도는 {current_year}년이야. 이미지에 연도가 없으면 반드시 {current_year}년을 사용해.
    2. 시간은 반드시 '오전/오후 HH:MM:SS' 형식을 지켜줘. (예: 오후 3:00:00)
    3. 주간 단위의 모든 날짜(월요일~일요일)의 일정을 리스트 형식의 JSON으로만 응답해줘. 다른 설명은 하지마.
    4. 근무가 없는 날(휴무)도 생략하지 말고 반드시 포함해야 해. 휴무일의 경우 summary 필드에 '휴무'라고 입력하고, start_time과 end_time은 해당 날짜의 오전 09:00:00로 설정해줘.
    5. **중요: summary 필드에는 근무 시간에 따라 '오픈', '미들', '마감', 또는 '휴무' 중 하나를 넣어줘.**
       - 오픈: 주로 이른 아침에 시작하는 근무 (예: 07:00 ~ 15:00)
       - 마감: 밤 늦게 종료되는 근무 (예: 15:00 ~ 23:00)
       - 미들: 그 사이 시간대 근무 (예: 11:00 ~ 19:00)
       - 휴무: 근무가 없는 날
    
    응답 형식 (JSON 리스트):
    [
        {{
            "summary": "오픈",
            "start_time": "YYYY-MM-DD [오전/오후] HH:MM:SS",
            "end_time": "YYYY-MM-DD [오전/오후] HH:MM:SS"
        }}
    ]
    """

    payload = {
        "model": "gemma-4-26b-a4b-it",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0,
        "stream": False
    }

    try:
        response = requests.post(LM_STUDIO_URL, json=payload, timeout=120)
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        else:
            print(f"❌ Gemma 4 응답에서 JSON 리스트를 찾을 수 없습니다: {content}")
            return None
            
    except Exception as e:
        print(f"❌ Gemma 4 호출 에러: {e}")
        return None

def extract_schedule_from_image_gemini(image_path):
    """
    Gemini 모델을 사용하여 이미지에서 주간 일정을 추출합니다.
    """
    model_name = 'gemini-3.1-flash-image-preview'
    print(f"🔍 {model_name}를 통해 이미지 분석 중: {image_path}")
    
    if not GEMINI_API_KEY:
        print("❌ 에러: GEMINI_API_KEY가 .env 파일에 없습니다.")
        return None

    current_year = datetime.now().year
    with open(image_path, "rb") as f:
        image_data = f.read()

    model = genai.GenerativeModel(model_name)
    
    prompt = f"""
    이 이미지(근무 스케줄표)를 분석해서 월요일부터 일요일까지의 주간 일정을 추출해줘.
    
    지침:
    1. 현재 연도는 {current_year}년이야. 이미지에 연도가 없으면 반드시 {current_year}년을 사용해.
    2. 시간은 반드시 '오전/오후 HH:MM:SS' 형식을 지켜줘. (예: 오후 3:00:00)
    3. 주간 단위의 모든 날짜(월요일~일요일)의 일정을 리스트 형식의 JSON으로 응답해줘.
    4. 근무가 없는 날(휴무)도 생략하지 말고 반드시 포함해야 해. 휴무일의 경우 summary 필드에 '휴무'라고 입력하고, start_time과 end_time은 해당 날짜의 오전 09:00:00로 설정해줘.
    5. **중요: summary 필드에는 근무 시간에 따라 '오픈', '미들', '마감', 또는 '휴무' 중 하나를 넣어줘.**
       - 오픈: 주로 이른 아침에 시작하는 근무
       - 마감: 밤 늦게 종료되는 근무
       - 미들: 그 사이 시간대 근무
       - 휴무: 근무가 없는 날
    
    응답 형식 (JSON):
    [
        {{
            "summary": "오픈",
            "start_time": "YYYY-MM-DD [오전/오후] HH:MM:SS",
            "end_time": "YYYY-MM-DD [오전/오후] HH:MM:SS"
        }}
    ]
    """

    try:
        response = model.generate_content([
            prompt,
            {"mime_type": "image/png", "data": image_data}
        ])
        content = response.text
        import re
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        else:
            print(f"❌ Gemini 응답에서 JSON을 찾을 수 없습니다: {content}")
            return None
    except Exception as e:
        print(f"❌ Gemini 호출 에러: {e}")
        return None

def sync_image_to_calendar(image_path, use_local=False):
    """
    이미지 분석부터 모든 일정 등록까지 수행합니다.
    """
    if use_local:
        schedules = extract_schedule_from_image_gemma(image_path)
    else:
        schedules = extract_schedule_from_image_gemini(image_path)
    
    if schedules and isinstance(schedules, list):
        print(f"📅 총 {len(schedules)}개의 일정이 인식되었습니다.")
        success_count = 0
        for item in schedules:
            if add_event_to_calendar(
                summary=item["summary"],
                start_time=item["start_time"],
                end_time=item.get("end_time")
            ):
                success_count += 1
        
        print(f"🏁 완료: {len(schedules)}개 중 {success_count}개 등록/업데이트 성공")
        return success_count > 0
    else:
        print("❌ 추출된 일정 리스트가 없습니다.")
    return False

def chat_about_image(prompt: str, image_path: str) -> str:
    """
    Gemini 비전 모델을 사용하여 이미지에 대한 아르커스 정체성 기반의 대화 답변을 생성합니다.
    """
    model_name = 'gemini-3.1-flash-image-preview'
    if not GEMINI_API_KEY:
        return "죄송합니다, 마스터. 현재 API 키가 설정되지 않아 이미지를 분석하고 대화할 수 없습니다."
        
    try:
        if not os.path.exists(image_path):
            return "죄송합니다, 마스터. 분석할 이미지 파일을 찾을 수 없습니다."
            
        with open(image_path, "rb") as f:
            image_data = f.read()
            
        # soul.md 파일에서 아르커스의 정체성(자아)을 읽어와 프롬프트로 주입
        soul_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../hermes_core/soul.md"))
        soul_context = ""
        if os.path.exists(soul_path):
            with open(soul_path, "r", encoding="utf-8") as sf:
                soul_context = sf.read()
                
        # 아르커스 정체성 강조 지침 추가
        system_instruction = (
            f"{soul_context}\n\n"
            "지침:\n"
            "당신은 마스터의 친절하고 유능한 인공지능 비서 아르커스(ARCUS)로서 마스터가 보낸 사진을 정밀하게 확인하고 답변을 주어야 합니다.\n"
            "모든 응답은 마스터에 대한 존경심을 담아 '존댓말'을 엄수하고, '마스터' 또는 '주인님'이라는 호칭을 사용해야 합니다.\n"
        )
        
        # 텍스트가 비어 있는 경우 디폴트 질문 템플릿 사용
        if not prompt or prompt.strip() == "":
            prompt = "마스터가 텍스트 질문 없이 이미지만 보내주셨습니다. 이 사진이 무엇인지 정중하게 마스터께 묘사해 드리고 친근하게 말을 걸어보십시오."
            
        import re
        
        model = genai.GenerativeModel(model_name)
        response = model.generate_content([
            system_instruction + "\n\n마스터의 질문: " + prompt,
            {"mime_type": "image/png", "data": image_data}
        ])
        
        raw_text = response.text
        # JSON 블록이 감싸져서 반환될 수 있으므로 정밀하게 파싱 시도
        cleaned = raw_text.strip()
        cleaned = re.sub(r"^```(?:json)?\n?", "", cleaned).strip()
        cleaned = re.sub(r"\n?```$", "", cleaned).strip()
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, dict) and "message" in parsed:
                return parsed["message"]
        except Exception:
            pass
            
        return raw_text
        
    except Exception as e:
        return f"죄송합니다, 마스터. 사진 분석 중 시스템 내부 오류가 발생했습니다: {str(e)}"

if __name__ == "__main__":
    # 두 개의 테스트 이미지를 '직장' 캘린더로 재동기화 (업데이트 로직 테스트)
    test_images = ["screenshots/schedule_test.png", "screenshots/schedule_quiz.PNG"]
    
    for img in test_images:
        if os.path.exists(img):
            print(f"\n🚀 [업데이트 테스트] '{img}' 이미지를 분석하여 '직장' 캘린더를 갱신합니다.")
            sync_image_to_calendar(img, use_local=False)
        else:
            print(f"파일이 없습니다: {img}")


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
                # 해당 날짜에 이미 시작하는 일정이 있는지 확인
                set existingEvents to (every event whose start date is greater than or equal to dayStart and start date is less than or equal to dayEnd)
                
                if (count of existingEvents) > 0 then
                    # 기존 일정이 있으면 첫 번째 일정을 업데이트
                    set theEvent to item 1 of existingEvents
                    set summary of theEvent to newSummary
                    set start date of theEvent to newStart
                    set end date of theEvent to newEnd
                    return "UPDATED"
                else
                    # 없으면 신규 생성
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
    
    if "UPDATED" in output:
        print(f"🔄 업데이트: '{summary}' ({start_time}) 기존 일정을 수정했습니다.")
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
    이 이미지(근무 스케줄표)를 분석해서 월요일부터 일요일까지의 모든 근무 일정을 추출해줘.
    
    지침:
    1. 현재 연도는 {current_year}년이야. 이미지에 연도가 없으면 반드시 {current_year}년을 사용해.
    2. 시간은 반드시 '오전/오후 HH:MM:SS' 형식을 지켜줘. (예: 오후 3:00:00)
    3. 주간 단위의 모든 날짜 일정을 리스트 형식의 JSON으로만 응답해줘. 다른 설명은 하지마.
    4. 근무가 없는 날은 제외해.
    5. **중요: summary 필드에는 근무 시간에 따라 '오픈', '미들', '마감' 중 하나를 넣어줘.**
       - 오픈: 주로 이른 아침에 시작하는 근무 (예: 07:00 ~ 15:00)
       - 마감: 밤 늦게 종료되는 근무 (예: 15:00 ~ 23:00)
       - 미들: 그 사이 시간대 근무 (예: 11:00 ~ 19:00)
    
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
    이 이미지(근무 스케줄표)를 분석해서 월요일부터 일요일까지의 모든 근무 일정을 추출해줘.
    
    지침:
    1. 현재 연도는 {current_year}년이야. 이미지에 연도가 없으면 반드시 {current_year}년을 사용해.
    2. 시간은 반드시 '오전/오후 HH:MM:SS' 형식을 지켜줘. (예: 오후 3:00:00)
    3. 이미지가 주간 단위라면 모든 날짜의 일정을 리스트 형식의 JSON으로 응답해줘.
    4. 근무가 없는 날은 제외해.
    5. **중요: summary 필드에는 근무 시간에 따라 '오픈', '미들', '마감' 중 하나를 넣어줘.**
       - 오픈: 주로 이른 아침에 시작하는 근무
       - 마감: 밤 늦게 종료되는 근무
       - 미들: 그 사이 시간대 근무
    
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

if __name__ == "__main__":
    # 두 개의 테스트 이미지를 '직장' 캘린더로 재동기화 (업데이트 로직 테스트)
    test_images = ["screenshots/schedule_test.png", "screenshots/schedule_quiz.PNG"]
    
    for img in test_images:
        if os.path.exists(img):
            print(f"\n🚀 [업데이트 테스트] '{img}' 이미지를 분석하여 '직장' 캘린더를 갱신합니다.")
            sync_image_to_calendar(img, use_local=False)
        else:
            print(f"파일이 없습니다: {img}")

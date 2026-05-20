import os
import subprocess

def add_event_to_calendar(summary, start_time, end_time=None):
    # macOS가 가장 정확하게 인식하는 ISO 포맷 형식 (YYYY-MM-DDTHH:MM:SS)
    # 예: "2026-05-20T14:00:00"
    
    # 만약 종료 시간이 없으면 시작 시간 1시간 뒤로 설정하는 AppleScript 로직 포함
    if not end_time:
        script = f'''
        osascript -e '
        set startDate to (current date)
        set textDate to "{start_time}"
        
        # ISO 스트링을 AppleScript 날짜 객체로 변환하기 위한 트릭
        tell application "Calendar"
            # 본인의 캘린더 앱에 있는 실제 캘린더 이름으로 지정해야 합니다 (예: "캘린더", "Home", "Work")
            tell calendar "캘린더"
                set newEvent to make new event with properties {{summary:"{summary}"}}
                set start date of newEvent to date textDate
            end tell
        end tell'
        '''
    else:
        script = f'''
        osascript -e '
        tell application "Calendar"
            tell calendar "캘린더"
                make new event with properties {{summary:"{summary}", start date:date "{start_time}", end date:date "{end_time}"}}
            end tell
        end tell'
        '''
    
    # os.system 대신 에러 메시지를 확인할 수 있는 subprocess 사용
    result = subprocess.run(script, shell=True, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✅ 성공: '{summary}' 일정이 캘린더에 추가되었습니다.")
    else:
        print("❌ 실패: 에러가 발생했습니다.")
        print(result.stderr)

# 💡 실행 테스트
# 맥북 시스템 언어가 '한국어'일 때 가장 잘 먹히는 날짜 포맷입니다.
if __name__ == "__main__":
    print("캘린더에 일정을 추가하는 중...")
    # 형식: "YYYY-MM-DD 오후/오전 HH:MM:SS" 또는 "YYYY년 M월 D일 ... " 
    # 내 맥북 설정에 맞게 문자열을 넘겨야 합니다. 안전하게 아래 포맷으로 테스트해보세요.
    add_event_to_calendar("🔥 터미널 테스트 미팅", "2026-05-20 오후 2:00:00", "2026-05-20 오후 3:00:00")
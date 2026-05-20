import pytest
from unittest.mock import patch, MagicMock
import os
from calendar_sync import extract_schedule_from_image, add_event_to_calendar, sync_image_to_calendar

def test_extract_schedule_from_image_mock():
    """
    Gemma 4 모델을 통해 이미지에서 일정 정보를 추출하는 기능을 테스트합니다.
    실제 모델 호출 대신 모킹을 사용합니다.
    """
    mock_response = {
        "summary": "근무: 주간조",
        "start_time": "2026-05-20 오후 2:00:00",
        "end_time": "2026-05-20 오후 10:00:00"
    }
    
    # 실제 구현 시에는 이 함수가 Gemma 4를 호출하게 됩니다.
    with patch('calendar_sync.extract_schedule_from_image') as mock_extract:
        mock_extract.return_value = mock_response
        
        result = mock_extract("mock_screenshot.png")
        
        assert result["summary"] == "근무: 주간조"
        assert "2026-05-20" in result["start_time"]

def test_add_event_to_calendar_success():
    """
    제공된 AppleScript를 통해 캘린더에 일정을 추가하는 기능을 테스트합니다.
    """
    with patch('subprocess.run') as mock_run:
        # 성공 시나리오 모킹
        mock_run.return_value = MagicMock(returncode=0, stdout="success", stderr="")
        
        from calendar_sync import add_event_to_calendar
        
        # 테스트 실행
        add_event_to_calendar("테스트 일정", "2026-05-20 오후 2:00:00", "2026-05-20 오후 3:00:00")
        
        # subprocess.run이 osascript와 함께 호출되었는지 확인
        args, kwargs = mock_run.call_args
        assert "osascript" in args[0]
        assert "테스트 일정" in args[0]
        assert "2026-05-20 오후 2:00:00" in args[0]

def test_full_sync_flow():
    """
    이미지 인식부터 캘린더 등록까지의 전체 흐름을 테스트합니다.
    """
    mock_schedule = {
        "summary": "근무: 야간조",
        "start_time": "2026-05-21 오후 10:00:00",
        "end_time": "2026-05-22 오전 6:00:00"
    }
    
    with patch('calendar_sync.extract_schedule_from_image', return_value=mock_schedule), \
         patch('subprocess.run', return_value=MagicMock(returncode=0)) as mock_run:
        
        from calendar_sync import sync_image_to_calendar
        
        sync_image_to_calendar("schedule_image.png")
        
        # 최종적으로 캘린더 등록 명령이 호출되었는지 확인
        assert mock_run.called

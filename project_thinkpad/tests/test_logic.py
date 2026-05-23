import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from main import parse_brain_response, handle_message, websocket_endpoint

# 1. parse_brain_response 테스트 (단순 함수)
def test_parse_brain_response_normal():
    raw = '{"message": "Hello", "action": "NONE"}'
    result = parse_brain_response(raw)
    assert result == {"message": "Hello", "action": "NONE"}

def test_parse_brain_response_markdown():
    raw = '```json\n{"message": "Capturing", "action": "CAPTURE"}\n```'
    result = parse_brain_response(raw)
    assert result == {"message": "Capturing", "action": "CAPTURE"}

def test_parse_brain_response_garbage():
    raw = "This is not JSON"
    result = parse_brain_response(raw)
    assert result["action"] == "NONE"
    assert "에러" in result["message"]

# 2. handle_message 라우팅 테스트 (Async)
@pytest.mark.asyncio
@patch("main.ask_gemma_brain")
@patch("main.execute_capture_skill")
async def test_handle_message_routing_none(mock_capture, mock_ask):
    # Mock LLM 응답: 일반 대화
    mock_ask.return_value = {"message": "위로의 말", "action": "NONE"}
    
    # Mock Telegram Update/Context
    update = AsyncMock()
    update.message.text = "나 오늘 너무 힘들었어"
    context = MagicMock()
    
    await handle_message(update, context)
    
    # 검증: 캡처 기능이 호출되지 않아야 함
    mock_capture.assert_not_called()
    # 검증: 유저에게 응답 메시지가 전달되어야 함
    update.message.reply_text.assert_called_with("위로의 말")

@pytest.mark.asyncio
@patch("main.ask_gemma_brain")
@patch("main.execute_capture_skill")
async def test_handle_message_routing_capture(mock_capture, mock_ask):
    # Mock LLM 응답: 캡처 명령
    mock_ask.return_value = {"message": "화면을 확인할게요", "action": "CAPTURE"}
    
    update = AsyncMock()
    update.message.text = "지금 화면 좀 봐줘"
    context = MagicMock()
    
    await handle_message(update, context)
    
@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_handle_photo_success(mock_get, mock_post):
    # Mock Telegram Update/Context
    update = AsyncMock()
    
    # Mock photo data
    mock_photo = AsyncMock()
    mock_photo.get_file = AsyncMock(return_value=AsyncMock(download_as_bytearray=AsyncMock(return_value=b"fake_image_data")))
    update.message.photo = [mock_photo]
    update.message.message_id = 12345
    
    context = MagicMock()
    
    # Mock httpx.post response for upload
    mock_upload_res = MagicMock()
    mock_upload_res.status_code = 200
    mock_upload_res.json.return_value = {
        "status": "success", 
        "filename": "remote_schedule_12345.png",
        "message": "File uploaded"
    }
    mock_post.return_value = mock_upload_res
    
    # Mock httpx.get response for sync
    mock_sync_res = MagicMock()
    mock_sync_res.status_code = 200
    mock_sync_res.json.return_value = {"status": "success", "message": "Calendar updated"}
    mock_get.return_value = mock_sync_res
    
    from main import handle_photo
    await handle_photo(update, context)
    
    # Verify sequence
    update.message.reply_text.assert_any_call("🗓️ 스케줄 이미지를 수신했습니다. 분석 및 캘린더 등록을 시작합니다...")
    
    # Verify upload call
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert "upload" in args[0]
    
    # Verify sync call (GET /sync_calendar/remote_schedule_12345.png)
    mock_get.assert_called_once()
    sync_args, _ = mock_get.call_args
    assert "sync_calendar/remote_schedule_12345.png" in sync_args[0]
    
    # Verify final success message
    update.message.reply_text.assert_any_call("🚀 Calendar updated")

@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_websocket_image_sync_success(mock_get, mock_post):
    # Mock WebSocket object
    websocket = AsyncMock()
    
    # Mock message payload (containing image base64 data)
    import base64
    fake_image_base64 = base64.b64encode(b"fake_image_data").decode("utf-8")
    payload = {
        "text": "이 스케줄 대 내 캘린더에 넣어줘",
        "attachment_type": "image",
        "attachment_data": fake_image_base64,
        "attachment_name": "IMG_123.jpg",
        "message_id": "test_msg_id"
    }
    
    # Set receive_text to yield our payload, then raise WebSocketDisconnect to stop the loop
    from fastapi import WebSocketDisconnect
    websocket.receive_text = AsyncMock(side_effect=[json.dumps(payload), WebSocketDisconnect()])
    
    # Mock httpx.post response for upload
    mock_upload_res = MagicMock()
    mock_upload_res.status_code = 200
    mock_upload_res.json.return_value = {
        "status": "success", 
        "filename": "remote_schedule_test_msg_id.png",
        "message": "File uploaded"
    }
    mock_post.return_value = mock_upload_res
    
    # Mock httpx.get response for sync
    mock_sync_res = MagicMock()
    mock_sync_res.status_code = 200
    mock_sync_res.json.return_value = {"status": "success", "message": "Calendar updated"}
    mock_get.return_value = mock_sync_res
    
    # Run the endpoint (will terminate on WebSocketDisconnect)
    await websocket_endpoint(websocket)
    
    # Verify that the photo was uploaded and sync_calendar was called
    mock_post.assert_called_once()
    assert "upload" in mock_post.call_args[0][0]
    
    mock_get.assert_called_once()
    assert "sync_calendar/remote_schedule_test_msg_id.png" in mock_get.call_args[0][0]
    
    # Verify that the success message was sent back via WebSocket
    websocket.send_text.assert_called_once_with("Calendar updated")

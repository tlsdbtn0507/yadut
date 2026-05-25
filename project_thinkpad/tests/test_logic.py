import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo
from main import get_current_datetime_reply, parse_brain_response, handle_message, websocket_endpoint

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

def test_get_current_datetime_reply_handles_kst_date_query():
    now = datetime(2026, 5, 25, 18, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    result = get_current_datetime_reply("오늘이 몇월이야?", now)
    assert result == "마스터님, 오늘은 2026년 5월 25일 월요일입니다."

def test_get_current_datetime_reply_ignores_capture_query():
    result = get_current_datetime_reply("지금 화면 좀 봐줘")
    assert result is None

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
async def test_handle_message_datetime_query_bypasses_llm(mock_ask):
    update = AsyncMock()
    update.message.text = "오늘이 몇월이야?"
    context = MagicMock()

    await handle_message(update, context)

    mock_ask.assert_not_called()
    update.message.reply_text.assert_called_once()
    assert "오늘은" in update.message.reply_text.call_args.args[0]

@pytest.mark.asyncio
@patch.dict("os.environ", {"WS_TOKEN": "SECRET_KEY"})
@patch("main.ask_gemma_brain")
async def test_websocket_datetime_query_bypasses_llm(mock_ask):
    websocket = AsyncMock()
    websocket.headers = {"origin": "https://projectweb-beta-gilt.vercel.app"}

    from fastapi import WebSocketDisconnect
    payload = {"text": "오늘이 몇월이야?", "attachment_type": None, "attachment_data": None}
    websocket.receive_text = AsyncMock(side_effect=[
        json.dumps({"type": "auth", "token": "SECRET_KEY"}),
        json.dumps(payload),
        WebSocketDisconnect()
    ])

    await websocket_endpoint(websocket)

    mock_ask.assert_not_called()
    websocket.send_text.assert_any_call(json.dumps({"type": "auth_success"}))
    sent_messages = [call.args[0] for call in websocket.send_text.call_args_list]
    assert any("오늘은" in message for message in sent_messages)

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
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_handle_photo_success(mock_get, mock_post, mock_classify):
    # Mock intent classification to return SCHEDULE_SYNC
    mock_classify.return_value = "SCHEDULE_SYNC"
    
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
@patch.dict("os.environ", {"WS_TOKEN": "SECRET_KEY"})
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_websocket_image_sync_success(mock_get, mock_post, mock_classify):
    # Mock intent classification to return SCHEDULE_SYNC
    mock_classify.return_value = "SCHEDULE_SYNC"
    
    # Mock WebSocket object
    websocket = AsyncMock()
    websocket.headers = {"origin": "https://projectweb-beta-gilt.vercel.app"}
    
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
    websocket.receive_text = AsyncMock(side_effect=[
        json.dumps({"type": "auth", "token": "SECRET_KEY"}),
        json.dumps(payload),
        WebSocketDisconnect()
    ])
    
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
    websocket.send_text.assert_any_call(json.dumps({"type": "auth_success"}))
    websocket.send_text.assert_any_call("Calendar updated")

@pytest.mark.asyncio
@patch.dict("os.environ", {"WS_TOKEN": "SECRET_KEY"})
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
async def test_websocket_image_chat_success(mock_post, mock_classify):
    # Mock WebSocket object
    websocket = AsyncMock()
    websocket.headers = {"origin": "https://projectweb-beta-gilt.vercel.app"}
    
    # Mock intent classification to return IMAGE_CHAT
    mock_classify.return_value = "IMAGE_CHAT"
    
    # Mock message payload (containing image base64 data and general prompt)
    import base64
    fake_image_base64 = base64.b64encode(b"fake_image_data").decode("utf-8")
    payload = {
        "text": "이 사진은 무슨 사진이야?",
        "attachment_type": "image",
        "attachment_data": fake_image_base64,
        "attachment_name": "IMG_123.jpg",
        "message_id": "test_msg_id"
    }
    
    from fastapi import WebSocketDisconnect
    websocket.receive_text = AsyncMock(side_effect=[
        json.dumps({"type": "auth", "token": "SECRET_KEY"}),
        json.dumps(payload),
        WebSocketDisconnect()
    ])
    
    # Mock responses for upload and chat_with_image
    mock_upload_res = MagicMock()
    mock_upload_res.status_code = 200
    mock_upload_res.json.return_value = {
        "status": "success", 
        "filename": "remote_schedule_test_msg_id.png"
    }
    
    mock_chat_res = MagicMock()
    mock_chat_res.status_code = 200
    mock_chat_res.json.return_value = {
        "status": "success",
        "message": "마스터, 이것은 아름다운 고양이 사진입니다."
    }
    
    # Mock post calls (upload first, then chat_with_image)
    mock_post.side_effect = [mock_upload_res, mock_chat_res]
    
    # Run endpoint
    await websocket_endpoint(websocket)
    
    # Verify both post calls (1. upload, 2. chat_with_image)
    assert mock_post.call_count == 2
    
    # Verify the first call is upload
    first_call_args = mock_post.call_args_list[0][0][0]
    assert "upload" in first_call_args
    
    # Verify the second call is chat_with_image
    second_call_args = mock_post.call_args_list[1][0][0]
    assert "chat_with_image" in second_call_args
    
    # Verify chat was sent back to WebSocket
    websocket.send_text.assert_any_call(json.dumps({"type": "auth_success"}))
    websocket.send_text.assert_any_call("마스터, 이것은 아름다운 고양이 사진입니다.")

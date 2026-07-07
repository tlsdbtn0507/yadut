import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo
from main import build_brain_prompt, handle_brain_decision, parse_brain_response, handle_message, websocket_endpoint

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

def test_build_brain_prompt_includes_kst_context():
    now = datetime(2026, 5, 25, 18, 30, tzinfo=ZoneInfo("Asia/Seoul"))
    result = build_brain_prompt("SOUL", "오늘 무슨날이야?", now)
    assert "[현재 컨텍스트]" in result
    assert "현재 한국 시간(KST): 2026년 5월 25일 월요일 18시 30분" in result
    assert "User: 오늘 무슨날이야?" in result

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
@patch("main.ask_gemma_with_search_context")
@patch("main.search_web")
async def test_handle_brain_decision_web_search(mock_search, mock_summary):
    mock_search.return_value = [
        {
            "provider": "BRAVE",
            "title": "서울 날씨",
            "url": "https://example.com/weather",
            "snippet": "서울의 현재 날씨 정보",
        }
    ]
    mock_summary.return_value = "마스터님, 서울 날씨 검색 결과입니다."

    result = await handle_brain_decision(
        {"message": "검색하겠습니다.", "action": "WEB_SEARCH", "query": "서울 오늘 날씨"},
        "오늘 서울 날씨 알려줘",
    )

    mock_search.assert_awaited_once_with("서울 오늘 날씨")
    mock_summary.assert_awaited_once()
    assert result == "마스터님, 서울 날씨 검색 결과입니다."

@pytest.mark.asyncio
@patch("main.ask_gemma_with_search_context")
@patch("main.search_web")
async def test_handle_brain_decision_web_search_uses_user_text_when_query_missing(mock_search, mock_summary):
    mock_search.return_value = []
    mock_summary.return_value = "검색 결과가 부족합니다."

    result = await handle_brain_decision(
        {"message": "검색하겠습니다.", "action": "WEB_SEARCH"},
        "현재 대한민국에서 가장 뜨거운 뉴스가 뭐야?",
    )

    mock_search.assert_awaited_once_with("현재 대한민국에서 가장 뜨거운 뉴스가 뭐야?")
    assert result == "검색 결과가 부족합니다."

def test_bridge_authorization_requires_bearer_token():
    from main import is_bridge_authorized

    with patch.dict("os.environ", {"THINKPAD_BRIDGE_TOKEN": "SERVER_TOKEN"}):
        assert is_bridge_authorized("Bearer SERVER_TOKEN") is True
        assert is_bridge_authorized("SERVER_TOKEN") is False
        assert is_bridge_authorized("Bearer WRONG") is False
        assert is_bridge_authorized(None) is False

@pytest.mark.asyncio
@patch("main.handle_brain_decision")
@patch("main.ask_gemma_brain")
async def test_process_arcus_message_text_uses_existing_brain_flow(mock_ask, mock_handle):
    from main import process_arcus_message

    mock_ask.return_value = {"message": "안녕하세요", "action": "NONE"}
    mock_handle.return_value = "안녕하세요"

    result = await process_arcus_message(text="안녕")

    mock_ask.assert_awaited_once_with("안녕")
    mock_handle.assert_awaited_once_with({"message": "안녕하세요", "action": "NONE"}, "안녕")
    assert result == "안녕하세요"

@pytest.mark.asyncio
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
@patch("httpx.AsyncClient.get")
async def test_process_arcus_message_image_schedule_command_bypasses_llm_classifier(mock_get, mock_post, mock_classify):
    from main import process_arcus_message
    import base64

    mock_upload_res = MagicMock()
    mock_upload_res.json.return_value = {
        "status": "success",
        "filename": "remote_schedule_test.png",
    }
    mock_post.return_value = mock_upload_res

    mock_sync_res = MagicMock()
    mock_sync_res.json.return_value = {
        "status": "success",
        "message": "Calendar updated",
    }
    mock_get.return_value = mock_sync_res

    result = await process_arcus_message(
        text="이번주 내 스케줄 캘린더에 넣어줘",
        attachment_type="image",
        attachment_data=base64.b64encode(b"fake_image_data").decode("utf-8"),
        message_id="test",
    )

    mock_classify.assert_not_awaited()
    mock_post.assert_called_once()
    mock_get.assert_called_once()
    assert "sync_calendar/remote_schedule_test.png" in mock_get.call_args[0][0]
    assert result == "Calendar updated"

@pytest.mark.asyncio
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
async def test_process_arcus_message_image_without_text_asks_for_intent(mock_post, mock_classify):
    from main import process_arcus_message
    import base64

    result = await process_arcus_message(
        text="   ",
        attachment_type="image",
        attachment_data=base64.b64encode(b"fake_image_data").decode("utf-8"),
        message_id="test",
    )

    mock_classify.assert_not_awaited()
    mock_post.assert_not_called()
    assert "이미지로 무엇을 도와드릴까요" in result

@pytest.mark.asyncio
@patch("main.classify_image_intent")
@patch("httpx.AsyncClient.post")
async def test_process_arcus_message_general_image_question_keeps_image_chat_flow(mock_post, mock_classify):
    from main import process_arcus_message
    import base64

    mock_classify.return_value = "IMAGE_CHAT"

    mock_upload_res = MagicMock()
    mock_upload_res.json.return_value = {
        "status": "success",
        "filename": "remote_image_chat.png",
    }

    mock_chat_res = MagicMock()
    mock_chat_res.json.return_value = {
        "status": "success",
        "message": "사진 설명입니다.",
    }

    mock_post.side_effect = [mock_upload_res, mock_chat_res]

    result = await process_arcus_message(
        text="이 사진은 뭐야?",
        attachment_type="image",
        attachment_data=base64.b64encode(b"fake_image_data").decode("utf-8"),
        message_id="test",
    )

    mock_classify.assert_awaited_once()
    assert mock_post.call_count == 2
    assert "chat_with_image" in mock_post.call_args_list[1][0][0]
    assert result == "사진 설명입니다."

@pytest.mark.asyncio
@patch.dict("os.environ", {"THINKPAD_BRIDGE_TOKEN": "SERVER_TOKEN"})
@patch("main.process_arcus_message")
async def test_arcus_message_endpoint_requires_server_token(mock_process):
    from fastapi import HTTPException
    from main import ArcusMessageRequest, arcus_message_endpoint

    mock_process.return_value = "응답"

    with pytest.raises(HTTPException) as exc_info:
        await arcus_message_endpoint(ArcusMessageRequest(text="안녕"), authorization=None)

    assert exc_info.value.status_code == 401

    result = await arcus_message_endpoint(
        ArcusMessageRequest(text="안녕"),
        authorization="Bearer SERVER_TOKEN",
    )

    assert result == {"success": True, "message": "응답"}
    mock_process.assert_awaited_once()
    
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

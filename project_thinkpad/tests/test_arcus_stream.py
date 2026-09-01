import json

import pytest

from arcus_stream import build_event, encode_sse, stream_events


def test_encode_sse_preserves_korean_message():
    event = build_event(
        "intent_identified",
        "web-1",
        "캘린더 일정 등록 요청으로 파악했습니다.",
        action="SCHEDULE_SYNC",
    )

    encoded = encode_sse(event)
    data = json.loads(encoded.split("data: ", 1)[1])

    assert encoded.startswith("event: intent_identified\n")
    assert data == {
        "type": "intent_identified",
        "request_id": "web-1",
        "message": "캘린더 일정 등록 요청으로 파악했습니다.",
        "action": "SCHEDULE_SYNC",
    }
    assert encoded.endswith("\n\n")


@pytest.mark.asyncio
async def test_stream_events_preserves_structured_result():
    async def complete(_emit):
        return {"message": "일정 등록 완료", "schedules": [{"date": "2026-08-28"}]}

    body = "".join([chunk async for chunk in stream_events(complete, "web-1")])
    completed = json.loads(body.split("event: completed\ndata: ", 1)[1])

    assert completed["message"] == "일정 등록 완료"
    assert completed["result"]["schedules"] == [{"date": "2026-08-28"}]


@pytest.mark.asyncio
async def test_stream_events_converts_processing_error_to_failed_event():
    async def fail(_emit):
        raise RuntimeError("private server detail")

    body = "".join([chunk async for chunk in stream_events(fail, "web-fail")])
    frames = [frame for frame in body.split("\n\n") if frame]
    failed = json.loads(frames[-1].split("data: ", 1)[1])

    assert [frame.splitlines()[0] for frame in frames] == [
        "event: accepted",
        "event: failed",
    ]
    assert failed["message"] == "요청 처리 중 오류가 발생했습니다."
    assert failed["error_code"] == "processing_failed"
    assert "private server detail" not in body

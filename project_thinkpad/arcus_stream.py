import json
import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import suppress
from typing import NotRequired, TypedDict, cast


class ArcusEvent(TypedDict):
    type: str
    request_id: str
    message: str
    action: NotRequired[str]
    result: NotRequired[dict[str, object]]
    error_code: NotRequired[str]
    error_stage: NotRequired[str]


EventEmitter = Callable[[ArcusEvent], Awaitable[None]]
ProcessingResult = str | dict[str, object]
EventProcessor = Callable[[EventEmitter], Awaitable[ProcessingResult]]


class ArcusProcessingError(Exception):
    def __init__(self, message: str, error_code: str, error_stage: str):
        super().__init__(message)
        self.error_code = error_code
        self.error_stage = error_stage


def build_event(
    event_type: str,
    request_id: str,
    message: str,
    **extra: object,
) -> ArcusEvent:
    return cast(
        ArcusEvent,
        {
            "type": event_type,
            "request_id": request_id,
            "message": message,
            **extra,
        },
    )


def encode_sse(event: ArcusEvent) -> str:
    data = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event['type']}\ndata: {data}\n\n"


async def stream_events(
    process: EventProcessor,
    request_id: str,
) -> AsyncIterator[str]:
    queue: asyncio.Queue[ArcusEvent | None] = asyncio.Queue()

    async def emit(event: ArcusEvent) -> None:
        await queue.put(event)

    async def run() -> None:
        try:
            await emit(build_event("accepted", request_id, "요청을 접수했습니다."))
            result = await process(emit)
            message = str(result.get("message", "")) if isinstance(result, dict) else result
            await emit(
                build_event(
                    "completed",
                    request_id,
                    message,
                    result=result if isinstance(result, dict) else {"message": message},
                )
            )
        except ArcusProcessingError as error:
            await emit(
                build_event(
                    "failed",
                    request_id,
                    str(error),
                    error_code=error.error_code,
                    error_stage=error.error_stage,
                )
            )
        except Exception:
            await emit(
                build_event(
                    "failed",
                    request_id,
                    "요청 처리 중 오류가 발생했습니다.",
                    error_code="processing_failed",
                    error_stage="thinkpad_processing",
                )
            )
        finally:
            await queue.put(None)

    task = asyncio.create_task(run())
    try:
        while (event := await queue.get()) is not None:
            yield encode_sse(event)
        await task
    finally:
        if not task.done():
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

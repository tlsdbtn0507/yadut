"""Persist before emitting accepted/completed, never persist progress as dialogue."""
import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from uuid import NAMESPACE_URL, uuid5

from arcus_stream import ArcusEvent, ArcusProcessingError, EventProcessor, build_event, encode_sse
from services.conversation_store import ConversationStore, Conflict, Record, source_change, utc_now


ACTIVE_TASKS: set[asyncio.Task[None]] = set()

def claim_request(store: ConversationStore, cid: str, mid: str, text: str,
                  attachments: list[str], request_data: dict[str, object]) -> Record:
    message = store.add_message(cid, mid, text, attachments)
    digest = hashlib.sha256(json.dumps(request_data, sort_keys=True).encode()).hexdigest()
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM messages WHERE id=?', (mid,)).fetchone()
        if row['request_hash'] and row['request_hash'] != digest:
            raise Conflict('Request ID already used with different payload')
        if row['status'] == 'processing':
            raise Conflict('Request is already processing')
        if row['status'] != 'queued':
            return {**message, 'status': row['status']}
        db.execute("UPDATE messages SET status='processing',request_hash=?,updated_at=? WHERE id=?",
                   (digest, utc_now(), mid))
    return {**message, 'status': 'processing'}


def complete(store: ConversationStore, request: Record, result: str | dict[str, object]) -> ArcusEvent:
    value = result if isinstance(result, dict) else {'message': result}
    text = value.get('message')
    if not isinstance(text, str):
        raise ValueError('Invalid terminal result')
    mid = str(request['id'])
    aid = str(uuid5(NAMESPACE_URL, f'yadut:assistant:{mid}'))
    now = utc_now()
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute("INSERT INTO messages(id,conversation_id,role,text,created_at,updated_at,status,reply_to,result_json) "
                   "VALUES(?,?,'assistant',?,?,?,'completed',?,?)",
                   (aid, request['conversation_id'], text, now, now, mid, json.dumps(value, ensure_ascii=False)))
        source_change(db, aid, 1, 'created')
        db.execute("UPDATE messages SET status='completed',updated_at=? WHERE id=?", (now, mid))
        db.execute('UPDATE conversations SET updated_at=? WHERE id=?', (now, request['conversation_id']))
    return build_event('completed', mid, text, result=value, assistant_message_id=aid,
                       conversation_id=request['conversation_id'], created_at=now)


def fail(store: ConversationStore, mid: str, code: str, stage: str, interrupted: bool = False) -> None:
    with store.connect() as db:
        db.execute('UPDATE messages SET status=?,error_code=?,error_stage=?,updated_at=? '
                   "WHERE id=? AND status='processing'",
                   ('interrupted' if interrupted else 'failed', code, stage, utc_now(), mid))


def replay(store: ConversationStore, request: Record) -> ArcusEvent:
    mid = str(request['id'])
    if request['status'] == 'completed':
        with store.connect() as db:
            row = db.execute('SELECT * FROM messages WHERE reply_to=? AND deleted_at IS NULL', (mid,)).fetchone()
            if row:
                return build_event('completed', mid, row['text'], result=json.loads(row['result_json']) if row['result_json'] else {'message': row['text']},
                                   assistant_message_id=row['id'], conversation_id=row['conversation_id'],
                                   created_at=row['created_at'])
    return build_event('failed', mid, '이 요청은 완료되지 않았습니다. 저장된 전송 상태를 확인해 주세요.',
                       error_code=str(request.get('error_code') or 'request_interrupted'),
                       error_stage=str(request.get('error_stage') or 'thinkpad_processing'))


async def persistent_events(store: ConversationStore, request: Record,
                            process: EventProcessor) -> AsyncIterator[str]:
    if request['status'] != 'processing':
        yield encode_sse(replay(store, request))
        return
    queue: asyncio.Queue[ArcusEvent | None] = asyncio.Queue()
    task = asyncio.create_task(run_processing(store, request, process, queue))
    ACTIVE_TASKS.add(task)
    task.add_done_callback(ACTIVE_TASKS.discard)
    try:
        while (event := await queue.get()) is not None:
            yield encode_sse(event)
        await task
    finally:
        # Processing continues after disconnect; retry reads the durable result.
        # Keep the task referenced until done, and consume unexpected exceptions.
        task.add_done_callback(lambda finished: finished.exception() if not finished.cancelled() else None)


async def run_processing(store: ConversationStore, request: Record, process: EventProcessor,
                         queue: asyncio.Queue[ArcusEvent | None]) -> None:
    mid = str(request['id'])
    try:
        await queue.put(build_event('accepted', mid, '요청을 접수했습니다.', conversation_id=request['conversation_id']))
        result = await process(queue.put)
        await queue.put(complete(store, request, result))
    except asyncio.CancelledError:
        fail(store, mid, 'processing_interrupted', 'thinkpad_processing', True)
        raise
    except Exception as error:
        code = error.error_code if isinstance(error, ArcusProcessingError) else 'processing_failed'
        stage = error.error_stage if isinstance(error, ArcusProcessingError) else 'thinkpad_processing'
        fail(store, mid, code, stage)
        await queue.put(build_event('failed', mid, '요청 처리 중 오류가 발생했습니다.', error_code=code, error_stage=stage))
    finally:
        await queue.put(None)

"""Authenticated source APIs. No filesystem path is accepted from the client."""
import hmac
import os
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.attachment_store import CHUNK_BYTES, append_chunk, attachment_path, begin_upload
from services.conversation_store import ConversationStore

Identifier = Annotated[str, Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$')]


def authorize(authorization: str | None = Header(default=None)) -> None:
    token = os.getenv('THINKPAD_BRIDGE_TOKEN')
    if not token or not authorization or not hmac.compare_digest(authorization, f'Bearer {token}'):
        raise HTTPException(401, 'Unauthorized')


def get_store(request: Request) -> ConversationStore:
    return request.app.state.conversations


class CreateConversation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='새 대화', min_length=1, max_length=200)


class AddMessage(BaseModel):
    model_config = ConfigDict(extra='forbid')
    message_id: Identifier
    text: str = Field(default='', max_length=100_000)
    attachment_ids: list[Identifier] = Field(default_factory=list, max_length=10)

    @model_validator(mode='after')
    def require_content(self) -> 'AddMessage':
        if not self.text.strip() and not self.attachment_ids:
            raise ValueError('Message is empty')
        return self


class UploadMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    mime_type: str
    byte_size: int = Field(gt=0, le=20 * 1024 * 1024)


router = APIRouter(prefix='/api/conversations', dependencies=[Depends(authorize)])
attachment_router = APIRouter(prefix='/api/attachments', dependencies=[Depends(authorize)])


@router.post('', status_code=201)
def create(payload: CreateConversation, store: ConversationStore = Depends(get_store)) -> dict[str, object]:
    return store.create_conversation(payload.title)


@router.get('')
def listing(store: ConversationStore = Depends(get_store)) -> list[dict[str, object]]:
    return store.list_conversations()


@router.get('/{conversation_id}')
def detail(conversation_id: str, store: ConversationStore = Depends(get_store)) -> dict[str, object]:
    return store.conversation(conversation_id)


@router.post('/{conversation_id}/messages', status_code=201)
def add(conversation_id: str, payload: AddMessage,
        store: ConversationStore = Depends(get_store)) -> dict[str, object]:
    return store.add_message(conversation_id, payload.message_id, payload.text, payload.attachment_ids)


@attachment_router.post('', status_code=201)
def upload(payload: UploadMetadata, store: ConversationStore = Depends(get_store)) -> dict[str, object]:
    return begin_upload(store, payload.name, payload.mime_type, payload.byte_size)


@attachment_router.put('/{attachment_id}')
async def chunk(attachment_id: str, request: Request, offset: int = 0,
                store: ConversationStore = Depends(get_store)) -> dict[str, object]:
    data = bytearray()
    async for part in request.stream():
        data.extend(part)
        if len(data) > CHUNK_BYTES:
            raise HTTPException(413, 'Chunk too large')
    return append_chunk(store, attachment_id, offset, bytes(data))


@attachment_router.get('/{attachment_id}')
def download(attachment_id: str, store: ConversationStore = Depends(get_store)) -> FileResponse:
    with store.connect() as db:
        row = db.execute('SELECT a.* FROM attachments a JOIN messages m ON m.id=a.message_id '
                         'WHERE a.id=? AND m.deleted_at IS NULL AND a.ready=1', (attachment_id,)).fetchone()
        if row is None:
            raise KeyError(attachment_id)
    return FileResponse(attachment_path(store, attachment_id), media_type=row['mime_type'],
                        filename=row['original_name'], headers={'Cache-Control': 'no-store',
                        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'"})

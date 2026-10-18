import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('YADUT_DATA_DIR', str(tmp_path / 'data'))
    monkeypatch.setenv('THINKPAD_BRIDGE_TOKEN', 'test-token')
    with TestClient(app, headers={'Authorization': 'Bearer test-token'}) as client:
        yield client


def events(response):
    return [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]


def test_api_validation_and_auth(client):
    assert client.get('/api/conversations', headers={'Authorization': ''}).status_code == 401
    assert client.get('/api/conversations/missing').status_code == 404
    assert client.post('/api/conversations', json={'title': 123}).status_code == 422
    created = client.post('/api/conversations', json={})
    assert created.status_code == 201
    cid = created.json()['id']
    assert client.get('/api/conversations').json()[0]['id'] == cid
    assert client.post(f'/api/conversations/{cid}/messages', json={'message_id': 'm', 'text': 'hi'}).status_code == 201
    assert client.post(f'/api/conversations/{cid}/messages', json={'message_id': 'm', 'text': 'changed'}).status_code == 409
    assert client.post(f'/api/conversations/{cid}/messages', json={'message_id': '../bad', 'text': 'hi'}).status_code == 422


def test_stream_saves_only_terminal_result_and_replays(client):
    cid = client.post('/api/conversations', json={}).json()['id']
    payload = {'conversation_id': cid, 'message_id': 'client-1', 'text': 'hi'}
    with patch('main.process_arcus_message', AsyncMock(return_value={'message': 'real', 'schedules': []})) as process:
        first = events(client.post('/api/arcus/message/stream', json=payload))
        second = events(client.post('/api/arcus/message/stream', json=payload))
        assert process.await_count == 1
    assert first[-1]['type'] == second[-1]['type'] == 'completed'
    assert first[-1]['assistant_message_id'] == second[-1]['assistant_message_id']
    messages = client.get(f'/api/conversations/{cid}').json()['messages']
    assert [(m['role'], m['text']) for m in messages] == [('user', 'hi'), ('assistant', 'real')]
    assert messages[1]['result']['schedules'] == []


def test_failed_processing_does_not_make_assistant_message(client):
    cid = client.post('/api/conversations', json={}).json()['id']
    with patch('main.process_arcus_message', AsyncMock(side_effect=RuntimeError('private detail'))):
        response = client.post('/api/arcus/message/stream', json={
            'conversation_id': cid, 'message_id': 'fail', 'text': 'hi'})
    assert events(response)[-1]['type'] == 'failed'
    assert 'private detail' not in response.text
    messages = client.get(f'/api/conversations/{cid}').json()['messages']
    assert len(messages) == 1
    assert messages[0]['status'] == 'failed'


def test_pdf_original_roundtrip_and_no_fake_analysis(client):
    raw = b'%PDF-1.7\noriginal'
    item = client.post('/api/attachments', json={
        'name': 'original.pdf', 'mime_type': 'application/pdf', 'byte_size': len(raw)}).json()
    assert client.put(f"/api/attachments/{item['id']}?offset=0", content=raw).status_code == 200
    assert client.get(f"/api/attachments/{item['id']}").status_code == 404
    cid = client.post('/api/conversations', json={}).json()['id']
    with patch('main.process_arcus_message', AsyncMock()) as process:
        response = client.post('/api/arcus/message/stream', json={
            'conversation_id': cid, 'message_id': 'pdf', 'text': '분석해줘', 'attachment_ids': [item['id']]})
        assert 'PDF' in events(response)[-1]['message']
        process.assert_not_awaited()
    downloaded = client.get(f"/api/attachments/{item['id']}")
    assert downloaded.content == raw
    assert downloaded.headers['cache-control'] == 'no-store'


def test_empty_and_missing_ids_rejected_before_persistence(client):
    cid = client.post('/api/conversations', json={}).json()['id']
    assert client.post('/api/arcus/message/stream', json={'conversation_id': cid, 'text': 'no id'}).status_code == 422
    assert client.post('/api/arcus/message/stream', json={'conversation_id': cid, 'message_id': 'empty'}).status_code == 422
    assert client.get(f'/api/conversations/{cid}').json()['messages'] == []


def test_replay_after_assistant_edit_preserves_updated_source(client):
    from services.conversation_sync import revise_message
    cid = client.post('/api/conversations', json={}).json()['id']
    payload = {'conversation_id': cid, 'message_id': 'edit-replay', 'text': 'hi'}
    with patch('main.process_arcus_message', AsyncMock(return_value='before')):
        terminal = events(client.post('/api/arcus/message/stream', json=payload))[-1]
    revise_message(client.app.state.conversations, terminal['assistant_message_id'], 1, 'after')
    replayed = events(client.post('/api/arcus/message/stream', json=payload))[-1]
    assert replayed['type'] == 'completed'
    assert replayed['result']['message'] == 'after'


def test_http_and_sse_share_one_result(client):
    cid = client.post('/api/conversations', json={}).json()['id']
    payload = {'conversation_id': cid, 'message_id': 'both', 'text': 'hi'}
    with patch('main.process_arcus_message', AsyncMock(return_value='one answer')) as process:
        first = client.post('/api/arcus/message', json=payload)
        second = client.post('/api/arcus/message/stream', json=payload)
        assert process.await_count == 1
    assert first.json()['message'] == events(second)[-1]['message'] == 'one answer'
    assert first.headers['cache-control'] == 'no-store'


def test_storage_failure_never_emits_completed(client):
    cid = client.post('/api/conversations', json={}).json()['id']
    with patch('main.process_arcus_message', AsyncMock(return_value='answer')):
        with patch('services.conversation_processing.complete', side_effect=OSError('private disk path')):
            response = client.post('/api/arcus/message/stream', json={
                'conversation_id': cid, 'message_id': 'disk', 'text': 'hi'})
    assert [e['type'] for e in events(response)] == ['accepted', 'failed']
    assert len(client.get(f'/api/conversations/{cid}').json()['messages']) == 1
    assert 'private disk path' not in response.text

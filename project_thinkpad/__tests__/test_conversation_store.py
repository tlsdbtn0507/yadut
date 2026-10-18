import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from services.conversation_store import ConversationStore, Conflict
from services.conversation_sync import changes_since, finish_extraction, revise_message


@pytest.fixture
def store(tmp_path):
    value = ConversationStore(tmp_path / 'data', tmp_path / 'files')
    value.initialize()
    return value


def test_initialize_sort_order_idempotency_and_foreign_keys(store):
    first = store.create_conversation('first')
    second = store.create_conversation('second')
    message = store.add_message(first['id'], 'client-1', 'original')
    assert store.add_message(first['id'], 'client-1', 'original') == message
    store.add_message(first['id'], 'client-2', 'next')
    assert store.list_conversations()[0]['id'] == first['id']
    assert [m['id'] for m in store.conversation(first['id'])['messages']] == ['client-1', 'client-2']
    with pytest.raises(Conflict):
        store.add_message(second['id'], 'client-1', 'original')
    with pytest.raises(Conflict):
        store.add_message(first['id'], 'client-1', 'changed')
    with store.connect() as db:
        assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
        assert db.execute('PRAGMA journal_mode').fetchone()[0] == 'wal'
        with pytest.raises(sqlite3.IntegrityError):
            db.execute('UPDATE messages SET conversation_id=? WHERE id=?', ('missing', 'client-1'))
    store.initialize()
    assert store.conversation(first['id'])['messages'][0]['text'] == 'original'


def test_concurrent_duplicate_has_one_message(store):
    cid = store.create_conversation()['id']
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: store.add_message(cid, 'same', 'text'), range(8)))
    assert len({m['id'] for m in results}) == 1
    assert len(store.conversation(cid)['messages']) == 1


def test_revisions_tombstones_and_extraction_are_replayable(store):
    cid = store.create_conversation()['id']
    original = store.add_message(cid, 'source', '직장 A')
    assert finish_extraction(store, 'source', 1, 'extractor-v1') is True
    assert finish_extraction(store, 'source', 1, 'extractor-v1') is False
    changed = revise_message(store, 'source', 1, '직장 B')
    assert changed['id'] == original['id']
    assert changed['created_at'] == original['created_at']
    assert changed['revision'] == 2
    with pytest.raises(Conflict):
        finish_extraction(store, 'source', 1, 'extractor-v2')
    revise_message(store, 'source', 2, None)
    events = changes_since(store, 0)
    assert [event['operation'] for event in events] == ['created', 'updated', 'deleted']
    assert all(event['message_id'] == 'source' for event in events)
    assert changes_since(store, events[1]['sequence']) == events[2:]
    assert store.conversation(cid)['messages'] == []
    with store.connect() as db:
        assert db.execute('SELECT status FROM message_extractions').fetchone()[0] == 'invalidated'


def test_future_schema_and_repo_paths_are_rejected(store):
    with store.connect() as db:
        db.execute('PRAGMA user_version=99')
    with pytest.raises(RuntimeError):
        store.initialize()
    with pytest.raises(ValueError):
        ConversationStore(Path(__file__).resolve().parents[2] / 'data', store.attachment_dir)


def test_revision_snapshots_and_pending_extraction(store):
    from services.conversation_sync import pending_sources, source_revision
    cid = store.create_conversation()['id']
    store.add_message(cid, 'revision-source', '원래 문장')
    assert pending_sources(store, 'v1')[0]['id'] == 'revision-source'
    finish_extraction(store, 'revision-source', 1, 'v1')
    assert pending_sources(store, 'v1') == []
    revise_message(store, 'revision-source', 1, '수정한 문장')
    assert source_revision(store, 'revision-source', 1)['text'] == '원래 문장'
    assert pending_sources(store, 'v1')[0]['revision'] == 2
    revise_message(store, 'revision-source', 2, None)
    assert source_revision(store, 'revision-source', 1)['text'] is None
    assert pending_sources(store, 'v1') == []


def test_concurrent_claim_and_restart_do_not_repeat_processing(store):
    from services.conversation_processing import claim_request
    cid = store.create_conversation()['id']
    payload = {'text': 'once'}
    def claim(_):
        try:
            return claim_request(store, cid, 'claim', 'once', [], payload)['status']
        except Conflict:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(claim, range(4)))
    assert results.count('processing') == 1
    assert results.count('conflict') == 3
    store.recover_interrupted()
    assert claim_request(store, cid, 'claim', 'once', [], payload)['status'] == 'interrupted'
    assert len(store.conversation(cid)['messages']) == 1

import pytest
from services.conversation_store import ConversationStore, Conflict
from services.attachment_store import begin_upload, append_chunk, attachment_path, resolve_relative


@pytest.fixture
def store(tmp_path):
    store = ConversationStore(tmp_path / 'data', tmp_path / 'files')
    store.initialize()
    return store


def test_original_bytes_chunk_retry_and_bind(store):
    raw = b'%PDF-1.7\noriginal bytes'
    item = begin_upload(store, '근무표.pdf', 'application/pdf', len(raw))
    append_chunk(store, item['id'], 0, raw[:8])
    append_chunk(store, item['id'], 0, raw[:8])
    assert append_chunk(store, item['id'], 8, raw[8:])['ready'] == 1
    assert attachment_path(store, item['id']).read_bytes() == raw
    cid = store.create_conversation()['id']
    value = store.add_message(cid, 'm1', '', [item['id']])
    assert value['attachments'][0]['original_name'] == '근무표.pdf'
    assert 'relative_path' not in value['attachments'][0]
    with pytest.raises(Conflict):
        append_chunk(store, item['id'], 0, b'other')


@pytest.mark.parametrize('path', ['../secret', '/etc/passwd', 'a/../../secret', 'a\\secret'])
def test_reject_paths(store, path):
    with pytest.raises(ValueError):
        resolve_relative(store, path)


def test_symlink_and_invalid_file_content(store, tmp_path):
    (store.attachment_dir / 'link').symlink_to(tmp_path)
    with pytest.raises(ValueError):
        resolve_relative(store, 'link/secret')
    with pytest.raises(ValueError):
        begin_upload(store, '../secret.pdf', 'application/pdf', 100)
    item = begin_upload(store, 'fake.pdf', 'application/pdf', 5)
    with pytest.raises(ValueError):
        append_chunk(store, item['id'], 0, b'hello')

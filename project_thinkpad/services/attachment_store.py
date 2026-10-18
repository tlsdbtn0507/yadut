"""Bounded, resumable local uploads. Client filenames never become disk paths."""
import os
from pathlib import Path, PurePosixPath
from uuid import uuid4

from services.conversation_store import ConversationStore, Conflict, Record, utc_now

MAX_BYTES = 20 * 1024 * 1024
CHUNK_BYTES = 512 * 1024
MIME_KINDS = {'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
              'image/gif': 'image', 'image/heic': 'image', 'image/heif': 'image',
              'application/pdf': 'pdf', 'text/plain': 'text'}


def resolve_relative(store: ConversationStore, relative: str) -> Path:
    path = PurePosixPath(relative)
    if not relative or path.is_absolute() or '..' in path.parts or '\\' in relative:
        raise ValueError('Unsafe attachment path')
    candidate = store.attachment_dir / relative
    for part in (candidate, *candidate.parents):
        if part == store.attachment_dir:
            break
        if part.is_symlink():
            raise ValueError('Attachment symlinks are not allowed')
    if not candidate.resolve().is_relative_to(store.attachment_dir):
        raise ValueError('Attachment escapes data directory')
    return candidate


def begin_upload(store: ConversationStore, name: str, mime: str, size: int) -> Record:
    if (not name or len(name) > 255 or any(char in name for char in ('/', '\\', '\x00'))
            or any(ord(char) < 32 for char in name) or name in ('.', '..')
            or mime not in MIME_KINDS or not 0 < size <= MAX_BYTES):
        raise ValueError('Invalid attachment metadata or size')
    attachment_id = str(uuid4())
    now = utc_now()
    with store.connect() as db:
        db.execute('INSERT INTO attachments(id,kind,original_name,relative_path,mime_type,byte_size,'
                   'created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                   (attachment_id, MIME_KINDS[mime], name, attachment_id, mime, size, now, now))
    return {'id': attachment_id, 'received': 0, 'ready': 0}


def valid_signature(mime: str, data: bytes) -> bool:
    if mime == 'text/plain':
        try:
            return '\x00' not in data.decode('utf-8')
        except UnicodeDecodeError:
            return False
    if mime in ('image/heic', 'image/heif'):
        return len(data) >= 12 and data[4:8] == b'ftyp' and data[8:12] in (
            b'heic', b'heix', b'hevc', b'hevx', b'mif1', b'msf1')
    signatures = {'application/pdf': (b'%PDF-',), 'image/jpeg': (b'\xff\xd8\xff',),
                  'image/png': (b'\x89PNG\r\n\x1a\n',), 'image/gif': (b'GIF87a', b'GIF89a')}
    if mime == 'image/webp':
        return data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    return data.startswith(signatures.get(mime, ()))


def write_chunk(path: Path, offset: int, data: bytes, received: int) -> None:
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'r+b') as target:
        target.seek(offset)
        if offset < received:
            if offset + len(data) > received or target.read(len(data)) != data:
                raise Conflict('Chunk differs from stored bytes')
            return
        target.write(data)
        target.truncate(offset + len(data))
        target.flush()
        os.fsync(target.fileno())


def append_chunk(store: ConversationStore, attachment_id: str, offset: int, data: bytes) -> Record:
    if not data or len(data) > CHUNK_BYTES or offset < 0:
        raise ValueError('Invalid chunk')
    # SQLite serializes small local file writes too; one user, bounded 512 KiB chunks.
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM attachments WHERE id=?', (attachment_id,)).fetchone()
        if row is None:
            raise KeyError(attachment_id)
        if offset > row['received'] or offset + len(data) > row['byte_size']:
            raise Conflict('Invalid upload offset')
        path = resolve_relative(store, row['relative_path'])
        if row['ready']:
            with path.open('rb') as source:
                source.seek(offset)
                if source.read(len(data)) != data:
                    raise Conflict('Completed upload is immutable')
            return {'id': attachment_id, 'received': row['received'], 'ready': 1}
        write_chunk(path, offset, data, row['received'])
        received = max(row['received'], offset + len(data))
        ready = int(received == row['byte_size'])
        if ready and not valid_signature(row['mime_type'], path.read_bytes()):
            raise ValueError('File content does not match MIME type')
        db.execute('UPDATE attachments SET received=?,ready=?,updated_at=? WHERE id=?',
                   (received, ready, utc_now(), attachment_id))
        return {'id': attachment_id, 'received': received, 'ready': ready}


def attachment_path(store: ConversationStore, attachment_id: str) -> Path:
    with store.connect() as db:
        row = db.execute('SELECT relative_path FROM attachments WHERE id=? AND ready=1',
                         (attachment_id,)).fetchone()
        if row is None:
            raise KeyError(attachment_id)
        return resolve_relative(store, row['relative_path'])

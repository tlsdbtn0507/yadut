"""SQLite source records; connections and write transactions are short-lived."""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from services.conversation_schema import SCHEMA_VERSION, STATEMENTS

Record = dict[str, object]
REPOSITORY = Path(__file__).resolve().parents[2]


class Conflict(Exception):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def private_directory(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved == REPOSITORY or REPOSITORY in resolved.parents:
        raise ValueError('Data directories must be outside the repository')
    resolved.mkdir(parents=True, exist_ok=True, mode=0o700)
    resolved.chmod(0o700)
    return resolved


def source_change(db: sqlite3.Connection, message_id: str, revision: int, operation: str) -> None:
    db.execute('INSERT INTO message_revisions SELECT id,revision,text,result_json,updated_at '
               'FROM messages WHERE id=?', (message_id,))
    if operation == 'deleted':
        db.execute('UPDATE message_revisions SET text=NULL,result_json=NULL WHERE message_id=?', (message_id,))
    db.execute('INSERT INTO message_changes(message_id,revision,operation,created_at) VALUES(?,?,?,?)',
               (message_id, revision, operation, utc_now()))


class ConversationStore:
    def __init__(self, data_dir: Path, attachment_dir: Path):
        self.data_dir = private_directory(data_dir)
        self.attachment_dir = private_directory(attachment_dir)
        self.path = self.data_dir / 'conversations.sqlite3'
        if self.path.is_symlink():
            raise ValueError('Database symlinks are not allowed')
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        os.close(fd)
        self.path.chmod(0o600)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA busy_timeout=5000')
        try:
            with db:
                yield db
        finally:
            db.close()

    def initialize(self) -> None:
        with self.connect() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('BEGIN IMMEDIATE')
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > SCHEMA_VERSION:
                raise RuntimeError('Unsupported database schema version')
            if version == 0:
                for statement in STATEMENTS:
                    db.execute(statement)
                db.execute('PRAGMA user_version=1')

    def recover_interrupted(self) -> None:
        # Call only at single-worker startup; never steal a live request's lease.
        with self.connect() as db:
            db.execute("UPDATE messages SET status='interrupted',updated_at=?,error_code='server_restarted' "
                       "WHERE status='processing'", (utc_now(),))

    def create_conversation(self, title: str = '새 대화') -> Record:
        now = utc_now()
        value = dict(id=str(uuid4()), title=title, created_at=now, updated_at=now)
        with self.connect() as db:
            db.execute('INSERT INTO conversations VALUES(?,?,?,?)', tuple(value.values()))
        return value

    def list_conversations(self) -> list[Record]:
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM conversations ORDER BY updated_at DESC,id')]

    def conversation(self, conversation_id: str) -> Record:
        with self.connect() as db:
            db.execute('BEGIN')
            row = db.execute('SELECT * FROM conversations WHERE id=?', (conversation_id,)).fetchone()
            if row is None:
                raise KeyError(conversation_id)
            messages = db.execute('SELECT * FROM messages WHERE conversation_id=? AND deleted_at IS NULL '
                                  'ORDER BY sequence', (conversation_id,)).fetchall()
            return {**dict(row), 'messages': [self.message_record(db, item) for item in messages]}

    def message_record(self, db: sqlite3.Connection, row: sqlite3.Row) -> Record:
        value = dict(row)
        value.pop('request_hash', None)
        value['result'] = json.loads(value.pop('result_json') or 'null')
        value['attachments'] = [dict(item) for item in db.execute(
            'SELECT id,kind,original_name,mime_type,byte_size,created_at,updated_at '
            'FROM attachments WHERE message_id=? AND ready=1 ORDER BY id', (row['id'],))]
        return value

    def add_message(self, conversation_id: str, message_id: str, text: str,
                    attachment_ids: list[str] | None = None) -> Record:
        ids = sorted(attachment_ids or [])
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM conversations WHERE id=?', (conversation_id,)).fetchone():
                raise KeyError(conversation_id)
            old = db.execute('SELECT * FROM messages WHERE id=?', (message_id,)).fetchone()
            if old:
                return self.check_duplicate(db, old, conversation_id, text, ids)
            self.validate_attachments(db, ids)
            now = utc_now()
            db.execute("INSERT INTO messages(id,conversation_id,role,text,created_at,updated_at,status) "
                       "VALUES(?,?,'user',?,?,?,'queued')", (message_id, conversation_id, text, now, now))
            for attachment_id in ids:
                db.execute('UPDATE attachments SET message_id=?,updated_at=? WHERE id=?',
                           (message_id, now, attachment_id))
            source_change(db, message_id, 1, 'created')
            db.execute('UPDATE conversations SET updated_at=?,title=CASE WHEN title=? THEN ? ELSE title END '
                       'WHERE id=?', (now, '새 대화', text.strip()[:80] or '첨부 대화', conversation_id))
            return self.message_record(db, db.execute('SELECT * FROM messages WHERE id=?', (message_id,)).fetchone())

    def check_duplicate(self, db: sqlite3.Connection, old: sqlite3.Row,
                        conversation_id: str, text: str, ids: list[str]) -> Record:
        value = self.message_record(db, old)
        attached = [str(item['id']) for item in value['attachments']]
        if (old['conversation_id'] != conversation_id or old['text'] != text
                or old['role'] != 'user' or old['deleted_at'] or attached != ids):
            raise Conflict('Message ID already used with different content')
        return value

    def validate_attachments(self, db: sqlite3.Connection, ids: list[str]) -> None:
        if len(ids) != len(set(ids)):
            raise ValueError('Duplicate attachment ID')
        for attachment_id in ids:
            row = db.execute('SELECT * FROM attachments WHERE id=?', (attachment_id,)).fetchone()
            if row is None or not row['ready'] or row['message_id']:
                raise Conflict('Attachment unavailable')


def configured_store() -> ConversationStore:
    data = Path(os.getenv('YADUT_DATA_DIR', '~/.local/share/yadut')).expanduser()
    attachments = Path(os.getenv('YADUT_ATTACHMENT_DIR', str(data / 'attachments')))
    return ConversationStore(data, attachments)

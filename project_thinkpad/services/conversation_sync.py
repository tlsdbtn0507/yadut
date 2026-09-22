"""Local pull interface for future consumers, independent of ontology storage.

Consumers upsert facts by source_message_id + source_revision + processing_version,
then acknowledge. A crash between their commit and acknowledgement is safe to replay.
"""
from services.conversation_store import ConversationStore, Conflict, Record, source_change, utc_now


def changes_since(store: ConversationStore, sequence: int, limit: int = 100) -> list[Record]:
    if sequence < 0 or not 1 <= limit <= 1000:
        raise ValueError('Invalid cursor or limit')
    with store.connect() as db:
        return [dict(row) for row in db.execute(
            'SELECT * FROM message_changes WHERE sequence>? ORDER BY sequence LIMIT ?', (sequence, limit))]


def extraction_source(store: ConversationStore, message_id: str) -> Record:
    with store.connect() as db:
        row = db.execute('SELECT * FROM messages WHERE id=?', (message_id,)).fetchone()
        if row is None:
            raise KeyError(message_id)
        return store.message_record(db, row)


def finish_extraction(store: ConversationStore, message_id: str, revision: int,
                      processing_version: str, status: str = 'completed') -> bool:
    if not processing_version.strip() or status not in ('pending', 'completed', 'failed'):
        raise ValueError('Invalid extraction state')
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT revision,deleted_at FROM messages WHERE id=?', (message_id,)).fetchone()
        if row is None:
            raise KeyError(message_id)
        if row['revision'] != revision or row['deleted_at']:
            raise Conflict('Source revision is no longer current')
        cursor = db.execute(
            'INSERT INTO message_extractions VALUES(?,?,?,?,?) '
            'ON CONFLICT(message_id,revision,processing_version) DO UPDATE SET '
            "status=excluded.status,processed_at=excluded.processed_at WHERE message_extractions.status!='completed'",
            (message_id, revision, processing_version, status, utc_now() if status != 'pending' else None))
        return cursor.rowcount == 1


def revise_message(store: ConversationStore, message_id: str, expected_revision: int,
                   text: str | None) -> Record:
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM messages WHERE id=?', (message_id,)).fetchone()
        if row is None:
            raise KeyError(message_id)
        if row['revision'] != expected_revision or row['deleted_at'] or row['status'] == 'processing':
            raise Conflict('Source changed or is processing')
        now = utc_now()
        db.execute('UPDATE messages SET text=?,revision=revision+1,updated_at=?,deleted_at=?,result_json=NULL '
                   'WHERE id=?', (text if text is not None else '', now, now if text is None else None, message_id))
        db.execute("UPDATE message_extractions SET status='invalidated' WHERE message_id=?", (message_id,))
        db.execute('UPDATE conversations SET updated_at=? WHERE id=?', (now, row['conversation_id']))
        source_change(db, message_id, expected_revision + 1, 'deleted' if text is None else 'updated')
        return store.message_record(db, db.execute('SELECT * FROM messages WHERE id=?', (message_id,)).fetchone())


def source_revision(store: ConversationStore, message_id: str, revision: int) -> Record:
    with store.connect() as db:
        row = db.execute('SELECT * FROM message_revisions WHERE message_id=? AND revision=?',
                         (message_id, revision)).fetchone()
        if row is None:
            raise KeyError(message_id)
        return dict(row)


def pending_sources(store: ConversationStore, processing_version: str, limit: int = 100) -> list[Record]:
    if not processing_version.strip() or not 1 <= limit <= 1000:
        raise ValueError('Invalid version or limit')
    with store.connect() as db:
        rows = db.execute(
            "SELECT m.* FROM messages m WHERE m.deleted_at IS NULL AND NOT EXISTS "
            "(SELECT 1 FROM message_extractions e WHERE e.message_id=m.id AND e.revision=m.revision "
            "AND e.processing_version=? AND e.status='completed') ORDER BY m.sequence LIMIT ?",
            (processing_version, limit)).fetchall()
        return [store.message_record(db, row) for row in rows]

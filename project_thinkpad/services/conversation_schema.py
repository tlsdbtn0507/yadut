"""Version 1: immutable identities, local originals, replayable source changes."""

SCHEMA_VERSION = 1
STATEMENTS = (
    '''CREATE TABLE conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''',
    '''CREATE TABLE messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id),
        role TEXT NOT NULL CHECK(role IN ('user','assistant')), text TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued','processing','completed','failed','interrupted')),
        revision INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
        result_json TEXT, request_hash TEXT, error_code TEXT, error_stage TEXT,
        reply_to TEXT UNIQUE REFERENCES messages(id))''',
    '''CREATE TABLE attachments (
        id TEXT PRIMARY KEY, message_id TEXT REFERENCES messages(id),
        kind TEXT NOT NULL, original_name TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL, byte_size INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0,
        ready INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''',
    '''CREATE TABLE message_changes (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id TEXT NOT NULL REFERENCES messages(id), revision INTEGER NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('created','updated','deleted')),
        created_at TEXT NOT NULL, UNIQUE(message_id,revision))''',
    '''CREATE TABLE message_extractions (
        message_id TEXT NOT NULL REFERENCES messages(id), revision INTEGER NOT NULL,
        processing_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','invalidated')),
        processed_at TEXT, PRIMARY KEY(message_id,revision,processing_version))''',
    '''CREATE TABLE message_revisions (
        message_id TEXT NOT NULL REFERENCES messages(id), revision INTEGER NOT NULL,
        text TEXT, result_json TEXT, created_at TEXT NOT NULL,
        PRIMARY KEY(message_id,revision))''',
    'CREATE INDEX conversations_updated ON conversations(updated_at DESC,id)',
    'CREATE INDEX messages_conversation ON messages(conversation_id,sequence)',
    'CREATE INDEX attachments_message ON attachments(message_id)',
    'CREATE INDEX extractions_status ON message_extractions(status,message_id)',
)

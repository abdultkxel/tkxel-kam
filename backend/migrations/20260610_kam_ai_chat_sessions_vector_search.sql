CREATE TABLE IF NOT EXISTS kam_ai_chat_sessions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL DEFAULT 'New KAM AI chat',
    account_id VARCHAR(36) NULL REFERENCES accounts(id) ON DELETE SET NULL,
    scope_json JSON NOT NULL DEFAULT '[]',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    last_message_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_sessions_user_id ON kam_ai_chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_sessions_account_id ON kam_ai_chat_sessions(account_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_sessions_status ON kam_ai_chat_sessions(status);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_sessions_last_message_at ON kam_ai_chat_sessions(last_message_at);

CREATE TABLE IF NOT EXISTS kam_ai_chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL REFERENCES kam_ai_chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(40) NOT NULL,
    content TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    intent VARCHAR(80) NULL,
    confidence VARCHAR(40) NULL,
    model_provider VARCHAR(80) NULL,
    model_name VARCHAR(160) NULL,
    token_usage_json JSON NOT NULL DEFAULT '{}',
    metadata_json JSON NOT NULL DEFAULT '{}',
    error_message TEXT NULL,
    ai_gateway_run_id VARCHAR(36) NULL REFERENCES ai_gateway_runs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_session_id ON kam_ai_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_role ON kam_ai_chat_messages(role);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_status ON kam_ai_chat_messages(status);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_intent ON kam_ai_chat_messages(intent);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_ai_gateway_run_id ON kam_ai_chat_messages(ai_gateway_run_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_messages_created_at ON kam_ai_chat_messages(created_at);

CREATE TABLE IF NOT EXISTS kam_ai_chat_message_sources (
    id VARCHAR(36) PRIMARY KEY,
    message_id VARCHAR(36) NOT NULL REFERENCES kam_ai_chat_messages(id) ON DELETE CASCADE,
    account_id VARCHAR(36) NULL REFERENCES accounts(id) ON DELETE SET NULL,
    account_name VARCHAR(180) NULL,
    source_type VARCHAR(80) NOT NULL,
    source_record_id VARCHAR(80) NOT NULL,
    title VARCHAR(220) NOT NULL,
    excerpt TEXT NOT NULL,
    source_route VARCHAR(500) NULL,
    relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    citation_index INTEGER NOT NULL DEFAULT 0,
    metadata_json JSON NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_message_sources_message_id ON kam_ai_chat_message_sources(message_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_message_sources_account_id ON kam_ai_chat_message_sources(account_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_message_sources_source_type ON kam_ai_chat_message_sources(source_type);
CREATE INDEX IF NOT EXISTS ix_kam_ai_chat_message_sources_source_record_id ON kam_ai_chat_message_sources(source_record_id);

CREATE TABLE IF NOT EXISTS kam_ai_source_chunks (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    source_type VARCHAR(80) NOT NULL,
    source_record_id VARCHAR(80) NOT NULL,
    source_route VARCHAR(500) NULL,
    title VARCHAR(220) NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_hash VARCHAR(64) NOT NULL,
    embedding_json JSON NULL,
    embedding_provider VARCHAR(80) NULL,
    embedding_model VARCHAR(160) NULL,
    embedding_dimensions INTEGER NOT NULL DEFAULT 0,
    sensitivity_level VARCHAR(40) NOT NULL DEFAULT 'standard',
    permission_module VARCHAR(120) NULL,
    permission_action VARCHAR(40) NULL,
    source_trust_score INTEGER NOT NULL DEFAULT 50,
    metadata_json JSON NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_kam_ai_source_chunks_identity UNIQUE(account_id, source_type, source_record_id, chunk_hash)
);

CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_account_id ON kam_ai_source_chunks(account_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_source_type ON kam_ai_source_chunks(source_type);
CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_source_record_id ON kam_ai_source_chunks(source_record_id);
CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_chunk_hash ON kam_ai_source_chunks(chunk_hash);
CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_sensitivity_level ON kam_ai_source_chunks(sensitivity_level);
CREATE INDEX IF NOT EXISTS ix_kam_ai_source_chunks_permission_module ON kam_ai_source_chunks(permission_module);

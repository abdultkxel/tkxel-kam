CREATE TABLE IF NOT EXISTS document_extractions (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  extraction_id VARCHAR(36) REFERENCES source_document_extractions(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  page_number INTEGER NOT NULL DEFAULT 1,
  source_file VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  extractor_name VARCHAR(120) NOT NULL DEFAULT 'local-document-extractor',
  extractor_version VARCHAR(40) NOT NULL DEFAULT 'v1',
  metadata_json JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_document_extractions_document_page_checksum UNIQUE (document_id, page_number, checksum)
);

CREATE INDEX IF NOT EXISTS ix_document_extractions_document_id ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS ix_document_extractions_extraction_id ON document_extractions(extraction_id);
CREATE INDEX IF NOT EXISTS ix_document_extractions_page_number ON document_extractions(page_number);
CREATE INDEX IF NOT EXISTS ix_document_extractions_source_file ON document_extractions(source_file);
CREATE INDEX IF NOT EXISTS ix_document_extractions_checksum ON document_extractions(checksum);

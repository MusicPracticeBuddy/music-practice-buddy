ALTER TABLE repertoire
    ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_repertoire_active
    ON repertoire (owner_musician_id, title)
    WHERE deleted_at IS NULL;

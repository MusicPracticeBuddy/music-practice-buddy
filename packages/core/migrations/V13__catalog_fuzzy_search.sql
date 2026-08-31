CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_repertoire_approved_title_trgm
    ON repertoire USING GIN (title gin_trgm_ops)
    WHERE status = 'APPROVED'
      AND deleted_at IS NULL;

CREATE INDEX idx_person_name_trgm
    ON person USING GIN (name gin_trgm_ops);

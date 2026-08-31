CREATE INDEX idx_exercise_active_name_trgm
    ON exercise USING GIN (name gin_trgm_ops)
    WHERE deleted_at IS NULL;

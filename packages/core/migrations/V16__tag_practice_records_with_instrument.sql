ALTER TABLE exercise
    ADD COLUMN instrument_id BIGINT
        REFERENCES instrument(id)
        ON DELETE SET NULL;

ALTER TABLE session_template
    ADD COLUMN instrument_id BIGINT
        REFERENCES instrument(id)
        ON DELETE SET NULL;

ALTER TABLE session
    ADD COLUMN instrument_id BIGINT
        REFERENCES instrument(id)
        ON DELETE SET NULL;

CREATE INDEX idx_exercise_instrument_active
    ON exercise (instrument_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_session_template_instrument
    ON session_template (instrument_id);

CREATE INDEX idx_session_instrument
    ON session (instrument_id);

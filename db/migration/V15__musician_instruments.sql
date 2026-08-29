CREATE TABLE musician_instrument (
    musician_id BIGINT NOT NULL
        REFERENCES musician(id)
        ON DELETE CASCADE,
    instrument_id BIGINT NOT NULL
        REFERENCES instrument(id)
        ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (musician_id, instrument_id)
);

CREATE INDEX idx_musician_instrument_instrument
    ON musician_instrument (instrument_id);

ALTER TABLE person
    ADD COLUMN external_id TEXT,
    ADD COLUMN owner_musician_id BIGINT
        REFERENCES musician(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT uq_person_external_id UNIQUE (external_id),
    ADD CONSTRAINT chk_person_external_id_not_blank
        CHECK (external_id IS NULL OR btrim(external_id) <> ''),
    ADD CONSTRAINT chk_person_external_owner
        CHECK (external_id IS NULL OR owner_musician_id IS NULL);

ALTER TABLE instrument
    ADD COLUMN external_id TEXT,
    ADD COLUMN owner_musician_id BIGINT
        REFERENCES musician(id)
        ON DELETE SET NULL,
    ADD CONSTRAINT uq_instrument_external_id UNIQUE (external_id),
    ADD CONSTRAINT chk_instrument_external_id_not_blank
        CHECK (external_id IS NULL OR btrim(external_id) <> ''),
    ADD CONSTRAINT chk_instrument_external_owner
        CHECK (external_id IS NULL OR owner_musician_id IS NULL);

ALTER TABLE repertoire
    ADD COLUMN external_id TEXT,
    ADD COLUMN publication_date DATE,
    ADD COLUMN publication_date_precision TEXT,
    ADD COLUMN publication_date_source TEXT,
    ADD CONSTRAINT uq_repertoire_external_id UNIQUE (external_id),
    ADD CONSTRAINT chk_repertoire_external_id_not_blank
        CHECK (external_id IS NULL OR btrim(external_id) <> ''),
    ADD CONSTRAINT chk_repertoire_external_owner
        CHECK (external_id IS NULL OR owner_musician_id IS NULL),
    ADD CONSTRAINT chk_repertoire_publication_date_precision
        CHECK (publication_date_precision IN ('year', 'month', 'day')),
    ADD CONSTRAINT chk_repertoire_publication_date_source
        CHECK (publication_date_source IN ('publication', 'inception', 'first_performance')),
    ADD CONSTRAINT chk_repertoire_publication_date_metadata
        CHECK (
            (
                publication_date IS NULL
                AND publication_date_precision IS NULL
                AND publication_date_source IS NULL
            )
            OR
            (
                publication_date IS NOT NULL
                AND publication_date_precision IS NOT NULL
                AND publication_date_source IS NOT NULL
            )
        );

CREATE INDEX idx_person_owner
    ON person (owner_musician_id)
    WHERE owner_musician_id IS NOT NULL;

CREATE INDEX idx_instrument_owner
    ON instrument (owner_musician_id)
    WHERE owner_musician_id IS NOT NULL;

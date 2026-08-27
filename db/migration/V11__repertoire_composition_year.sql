ALTER TABLE repertoire
    ADD COLUMN composition_year INTEGER,
    ADD CONSTRAINT chk_repertoire_composition_year
        CHECK (composition_year BETWEEN -9999 AND 9999);

CREATE INDEX idx_repertoire_public_composition_year
    ON repertoire (composition_year)
    WHERE visibility = 'PUBLIC'
      AND status = 'APPROVED'
      AND deleted_at IS NULL;

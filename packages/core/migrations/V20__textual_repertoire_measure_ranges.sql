ALTER TABLE repertoire
    DROP CONSTRAINT chk_repertoire_measure_range;

ALTER TABLE repertoire
    ALTER COLUMN start_measure TYPE TEXT USING start_measure::text,
    ALTER COLUMN end_measure TYPE TEXT USING end_measure::text;

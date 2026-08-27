CREATE TABLE musician_exercise_library (
    musician_id BIGINT NOT NULL
        REFERENCES musician(id)
        ON DELETE CASCADE,

    exercise_id BIGINT NOT NULL
        REFERENCES exercise(id),

    added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (musician_id, exercise_id)
);

CREATE INDEX idx_musician_exercise_library_exercise
    ON musician_exercise_library (exercise_id);

-- Existing exercises were implicitly part of their owner's library.
INSERT INTO musician_exercise_library (musician_id, exercise_id)
SELECT musician_id, id
FROM exercise;

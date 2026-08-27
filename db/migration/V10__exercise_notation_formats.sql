UPDATE exercise
SET notation_format = 'text'
WHERE notation_format NOT IN ('text', 'abc');

ALTER TABLE exercise
    ALTER COLUMN notation_format SET DEFAULT 'text',
    ADD CONSTRAINT exercise_notation_format_check
        CHECK (notation_format IN ('text', 'abc'));

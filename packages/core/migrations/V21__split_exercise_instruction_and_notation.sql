ALTER TABLE exercise
    ADD COLUMN instruction TEXT;

UPDATE exercise
SET instruction = notation,
    notation = NULL
WHERE notation_format = 'text';

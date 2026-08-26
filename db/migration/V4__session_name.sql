ALTER TABLE session
    ADD COLUMN name TEXT;

UPDATE session
SET name = COALESCE(
    (SELECT template.name FROM session_template template WHERE template.id = session.session_template_id),
    'Open practice'
);

ALTER TABLE session
    ALTER COLUMN name SET NOT NULL,
    ADD CONSTRAINT chk_session_name
        CHECK (char_length(btrim(name)) BETWEEN 1 AND 200);

ALTER TABLE session_template_item
    RENAME COLUMN notes TO instruction;

ALTER TABLE session_item
    RENAME COLUMN notes TO instruction;

ALTER TABLE session_item
    ADD COLUMN session_note TEXT;

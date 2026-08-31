ALTER TABLE session_item
    ADD COLUMN added_during_session BOOLEAN NOT NULL DEFAULT FALSE;

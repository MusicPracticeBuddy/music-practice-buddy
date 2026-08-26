ALTER TABLE session
    ADD COLUMN assigned_date DATE;

UPDATE session
SET assigned_date = assigned_at::date
WHERE assigned_at IS NOT NULL;

ALTER TABLE session
    ADD CONSTRAINT chk_session_assigned_schedule
        CHECK (assigned_at IS NULL OR assigned_date IS NOT NULL);

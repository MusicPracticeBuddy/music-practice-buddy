CREATE TYPE session_timing_mode AS ENUM (
    'MANUAL',
    'AUTO'
);

CREATE TYPE session_item_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'COMPLETE',
    'SKIPPED'
);

ALTER TABLE session
    ADD COLUMN timing_mode session_timing_mode;

ALTER TABLE session_item
    ADD COLUMN status session_item_status NOT NULL DEFAULT 'NOT_STARTED';

UPDATE session_item
SET status = CASE
    WHEN ended_at IS NOT NULL THEN 'COMPLETE'::session_item_status
    WHEN started_at IS NOT NULL THEN 'IN_PROGRESS'::session_item_status
    ELSE 'NOT_STARTED'::session_item_status
END
WHERE type <> 'SECTION';

WITH RECURSIVE descendants AS (
    SELECT section.id AS section_id, child.id, child.status
    FROM session_item section
    JOIN session_item child ON child.parent_id = section.id
    WHERE section.type = 'SECTION'

    UNION ALL

    SELECT descendants.section_id, child.id, child.status
    FROM descendants
    JOIN session_item child ON child.parent_id = descendants.id
), section_states AS (
    SELECT
        section_id,
        CASE
            WHEN bool_and(item.status = 'COMPLETE') THEN 'COMPLETE'::session_item_status
            WHEN bool_or(item.status IN ('IN_PROGRESS', 'COMPLETE')) THEN 'IN_PROGRESS'::session_item_status
            ELSE 'NOT_STARTED'::session_item_status
        END AS status
    FROM descendants
    JOIN session_item item ON item.id = descendants.id
    WHERE item.type <> 'SECTION'
    GROUP BY section_id
)
UPDATE session_item section
SET status = section_states.status
FROM section_states
WHERE section.id = section_states.section_id;

UPDATE session
SET timing_mode = 'MANUAL'
WHERE status <> 'PLANNED';

ALTER TABLE session_item
    ADD CONSTRAINT chk_session_item_status_times
        CHECK (
            (type = 'SECTION' AND started_at IS NULL AND ended_at IS NULL)
            OR (
                type <> 'SECTION'
                AND (
                    (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND ended_at IS NULL)
                    OR (status = 'COMPLETE' AND (ended_at IS NULL OR started_at IS NOT NULL))
                    OR (status IN ('NOT_STARTED', 'SKIPPED') AND started_at IS NULL AND ended_at IS NULL)
                )
            )
        );

CREATE INDEX idx_session_item_session_status
    ON session_item (session_id, status);

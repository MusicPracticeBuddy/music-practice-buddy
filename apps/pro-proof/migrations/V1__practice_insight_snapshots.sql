CREATE SCHEMA IF NOT EXISTS mpb_pro;

CREATE TABLE mpb_pro.practice_insight_snapshot (
    musician_id BIGINT PRIMARY KEY
        REFERENCES public.musician(id)
        ON DELETE CASCADE,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_sessions INTEGER NOT NULL,
    minutes_practiced INTEGER NOT NULL,
    active_days INTEGER NOT NULL,
    CONSTRAINT chk_practice_insight_snapshot_nonnegative
        CHECK (
            completed_sessions >= 0
            AND minutes_practiced >= 0
            AND active_days >= 0
        )
);

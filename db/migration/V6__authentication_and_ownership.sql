-- Authentication sessions and user-facing profile data.
ALTER TABLE musician
    ADD COLUMN display_name TEXT;

UPDATE musician musician
SET display_name = COALESCE(
    (
        SELECT NULLIF(btrim(identity.email), '')
        FROM auth_identity identity
        WHERE identity.musician_id = musician.id
        ORDER BY identity.id
        LIMIT 1
    ),
    'Musician #' || musician.id
);

ALTER TABLE musician
    ALTER COLUMN display_name SET NOT NULL,
    ADD CONSTRAINT chk_musician_display_name
        CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 200);

ALTER TABLE auth_identity
    ADD CONSTRAINT uq_auth_identity_musician_provider
        UNIQUE (musician_id, provider);

-- Existing local databases already contain musicians before this migration.
-- These identities are inert unless the application explicitly enables the
-- development-only login flow. Fresh databases receive friendly usernames
-- from db/test_data/test_data.sql after migrations finish.
INSERT INTO auth_identity (musician_id, provider, provider_user_id)
SELECT musician.id, 'development', 'musician-' || musician.id
FROM musician
WHERE NOT EXISTS (
    SELECT 1
    FROM auth_identity identity
    WHERE identity.musician_id = musician.id
      AND identity.provider = 'development'
);

CREATE TABLE auth_session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    musician_id BIGINT NOT NULL
        REFERENCES musician(id)
        ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_auth_session_token_hash UNIQUE (token_hash),
    CONSTRAINT chk_auth_session_expiration CHECK (expires_at > created_at)
);

CREATE INDEX idx_auth_session_musician
    ON auth_session (musician_id);

CREATE INDEX idx_auth_session_expiration
    ON auth_session (expires_at);

-- Templates use the same private/public model as exercises and repertoire.
ALTER TABLE session_template
    ADD COLUMN visibility visibility_type NOT NULL DEFAULT 'PRIVATE';

CREATE INDEX idx_session_template_public
    ON session_template (updated_at DESC)
    WHERE visibility = 'PUBLIC';

-- A repertoire excerpt is a child and inherits access from its root work.
ALTER TABLE repertoire
    ALTER COLUMN visibility DROP NOT NULL;

UPDATE repertoire
SET owner_musician_id = NULL,
    visibility = NULL
WHERE parent_repertoire_id IS NOT NULL;

ALTER TABLE repertoire
    ADD CONSTRAINT chk_repertoire_inherited_access
        CHECK (
            (
                parent_repertoire_id IS NULL
                AND visibility IS NOT NULL
                AND (owner_musician_id IS NOT NULL OR visibility = 'PUBLIC')
            )
            OR
            (
                parent_repertoire_id IS NOT NULL
                AND owner_musician_id IS NULL
                AND visibility IS NULL
            )
        );

-- Practice items keep a stable display snapshot even if their source changes.
UPDATE session_template_item item
SET name = COALESCE(exercise.name, 'Untitled exercise')
FROM exercise
WHERE item.type = 'EXERCISE'
  AND exercise.id = item.exercise_id
  AND item.name IS NULL;

UPDATE session_template_item item
SET name = COALESCE(repertoire.title, 'Untitled item')
FROM repertoire
WHERE item.type = 'REPERTOIRE'
  AND repertoire.id = item.repertoire_id
  AND item.name IS NULL;

UPDATE session_item item
SET name = COALESCE(exercise.name, 'Untitled item')
FROM exercise
WHERE item.type = 'EXERCISE'
  AND exercise.id = item.exercise_id
  AND item.name IS NULL;

UPDATE session_item item
SET name = COALESCE(repertoire.title, 'Untitled item')
FROM repertoire
WHERE item.type = 'REPERTOIRE'
  AND repertoire.id = item.repertoire_id
  AND item.name IS NULL;

-- A nested item can only name a parent in the same owning container.
ALTER TABLE session_template_item
    DROP CONSTRAINT session_template_item_parent_id_fkey,
    ADD CONSTRAINT uq_session_template_item_container UNIQUE (id, session_template_id),
    ADD CONSTRAINT fk_session_template_item_parent_container
        FOREIGN KEY (parent_id, session_template_id)
        REFERENCES session_template_item (id, session_template_id)
        ON DELETE CASCADE;

ALTER TABLE session_item
    DROP CONSTRAINT session_item_parent_id_fkey,
    ADD CONSTRAINT uq_session_item_container UNIQUE (id, session_id),
    ADD CONSTRAINT fk_session_item_parent_container
        FOREIGN KEY (parent_id, session_id)
        REFERENCES session_item (id, session_id)
        ON DELETE CASCADE;

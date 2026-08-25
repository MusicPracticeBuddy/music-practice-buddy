-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE visibility_type AS ENUM (
    'PRIVATE',
    'PUBLIC'
);

CREATE TYPE session_status AS ENUM (
    'PLANNED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE repertoire_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE repertoire_credit_role AS ENUM (
    'COMPOSER',
    'ARRANGER',
    'EDITOR',
    'TRANSCRIBER',
    'OTHER'
);

CREATE TYPE repertoire_instrument_role AS ENUM (
    'SOLO',
    'ACCOMPANIMENT',
    'OTHER'
);

CREATE TYPE repertoire_resource_type AS ENUM (
    'SCORE',
    'RECORDING',
    'VIDEO',
    'AUDIO',
    'LINK',
    'OTHER'
);

CREATE TYPE instrument_family AS ENUM (
    'WOODWIND',
    'BRASS',
    'STRING',
    'PERCUSSION',
    'KEYBOARD',
    'ELECTRONIC',
    'OTHER'
);


-- ============================================================
-- COMMON UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE musician (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    is_admin BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE auth_identity (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    musician_id BIGINT NOT NULL
        REFERENCES musician(id)
        ON DELETE CASCADE,

    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    email TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_auth_identity_provider_user
        UNIQUE (provider, provider_user_id)
);


CREATE INDEX idx_auth_identity_musician
    ON auth_identity (musician_id);

CREATE INDEX idx_auth_identity_email
    ON auth_identity (email);


CREATE TRIGGER trg_musician_updated_at
BEFORE UPDATE ON musician
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- INSTRUMENTS
-- ============================================================

CREATE TABLE instrument (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name TEXT NOT NULL,
    family instrument_family NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_instrument_name
        UNIQUE (name)
);


CREATE TRIGGER trg_instrument_updated_at
BEFORE UPDATE ON instrument
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- PEOPLE
--
-- Used for composers, arrangers, editors, transcribers, etc.
-- ============================================================

CREATE TABLE person (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name TEXT NOT NULL,

    birth_date DATE,
    death_date DATE,

    biography_link TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_person_name
    ON person (name);


CREATE TRIGGER trg_person_updated_at
BEFORE UPDATE ON person
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- EXERCISES
--
-- An exercise is a practice instruction/reminder.
--
-- Examples:
--
--   "Long tones"
--   "Practice shifting into 5th position"
--   "Double-tonguing, starting at 80 BPM"
--
-- Notation is optional.
-- ============================================================

CREATE TABLE exercise (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    musician_id BIGINT NOT NULL
        REFERENCES musician(id),

    name TEXT,

    notation TEXT,
    notation_format TEXT NOT NULL DEFAULT 'easyscore',

    copied_from_exercise_id BIGINT
        REFERENCES exercise(id),

    visibility visibility_type NOT NULL DEFAULT 'PRIVATE',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    deleted_at TIMESTAMPTZ
);


CREATE INDEX idx_exercise_musician
    ON exercise (musician_id);

CREATE INDEX idx_exercise_musician_active
    ON exercise (musician_id, created_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_exercise_copied_from
    ON exercise (copied_from_exercise_id);


CREATE TRIGGER trg_exercise_updated_at
BEFORE UPDATE ON exercise
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- REPERTOIRE
--
-- Represents actual musical material.
--
-- Examples:
--
--   Beethoven Sonata No. 8
--   Bach Cello Suite No. 1
--   Etude No. 7 from a particular collection
--
-- A repertoire record can represent either a complete work
-- or a child/excerpt of another repertoire record.
-- ============================================================

CREATE TABLE repertoire (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    title TEXT NOT NULL,

    parent_repertoire_id BIGINT
        REFERENCES repertoire(id),

    -- Optional measure range for excerpts.
    start_measure INTEGER,
    end_measure INTEGER,

    -- NULL means this is a system/global repertoire record.
    -- Non-NULL means it was created/owned by a musician.
    owner_musician_id BIGINT
        REFERENCES musician(id),

    visibility visibility_type NOT NULL DEFAULT 'PUBLIC',

    status repertoire_status NOT NULL DEFAULT 'APPROVED',

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_repertoire_measure_range
        CHECK (
            start_measure IS NULL
            OR end_measure IS NULL
            OR end_measure >= start_measure
        )
);


CREATE INDEX idx_repertoire_title
    ON repertoire (title);

CREATE INDEX idx_repertoire_parent
    ON repertoire (parent_repertoire_id);

CREATE INDEX idx_repertoire_owner
    ON repertoire (owner_musician_id);

CREATE INDEX idx_repertoire_public
    ON repertoire (title)
    WHERE visibility = 'PUBLIC'
      AND status = 'APPROVED';


CREATE TRIGGER trg_repertoire_updated_at
BEFORE UPDATE ON repertoire
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- REPERTOIRE CREDITS
-- ============================================================

CREATE TABLE repertoire_credit (
    repertoire_id BIGINT NOT NULL
        REFERENCES repertoire(id)
        ON DELETE CASCADE,

    person_id BIGINT NOT NULL
        REFERENCES person(id),

    role repertoire_credit_role NOT NULL,

    position NUMERIC(20, 10),

    PRIMARY KEY (repertoire_id, person_id, role)
);


CREATE INDEX idx_repertoire_credit_person
    ON repertoire_credit (person_id);


-- ============================================================
-- REPERTOIRE / INSTRUMENT
-- ============================================================

CREATE TABLE repertoire_instrument (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    repertoire_id BIGINT NOT NULL
        REFERENCES repertoire(id)
        ON DELETE CASCADE,

    instrument_id BIGINT NOT NULL
        REFERENCES instrument(id),

    role repertoire_instrument_role NOT NULL,

    position NUMERIC(20, 10),

    part_name TEXT
);


CREATE INDEX idx_repertoire_instrument_repertoire
    ON repertoire_instrument (repertoire_id);

CREATE INDEX idx_repertoire_instrument_instrument
    ON repertoire_instrument (instrument_id);


-- ============================================================
-- REPERTOIRE RESOURCES
-- ============================================================

CREATE TABLE repertoire_resource (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    repertoire_id BIGINT NOT NULL
        REFERENCES repertoire(id)
        ON DELETE CASCADE,

    type repertoire_resource_type NOT NULL,

    url TEXT NOT NULL,

    position NUMERIC(20, 10)
);


CREATE INDEX idx_repertoire_resource_repertoire
    ON repertoire_resource (repertoire_id);


-- ============================================================
-- MUSICIAN REPERTOIRE LIBRARY
-- ============================================================

CREATE TABLE musician_repertoire_library (
    musician_id BIGINT NOT NULL
        REFERENCES musician(id)
        ON DELETE CASCADE,

    repertoire_id BIGINT NOT NULL
        REFERENCES repertoire(id),

    acquired_on DATE,

    notes TEXT,

    PRIMARY KEY (musician_id, repertoire_id)
);


CREATE INDEX idx_musician_repertoire_library_repertoire
    ON musician_repertoire_library (repertoire_id);


-- ============================================================
-- SESSION TEMPLATES
--
-- A template is a recipe for creating a session.
--
-- IMPORTANT:
-- Sessions are NOT live copies of templates.
-- When a session is created from a template, its sections/items
-- are copied into independent session rows.
-- ============================================================

CREATE TABLE session_template (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    musician_id BIGINT NOT NULL
        REFERENCES musician(id),

    name TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_session_template_musician
    ON session_template (musician_id);


CREATE TRIGGER trg_session_template_updated_at
BEFORE UPDATE ON session_template
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SESSION TEMPLATE SECTIONS
--
-- Sections are completely user-defined.
--
-- Default application data might create:
--
--   Warmup
--   Repertoire
--   Cooldown
--
-- But there is no special meaning attached to those names
-- at the database level.
-- ============================================================

CREATE TABLE session_template_section (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_template_id BIGINT NOT NULL
        REFERENCES session_template(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    position NUMERIC(20, 10) NOT NULL,

    notes TEXT
);


CREATE INDEX idx_session_template_section_template
    ON session_template_section (
        session_template_id,
        position
    );


-- ============================================================
-- SESSION TEMPLATE ITEMS
--
-- An item is either an exercise or repertoire.
-- ============================================================

CREATE TABLE session_template_item (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_template_section_id BIGINT NOT NULL
        REFERENCES session_template_section(id)
        ON DELETE CASCADE,

    position NUMERIC(20, 10) NOT NULL,

    exercise_id BIGINT
        REFERENCES exercise(id),

    repertoire_id BIGINT
        REFERENCES repertoire(id),

    notes TEXT,

    CONSTRAINT chk_session_template_item_target
        CHECK (
            num_nonnulls(
                exercise_id,
                repertoire_id
            ) = 1
        )
);


CREATE INDEX idx_session_template_item_section
    ON session_template_item (
        session_template_section_id,
        position
    );

CREATE INDEX idx_session_template_item_exercise
    ON session_template_item (exercise_id);

CREATE INDEX idx_session_template_item_repertoire
    ON session_template_item (repertoire_id);


-- ============================================================
-- PRACTICE SESSIONS
--
-- session_template_id records where the session originated.
-- It does NOT make the session dependent on the template.
--
-- If the template is later changed, this session does not change.
-- If the template is deleted, the session remains.
-- ============================================================

CREATE TABLE session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    musician_id BIGINT NOT NULL
        REFERENCES musician(id),

    session_template_id BIGINT
        REFERENCES session_template(id)
        ON DELETE SET NULL,

    status session_status NOT NULL DEFAULT 'PLANNED',

    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_session_times
        CHECK (
            ended_at IS NULL
            OR started_at IS NULL
            OR ended_at >= started_at
        )
);


CREATE INDEX idx_session_musician
    ON session (musician_id);

CREATE INDEX idx_session_musician_started
    ON session (musician_id, started_at DESC);

CREATE INDEX idx_session_musician_status
    ON session (musician_id, status);

CREATE INDEX idx_session_template
    ON session (session_template_id);


CREATE TRIGGER trg_session_updated_at
BEFORE UPDATE ON session
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- SESSION SECTIONS
--
-- These are copied from session_template_section when a session
-- is created, but thereafter belong entirely to the session.
--
-- The user can:
--   - rename sections
--   - add sections
--   - remove sections
--   - reorder sections
--   - add/remove/reorder items
--
-- None of those operations affect the template.
-- ============================================================

CREATE TABLE session_section (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_id BIGINT NOT NULL
        REFERENCES session(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    position NUMERIC(20, 10) NOT NULL,

    notes TEXT
);


CREATE INDEX idx_session_section_session
    ON session_section (
        session_id,
        position
    );


-- ============================================================
-- SESSION ITEMS
--
-- These are copied from session_template_item when a session
-- is created.
--
-- After creation, these rows are completely independent of
-- the corresponding template items.
--
-- An item is either an exercise or repertoire.
-- ============================================================

CREATE TABLE session_item (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_section_id BIGINT NOT NULL
        REFERENCES session_section(id)
        ON DELETE CASCADE,

    position NUMERIC(20, 10) NOT NULL,

    exercise_id BIGINT
        REFERENCES exercise(id),

    repertoire_id BIGINT
        REFERENCES repertoire(id),

    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,

    notes TEXT,

    CONSTRAINT chk_session_item_target
        CHECK (
            num_nonnulls(
                exercise_id,
                repertoire_id
            ) = 1
        ),

    CONSTRAINT chk_session_item_times
        CHECK (
            ended_at IS NULL
            OR started_at IS NULL
            OR ended_at >= started_at
        )
);


CREATE INDEX idx_session_item_section
    ON session_item (
        session_section_id,
        position
    );

CREATE INDEX idx_session_item_exercise
    ON session_item (exercise_id);

CREATE INDEX idx_session_item_repertoire
    ON session_item (repertoire_id);

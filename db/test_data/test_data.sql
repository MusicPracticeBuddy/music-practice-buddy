BEGIN;

-- ============================================================
-- MUSICIANS
-- ============================================================

INSERT INTO musician (is_admin)
VALUES
    (TRUE),
    (FALSE),
    (FALSE);


-- ============================================================
-- AUTH IDENTITIES
-- ============================================================

INSERT INTO auth_identity (
    musician_id,
    provider,
    provider_user_id,
    email
)
VALUES
    (
        (SELECT id FROM musician WHERE is_admin = TRUE LIMIT 1),
        'google',
        'google-thomas-001',
        'thomas@example.com'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = FALSE
            ORDER BY id
            LIMIT 1
        ),
        'google',
        'google-musician-002',
        'alex@example.com'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = FALSE
            ORDER BY id
            OFFSET 1
            LIMIT 1
        ),
        'github',
        'github-musician-003',
        'sam@example.com'
    );


-- ============================================================
-- INSTRUMENTS
-- ============================================================

INSERT INTO instrument (name, family)
VALUES
    ('Trumpet in B-flat', 'BRASS'),
    ('Piano', 'KEYBOARD'),
    ('Violin', 'STRING'),
    ('Flute', 'WOODWIND'),
    ('Trombone', 'BRASS');


-- ============================================================
-- PEOPLE
-- ============================================================

INSERT INTO person (
    name,
    birth_date,
    death_date,
    biography_link
)
VALUES
    (
        'Johann Sebastian Bach',
        '1685-03-31',
        '1750-07-28',
        'https://en.wikipedia.org/wiki/Johann_Sebastian_Bach'
    ),
    (
        'Ludwig van Beethoven',
        '1770-12-17',
        '1827-03-26',
        'https://en.wikipedia.org/wiki/Ludwig_van_Beethoven'
    ),
    (
        'Frédéric Chopin',
        '1810-03-01',
        '1849-10-17',
        'https://en.wikipedia.org/wiki/Fr%C3%A9d%C3%A9ric_Chopin'
    ),
    (
        'Jean-Baptiste Arban',
        '1825-02-28',
        '1889-04-08',
        'https://en.wikipedia.org/wiki/Jean-Baptiste_Arban'
    );


-- ============================================================
-- EXERCISES
-- ============================================================

INSERT INTO exercise (
    musician_id,
    name,
    notation,
    notation_format,
    visibility
)
VALUES
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'Long tones',
        'Whole notes at pp-mf-pp, 8 counts each',
        'text',
        'PRIVATE'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'Lip slurs',
        'Low to middle register, slow and relaxed',
        'text',
        'PRIVATE'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = FALSE
            ORDER BY id
            LIMIT 1
        ),
        'Double-tonguing',
        'ta-ka, beginning at 80 BPM',
        'text',
        'PRIVATE'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'Scale articulation',
        'Major scales, eighth notes, tongue every note',
        'text',
        'PUBLIC'
    );


-- ============================================================
-- COPIED EXERCISE
--
-- Demonstrates exercise.copied_from_exercise_id
-- ============================================================

INSERT INTO exercise (
    musician_id,
    name,
    notation,
    notation_format,
    copied_from_exercise_id,
    visibility
)
VALUES
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = FALSE
            ORDER BY id
            LIMIT 1
        ),
        'Long tones - adapted',
        'Whole notes, 6 counts each, starting in middle register',
        'text',
        (
            SELECT id
            FROM exercise
            WHERE name = 'Long tones'
            LIMIT 1
        ),
        'PRIVATE'
    );


-- ============================================================
-- REPERTOIRE
-- ============================================================

INSERT INTO repertoire (
    title,
    owner_musician_id,
    visibility,
    status
)
VALUES
    (
        'Bach Cello Suite No. 1 in G Major, BWV 1007',
        NULL,
        'PUBLIC',
        'APPROVED'
    ),
    (
        'Beethoven Sonata No. 8 in C Minor, Op. 13',
        NULL,
        'PUBLIC',
        'APPROVED'
    ),
    (
        'Arban Characteristic Study No. 1',
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'PRIVATE',
        'APPROVED'
    ),
    (
        'Chopin Prelude in E Minor, Op. 28 No. 4',
        NULL,
        'PUBLIC',
        'APPROVED'
    );


-- ============================================================
-- REPERTOIRE EXCERPT
--
-- This is a child repertoire record belonging to the Bach work.
-- ============================================================

INSERT INTO repertoire (
    title,
    parent_repertoire_id,
    start_measure,
    end_measure,
    owner_musician_id,
    visibility,
    status
)
VALUES
    (
        'Bach Cello Suite No. 1 - Prelude opening',
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Bach Cello Suite No. 1 in G Major, BWV 1007'
            LIMIT 1
        ),
        1,
        22,
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'PRIVATE',
        'APPROVED'
    );


-- ============================================================
-- REPERTOIRE CREDITS
-- ============================================================

INSERT INTO repertoire_credit (
    repertoire_id,
    person_id,
    role,
    position
)
VALUES
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Bach Cello Suite No. 1 in G Major, BWV 1007'
            LIMIT 1
        ),
        (
            SELECT id
            FROM person
            WHERE name = 'Johann Sebastian Bach'
            LIMIT 1
        ),
        'COMPOSER',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Beethoven Sonata No. 8 in C Minor, Op. 13'
            LIMIT 1
        ),
        (
            SELECT id
            FROM person
            WHERE name = 'Ludwig van Beethoven'
            LIMIT 1
        ),
        'COMPOSER',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Chopin Prelude in E Minor, Op. 28 No. 4'
            LIMIT 1
        ),
        (
            SELECT id
            FROM person
            WHERE name = 'Frédéric Chopin'
            LIMIT 1
        ),
        'COMPOSER',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        (
            SELECT id
            FROM person
            WHERE name = 'Jean-Baptiste Arban'
            LIMIT 1
        ),
        'COMPOSER',
        1
    );


-- ============================================================
-- REPERTOIRE / INSTRUMENT
-- ============================================================

INSERT INTO repertoire_instrument (
    repertoire_id,
    instrument_id,
    role,
    position,
    part_name
)
VALUES
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Bach Cello Suite No. 1 in G Major, BWV 1007'
            LIMIT 1
        ),
        (
            SELECT id
            FROM instrument
            WHERE name = 'Violin'
            LIMIT 1
        ),
        'SOLO',
        1,
        'Solo part / adaptation'
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Beethoven Sonata No. 8 in C Minor, Op. 13'
            LIMIT 1
        ),
        (
            SELECT id
            FROM instrument
            WHERE name = 'Piano'
            LIMIT 1
        ),
        'SOLO',
        1,
        'Piano'
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        (
            SELECT id
            FROM instrument
            WHERE name = 'Trumpet in B-flat'
            LIMIT 1
        ),
        'SOLO',
        1,
        'Trumpet'
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Chopin Prelude in E Minor, Op. 28 No. 4'
            LIMIT 1
        ),
        (
            SELECT id
            FROM instrument
            WHERE name = 'Piano'
            LIMIT 1
        ),
        'SOLO',
        1,
        'Piano'
    );


-- ============================================================
-- REPERTOIRE RESOURCES
-- ============================================================

INSERT INTO repertoire_resource (
    repertoire_id,
    type,
    url,
    position
)
VALUES
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Bach Cello Suite No. 1 in G Major, BWV 1007'
            LIMIT 1
        ),
        'RECORDING',
        'https://www.youtube.com/watch?v=example-bach',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Beethoven Sonata No. 8 in C Minor, Op. 13'
            LIMIT 1
        ),
        'SCORE',
        'https://imslp.org/wiki/Piano_Sonata_No.8,_Op.13_(Beethoven,_Ludwig_van)',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Chopin Prelude in E Minor, Op. 28 No. 4'
            LIMIT 1
        ),
        'RECORDING',
        'https://www.youtube.com/watch?v=example-chopin',
        1
    ),
    (
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        'LINK',
        'https://example.com/arban-study-1',
        1
    );


-- ============================================================
-- MUSICIAN REPERTOIRE LIBRARY
-- ============================================================

INSERT INTO musician_repertoire_library (
    musician_id,
    repertoire_id,
    acquired_on,
    notes
)
VALUES
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        '2026-08-01',
        'Current technical study.'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Bach Cello Suite No. 1 in G Major, BWV 1007'
            LIMIT 1
        ),
        '2026-07-15',
        'Working on the Prelude.'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Beethoven Sonata No. 8 in C Minor, Op. 13'
            LIMIT 1
        ),
        '2026-06-20',
        'Long-term repertoire.'
    );


-- ============================================================
-- SESSION TEMPLATES
-- ============================================================

INSERT INTO session_template (
    musician_id,
    name
)
VALUES
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'Daily Brass Practice'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        'Short Practice Session'
    );


-- ============================================================
-- SESSION TEMPLATE SECTIONS
-- ============================================================

INSERT INTO session_template_section (
    session_template_id,
    name,
    position,
    notes
)
VALUES
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'Warmup',
        1,
        'Focus on relaxed sound and efficient breathing.'
    ),
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'Technical Studies',
        2,
        'Articulation and flexibility.'
    ),
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'Repertoire',
        3,
        'Work on current pieces.'
    ),
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'Cooldown',
        4,
        NULL
    ),
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Short Practice Session'
            LIMIT 1
        ),
        'Core Work',
        1,
        'Keep the session focused.'
    ),
    (
        (
            SELECT id
            FROM session_template
            WHERE name = 'Short Practice Session'
            LIMIT 1
        ),
        'Repertoire',
        2,
        NULL
    );


-- ============================================================
-- SESSION TEMPLATE ITEMS
-- ============================================================

INSERT INTO session_template_item (
    session_template_section_id,
    position,
    exercise_id,
    repertoire_id,
    notes
)
VALUES
    -- Daily Brass Practice / Warmup
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Daily Brass Practice'
              AND sts.name = 'Warmup'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Long tones'
            LIMIT 1
        ),
        NULL,
        'Start quietly and gradually expand dynamics.'
    ),

    -- Daily Brass Practice / Technical Studies
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Daily Brass Practice'
              AND sts.name = 'Technical Studies'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Lip slurs'
            LIMIT 1
        ),
        NULL,
        NULL
    ),
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Daily Brass Practice'
              AND sts.name = 'Technical Studies'
            LIMIT 1
        ),
        2,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Double-tonguing'
            LIMIT 1
        ),
        NULL,
        'Begin at 80 BPM.'
    ),

    -- Daily Brass Practice / Repertoire
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Daily Brass Practice'
              AND sts.name = 'Repertoire'
            LIMIT 1
        ),
        1,
        NULL,
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        'Focus on articulation.'
    ),

    -- Short Practice / Core Work
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Short Practice Session'
              AND sts.name = 'Core Work'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Long tones - adapted'
            LIMIT 1
        ),
        NULL,
        NULL
    ),

    -- Short Practice / Repertoire
    (
        (
            SELECT sts.id
            FROM session_template_section sts
            JOIN session_template st
                ON st.id = sts.session_template_id
            WHERE st.name = 'Short Practice Session'
              AND sts.name = 'Repertoire'
            LIMIT 1
        ),
        1,
        NULL,
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        'One focused pass.'
    );


-- ============================================================
-- PRACTICE SESSIONS
--
-- Two sessions originate from the same template.
-- Their section/item rows below are independent.
-- ============================================================

INSERT INTO session (
    musician_id,
    session_template_id,
    status,
    assigned_at,
    started_at,
    ended_at
)
VALUES
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'COMPLETED',
        '2026-08-23 08:00:00-04',
        '2026-08-23 08:05:00-04',
        '2026-08-23 08:55:00-04'
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM session_template
            WHERE name = 'Daily Brass Practice'
            LIMIT 1
        ),
        'IN_PROGRESS',
        '2026-08-25 08:00:00-04',
        '2026-08-25 08:05:00-04',
        NULL
    ),
    (
        (
            SELECT id
            FROM musician
            WHERE is_admin = TRUE
            LIMIT 1
        ),
        (
            SELECT id
            FROM session_template
            WHERE name = 'Short Practice Session'
            LIMIT 1
        ),
        'PLANNED',
        '2026-08-26 08:00:00-04',
        NULL,
        NULL
    );


-- ============================================================
-- SESSION SECTIONS
--
-- These intentionally do NOT reference session_template_section.
-- They are independent session data.
-- ============================================================

INSERT INTO session_section (
    session_id,
    name,
    position,
    notes
)
VALUES
    (
        (
            SELECT id
            FROM session
            WHERE status = 'COMPLETED'
            ORDER BY id
            LIMIT 1
        ),
        'Warmup',
        1,
        'Completed comfortably.'
    ),
    (
        (
            SELECT id
            FROM session
            WHERE status = 'COMPLETED'
            ORDER BY id
            LIMIT 1
        ),
        'Technical Studies',
        2,
        'Added an extra articulation exercise.'
    ),
    (
        (
            SELECT id
            FROM session
            WHERE status = 'COMPLETED'
            ORDER BY id
            LIMIT 1
        ),
        'Repertoire',
        3,
        'Spent extra time on the study.' 
    ),

    -- Second session deliberately has a modified section name.
    (
        (
            SELECT id
            FROM session
            WHERE status = 'IN_PROGRESS'
            ORDER BY id
            LIMIT 1
        ),
        'Warmup',
        1,
        NULL
    ),
    (
        (
            SELECT id
            FROM session
            WHERE status = 'IN_PROGRESS'
            ORDER BY id
            LIMIT 1
        ),
        'Technical Studies',
        2,
        'Going slower today.'
    ),
    (
        (
            SELECT id
            FROM session
            WHERE status = 'IN_PROGRESS'
            ORDER BY id
            LIMIT 1
        ),
        'Repertoire - Extended',
        3,
        'This section was renamed only for this session.'
    );


-- ============================================================
-- SESSION ITEMS
--
-- Again, these are independent of template items.
-- ============================================================

INSERT INTO session_item (
    session_section_id,
    position,
    exercise_id,
    repertoire_id,
    started_at,
    ended_at,
    notes
)
VALUES

    -- ========================================================
    -- COMPLETED SESSION / WARMUP
    -- ========================================================

    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'COMPLETED'
              AND ss.name = 'Warmup'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Long tones'
            LIMIT 1
        ),
        NULL,
        '2026-08-23 08:05:00-04',
        '2026-08-23 08:15:00-04',
        'Good centered sound.'
    ),

    -- ========================================================
    -- COMPLETED SESSION / TECHNICAL STUDIES
    -- ========================================================

    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'COMPLETED'
              AND ss.name = 'Technical Studies'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Lip slurs'
            LIMIT 1
        ),
        NULL,
        '2026-08-23 08:15:00-04',
        '2026-08-23 08:25:00-04',
        NULL
    ),
    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'COMPLETED'
              AND ss.name = 'Technical Studies'
            LIMIT 1
        ),
        2,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Double-tonguing'
            LIMIT 1
        ),
        NULL,
        '2026-08-23 08:25:00-04',
        '2026-08-23 08:35:00-04',
        'Reached 104 BPM.'
    ),
    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'COMPLETED'
              AND ss.name = 'Technical Studies'
            LIMIT 1
        ),
        3,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Scale articulation'
            LIMIT 1
        ),
        NULL,
        '2026-08-23 08:35:00-04',
        '2026-08-23 08:40:00-04',
        'Added this directly to the session.'
    ),

    -- ========================================================
    -- COMPLETED SESSION / REPERTOIRE
    -- ========================================================

    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'COMPLETED'
              AND ss.name = 'Repertoire'
            LIMIT 1
        ),
        1,
        NULL,
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        '2026-08-23 08:40:00-04',
        '2026-08-23 08:55:00-04',
        'Worked slowly with a metronome.'
    ),

    -- ========================================================
    -- IN-PROGRESS SESSION
    -- ========================================================

    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'IN_PROGRESS'
              AND ss.name = 'Warmup'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Long tones'
            LIMIT 1
        ),
        NULL,
        '2026-08-25 08:05:00-04',
        '2026-08-25 08:15:00-04',
        NULL
    ),
    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'IN_PROGRESS'
              AND ss.name = 'Technical Studies'
            LIMIT 1
        ),
        1,
        (
            SELECT id
            FROM exercise
            WHERE name = 'Lip slurs'
            LIMIT 1
        ),
        NULL,
        '2026-08-25 08:15:00-04',
        NULL,
        'Currently working on this.'
    ),
    (
        (
            SELECT ss.id
            FROM session_section ss
            JOIN session s ON s.id = ss.session_id
            WHERE s.status = 'IN_PROGRESS'
              AND ss.name = 'Repertoire - Extended'
            LIMIT 1
        ),
        1,
        NULL,
        (
            SELECT id
            FROM repertoire
            WHERE title = 'Arban Characteristic Study No. 1'
            LIMIT 1
        ),
        NULL,
        NULL,
        'Added an additional repertoire item directly to this session.'
    );


COMMIT;

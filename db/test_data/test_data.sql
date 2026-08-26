BEGIN;

-- Local development data for the hierarchy in V1__initial_schema.sql.

INSERT INTO musician (is_admin)
VALUES (TRUE), (FALSE), (FALSE);

INSERT INTO auth_identity (musician_id, provider, provider_user_id, email)
VALUES
    ((SELECT id FROM musician ORDER BY id LIMIT 1), 'google', 'google-thomas-001', 'thomas@example.com'),
    ((SELECT id FROM musician ORDER BY id OFFSET 1 LIMIT 1), 'google', 'google-alex-002', 'alex@example.com'),
    ((SELECT id FROM musician ORDER BY id OFFSET 2 LIMIT 1), 'github', 'github-sam-003', 'sam@example.com');

INSERT INTO instrument (name, family)
VALUES
    ('Trumpet in B-flat', 'BRASS'),
    ('Piano', 'KEYBOARD'),
    ('Violin', 'STRING'),
    ('Flute', 'WOODWIND'),
    ('Trombone', 'BRASS');

INSERT INTO person (name, birth_date, death_date, biography_link)
VALUES
    ('Johann Sebastian Bach', '1685-03-31', '1750-07-28', 'https://en.wikipedia.org/wiki/Johann_Sebastian_Bach'),
    ('Ludwig van Beethoven', '1770-12-17', '1827-03-26', 'https://en.wikipedia.org/wiki/Ludwig_van_Beethoven'),
    ('Frédéric Chopin', '1810-03-01', '1849-10-17', 'https://en.wikipedia.org/wiki/Fr%C3%A9d%C3%A9ric_Chopin'),
    ('Jean-Baptiste Arban', '1825-02-28', '1889-04-08', 'https://en.wikipedia.org/wiki/Jean-Baptiste_Arban');

INSERT INTO exercise (musician_id, name, notation, notation_format, visibility)
VALUES
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), 'Long tones', 'Whole notes at pp-mf-pp, 8 counts each', 'text', 'PRIVATE'),
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), 'Lip slurs', 'Low to middle register, slow and relaxed', 'text', 'PRIVATE'),
    ((SELECT id FROM musician WHERE NOT is_admin ORDER BY id LIMIT 1), 'Double-tonguing', 'ta-ka, beginning at 80 BPM', 'text', 'PRIVATE'),
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), 'Scale articulation', 'Major scales, eighth notes, tongue every note', 'text', 'PUBLIC');

INSERT INTO exercise (musician_id, name, notation, notation_format, copied_from_exercise_id, visibility)
VALUES (
    (SELECT id FROM musician WHERE NOT is_admin ORDER BY id LIMIT 1),
    'Long tones - adapted',
    'Whole notes, 6 counts each, starting in middle register',
    'text',
    (SELECT id FROM exercise WHERE name = 'Long tones'),
    'PRIVATE'
);

INSERT INTO repertoire (title, owner_musician_id, visibility, status)
VALUES
    ('Bach Cello Suite No. 1 in G Major, BWV 1007', NULL, 'PUBLIC', 'APPROVED'),
    ('Beethoven Sonata No. 8 in C Minor, Op. 13', NULL, 'PUBLIC', 'APPROVED'),
    ('Arban Characteristic Study No. 1', (SELECT id FROM musician WHERE is_admin LIMIT 1), 'PRIVATE', 'APPROVED'),
    ('Chopin Prelude in E Minor, Op. 28 No. 4', NULL, 'PUBLIC', 'APPROVED');

INSERT INTO repertoire (title, parent_repertoire_id, start_measure, end_measure, owner_musician_id, visibility, status)
VALUES (
    'Bach Cello Suite No. 1 - Prelude opening',
    (SELECT id FROM repertoire WHERE title LIKE 'Bach Cello Suite No. 1 in%'),
    1,
    22,
    (SELECT id FROM musician WHERE is_admin LIMIT 1),
    'PRIVATE',
    'APPROVED'
);

INSERT INTO repertoire_credit (repertoire_id, person_id, role, position)
SELECT r.id, p.id, 'COMPOSER', 1
FROM (
    VALUES
        ('Bach Cello Suite No. 1 in G Major, BWV 1007', 'Johann Sebastian Bach'),
        ('Beethoven Sonata No. 8 in C Minor, Op. 13', 'Ludwig van Beethoven'),
        ('Chopin Prelude in E Minor, Op. 28 No. 4', 'Frédéric Chopin'),
        ('Arban Characteristic Study No. 1', 'Jean-Baptiste Arban')
) AS credit(repertoire_title, person_name)
JOIN repertoire r ON r.title = credit.repertoire_title
JOIN person p ON p.name = credit.person_name;

INSERT INTO repertoire_instrument (repertoire_id, instrument_id, role, position, part_name)
SELECT r.id, i.id, 'SOLO', 1, part.part_name
FROM (
    VALUES
        ('Bach Cello Suite No. 1 in G Major, BWV 1007', 'Violin', 'Solo part / adaptation'),
        ('Beethoven Sonata No. 8 in C Minor, Op. 13', 'Piano', 'Piano'),
        ('Arban Characteristic Study No. 1', 'Trumpet in B-flat', 'Trumpet'),
        ('Chopin Prelude in E Minor, Op. 28 No. 4', 'Piano', 'Piano')
) AS part(repertoire_title, instrument_name, part_name)
JOIN repertoire r ON r.title = part.repertoire_title
JOIN instrument i ON i.name = part.instrument_name;

INSERT INTO repertoire_resource (repertoire_id, type, url, position)
SELECT r.id, resource.type::repertoire_resource_type, resource.url, 1
FROM (
    VALUES
        ('Bach Cello Suite No. 1 in G Major, BWV 1007', 'RECORDING', 'https://www.youtube.com/watch?v=example-bach'),
        ('Beethoven Sonata No. 8 in C Minor, Op. 13', 'SCORE', 'https://imslp.org/wiki/Piano_Sonata_No.8,_Op.13_(Beethoven,_Ludwig_van)'),
        ('Chopin Prelude in E Minor, Op. 28 No. 4', 'RECORDING', 'https://www.youtube.com/watch?v=example-chopin'),
        ('Arban Characteristic Study No. 1', 'LINK', 'https://example.com/arban-study-1')
) AS resource(repertoire_title, type, url)
JOIN repertoire r ON r.title = resource.repertoire_title;

INSERT INTO musician_repertoire_library (musician_id, repertoire_id, acquired_on, notes)
SELECT m.id, r.id, item.acquired_on::date, item.notes
FROM (
    VALUES
        ('Arban Characteristic Study No. 1', '2026-08-01', 'Current technical study.'),
        ('Bach Cello Suite No. 1 in G Major, BWV 1007', '2026-07-15', 'Working on the Prelude.'),
        ('Beethoven Sonata No. 8 in C Minor, Op. 13', '2026-06-20', 'Long-term repertoire.')
) AS item(title, acquired_on, notes)
JOIN repertoire r ON r.title = item.title
CROSS JOIN (SELECT id FROM musician WHERE is_admin LIMIT 1) m;

INSERT INTO session_template (musician_id, name)
VALUES
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), 'Daily Brass Practice'),
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), 'Short Practice Session');

INSERT INTO session_template_item (session_template_id, type, position, name, notes)
VALUES
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), 'SECTION', 1, 'Warmup', 'Focus on relaxed sound and efficient breathing.'),
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), 'SECTION', 2, 'Technical Studies', 'Articulation and flexibility.'),
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), 'SECTION', 3, 'Repertoire', 'Work on current pieces.'),
    ((SELECT id FROM session_template WHERE name = 'Short Practice Session'), 'SECTION', 1, 'Core Work', 'Keep the session focused.'),
    ((SELECT id FROM session_template WHERE name = 'Short Practice Session'), 'SECTION', 2, 'Repertoire', NULL);

INSERT INTO session_template_item (session_template_id, parent_id, type, position, exercise_id, repertoire_id, notes)
VALUES
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), (SELECT id FROM session_template_item WHERE name = 'Warmup'), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Long tones'), NULL, 'Start quietly and gradually expand dynamics.'),
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), (SELECT id FROM session_template_item WHERE name = 'Technical Studies'), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Lip slurs'), NULL, NULL),
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), (SELECT id FROM session_template_item WHERE name = 'Technical Studies'), 'EXERCISE', 2, (SELECT id FROM exercise WHERE name = 'Double-tonguing'), NULL, 'Begin at 80 BPM.'),
    ((SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), (SELECT id FROM session_template_item WHERE name = 'Repertoire' AND session_template_id = (SELECT id FROM session_template WHERE name = 'Daily Brass Practice')), 'REPERTOIRE', 1, NULL, (SELECT id FROM repertoire WHERE title = 'Arban Characteristic Study No. 1'), 'Focus on articulation.'),
    ((SELECT id FROM session_template WHERE name = 'Short Practice Session'), (SELECT id FROM session_template_item WHERE name = 'Core Work'), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Long tones - adapted'), NULL, NULL),
    ((SELECT id FROM session_template WHERE name = 'Short Practice Session'), (SELECT id FROM session_template_item WHERE name = 'Repertoire' AND session_template_id = (SELECT id FROM session_template WHERE name = 'Short Practice Session')), 'REPERTOIRE', 1, NULL, (SELECT id FROM repertoire WHERE title = 'Arban Characteristic Study No. 1'), 'One focused pass.');

INSERT INTO session (musician_id, session_template_id, status, timing_mode, assigned_date, assigned_at, started_at, ended_at)
VALUES
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), (SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), 'COMPLETED', 'AUTO', '2026-08-23', '2026-08-23 08:00:00-04', '2026-08-23 08:05:00-04', '2026-08-23 08:55:00-04'),
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), (SELECT id FROM session_template WHERE name = 'Daily Brass Practice'), 'IN_PROGRESS', 'AUTO', '2026-08-25', '2026-08-25 08:00:00-04', '2026-08-25 08:05:00-04', NULL),
    ((SELECT id FROM musician WHERE is_admin LIMIT 1), (SELECT id FROM session_template WHERE name = 'Short Practice Session'), 'PLANNED', NULL, '2026-08-26', '2026-08-26 08:00:00-04', NULL, NULL);

INSERT INTO session_item (session_id, type, position, name, status, notes)
VALUES
    ((SELECT id FROM session WHERE status = 'COMPLETED'), 'SECTION', 1, 'Warmup', 'COMPLETE', 'Completed comfortably.'),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), 'SECTION', 2, 'Technical Studies', 'COMPLETE', 'Added an extra articulation exercise.'),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), 'SECTION', 3, 'Repertoire', 'COMPLETE', 'Spent extra time on the study.'),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), 'SECTION', 1, 'Warmup', 'COMPLETE', NULL),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), 'SECTION', 2, 'Technical Studies', 'IN_PROGRESS', 'Going slower today.'),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), 'SECTION', 3, 'Repertoire - Extended', 'NOT_STARTED', 'This section was renamed only for this session.'),
    ((SELECT id FROM session WHERE status = 'PLANNED'), 'SECTION', 1, 'Core Work', 'NOT_STARTED', 'Keep the session focused.'),
    ((SELECT id FROM session WHERE status = 'PLANNED'), 'SECTION', 2, 'Repertoire', 'NOT_STARTED', NULL);

INSERT INTO session_item (session_id, parent_id, type, position, exercise_id, repertoire_id, status, started_at, ended_at, notes)
VALUES
    ((SELECT id FROM session WHERE status = 'COMPLETED'), (SELECT id FROM session_item WHERE name = 'Warmup' AND session_id = (SELECT id FROM session WHERE status = 'COMPLETED')), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Long tones'), NULL, 'COMPLETE', '2026-08-23 08:05:00-04', '2026-08-23 08:15:00-04', 'Good centered sound.'),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), (SELECT id FROM session_item WHERE name = 'Technical Studies' AND session_id = (SELECT id FROM session WHERE status = 'COMPLETED')), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Lip slurs'), NULL, 'COMPLETE', '2026-08-23 08:15:00-04', '2026-08-23 08:25:00-04', NULL),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), (SELECT id FROM session_item WHERE name = 'Technical Studies' AND session_id = (SELECT id FROM session WHERE status = 'COMPLETED')), 'EXERCISE', 2, (SELECT id FROM exercise WHERE name = 'Double-tonguing'), NULL, 'COMPLETE', '2026-08-23 08:25:00-04', '2026-08-23 08:35:00-04', 'Reached 104 BPM.'),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), (SELECT id FROM session_item WHERE name = 'Technical Studies' AND session_id = (SELECT id FROM session WHERE status = 'COMPLETED')), 'EXERCISE', 3, (SELECT id FROM exercise WHERE name = 'Scale articulation'), NULL, 'COMPLETE', '2026-08-23 08:35:00-04', '2026-08-23 08:40:00-04', 'Added this directly to the session.'),
    ((SELECT id FROM session WHERE status = 'COMPLETED'), (SELECT id FROM session_item WHERE name = 'Repertoire' AND session_id = (SELECT id FROM session WHERE status = 'COMPLETED')), 'REPERTOIRE', 1, NULL, (SELECT id FROM repertoire WHERE title = 'Arban Characteristic Study No. 1'), 'COMPLETE', '2026-08-23 08:40:00-04', '2026-08-23 08:55:00-04', 'Worked slowly with a metronome.'),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), (SELECT id FROM session_item WHERE name = 'Warmup' AND session_id = (SELECT id FROM session WHERE status = 'IN_PROGRESS')), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Long tones'), NULL, 'COMPLETE', '2026-08-25 08:05:00-04', '2026-08-25 08:15:00-04', NULL),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), (SELECT id FROM session_item WHERE name = 'Technical Studies' AND session_id = (SELECT id FROM session WHERE status = 'IN_PROGRESS')), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Lip slurs'), NULL, 'IN_PROGRESS', '2026-08-25 08:15:00-04', NULL, 'Currently working on this.'),
    ((SELECT id FROM session WHERE status = 'IN_PROGRESS'), (SELECT id FROM session_item WHERE name = 'Repertoire - Extended'), 'REPERTOIRE', 1, NULL, (SELECT id FROM repertoire WHERE title = 'Arban Characteristic Study No. 1'), 'NOT_STARTED', NULL, NULL, 'Added directly to this session.'),
    ((SELECT id FROM session WHERE status = 'PLANNED'), (SELECT id FROM session_item WHERE name = 'Core Work' AND session_id = (SELECT id FROM session WHERE status = 'PLANNED')), 'EXERCISE', 1, (SELECT id FROM exercise WHERE name = 'Long tones - adapted'), NULL, 'NOT_STARTED', NULL, NULL, 'Keep the session focused.'),
    ((SELECT id FROM session WHERE status = 'PLANNED'), (SELECT id FROM session_item WHERE name = 'Repertoire' AND session_id = (SELECT id FROM session WHERE status = 'PLANNED')), 'REPERTOIRE', 1, NULL, (SELECT id FROM repertoire WHERE title = 'Arban Characteristic Study No. 1'), 'NOT_STARTED', NULL, NULL, 'One focused pass.');

COMMIT;

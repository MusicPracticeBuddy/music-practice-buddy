ALTER TABLE repertoire
    DROP CONSTRAINT chk_repertoire_inherited_access;

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
                AND (
                    (owner_musician_id IS NULL AND visibility IS NULL)
                    OR
                    (owner_musician_id IS NOT NULL AND visibility = 'PRIVATE')
                )
            )
        );

CREATE INDEX idx_repertoire_private_child_owner
    ON repertoire (owner_musician_id, parent_repertoire_id)
    WHERE parent_repertoire_id IS NOT NULL
      AND visibility = 'PRIVATE'
      AND deleted_at IS NULL;

ALTER TABLE repertoire
    ADD COLUMN root_repertoire_id BIGINT,
    ADD COLUMN effective_owner_musician_id BIGINT,
    ADD COLUMN effective_visibility visibility_type;

WITH RECURSIVE derived_access AS (
    SELECT
        id,
        id AS root_repertoire_id,
        owner_musician_id AS effective_owner_musician_id,
        visibility AS effective_visibility
    FROM repertoire
    WHERE parent_repertoire_id IS NULL

    UNION ALL

    SELECT
        child.id,
        parent.root_repertoire_id,
        COALESCE(child.owner_musician_id, parent.effective_owner_musician_id),
        COALESCE(child.visibility, parent.effective_visibility)
    FROM repertoire child
    JOIN derived_access parent ON parent.id = child.parent_repertoire_id
)
UPDATE repertoire target
SET root_repertoire_id = derived.root_repertoire_id,
    effective_owner_musician_id = derived.effective_owner_musician_id,
    effective_visibility = derived.effective_visibility
FROM derived_access derived
WHERE target.id = derived.id;

ALTER TABLE repertoire
    ALTER COLUMN root_repertoire_id SET NOT NULL,
    ALTER COLUMN effective_visibility SET NOT NULL,
    ADD CONSTRAINT fk_repertoire_root
        FOREIGN KEY (root_repertoire_id) REFERENCES repertoire(id),
    ADD CONSTRAINT fk_repertoire_effective_owner
        FOREIGN KEY (effective_owner_musician_id) REFERENCES musician(id),
    ADD CONSTRAINT chk_repertoire_root_identity
        CHECK (
            (parent_repertoire_id IS NULL AND root_repertoire_id = id)
            OR parent_repertoire_id IS NOT NULL
        );

CREATE INDEX idx_repertoire_root
    ON repertoire (root_repertoire_id);

CREATE INDEX idx_repertoire_effective_access
    ON repertoire (effective_owner_musician_id, effective_visibility)
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION set_repertoire_effective_access()
RETURNS TRIGGER AS $$
DECLARE
    parent_root_id BIGINT;
    parent_owner_id BIGINT;
    parent_visibility visibility_type;
BEGIN
    IF NEW.parent_repertoire_id IS NULL THEN
        NEW.root_repertoire_id := NEW.id;
        NEW.effective_owner_musician_id := NEW.owner_musician_id;
        NEW.effective_visibility := NEW.visibility;
    ELSE
        SELECT
            root_repertoire_id,
            effective_owner_musician_id,
            effective_visibility
        INTO STRICT
            parent_root_id,
            parent_owner_id,
            parent_visibility
        FROM repertoire
        WHERE id = NEW.parent_repertoire_id;

        NEW.root_repertoire_id := parent_root_id;
        NEW.effective_owner_musician_id := COALESCE(NEW.owner_musician_id, parent_owner_id);
        NEW.effective_visibility := COALESCE(NEW.visibility, parent_visibility);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repertoire_effective_access
BEFORE INSERT OR UPDATE OF parent_repertoire_id, owner_musician_id, visibility
ON repertoire
FOR EACH ROW
EXECUTE FUNCTION set_repertoire_effective_access();

CREATE OR REPLACE FUNCTION cascade_repertoire_effective_access()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    WITH RECURSIVE descendants AS (
        SELECT
            child.id,
            NEW.root_repertoire_id AS root_repertoire_id,
            COALESCE(child.owner_musician_id, NEW.effective_owner_musician_id)
                AS effective_owner_musician_id,
            COALESCE(child.visibility, NEW.effective_visibility) AS effective_visibility
        FROM repertoire child
        WHERE child.parent_repertoire_id = NEW.id

        UNION ALL

        SELECT
            child.id,
            parent.root_repertoire_id,
            COALESCE(child.owner_musician_id, parent.effective_owner_musician_id),
            COALESCE(child.visibility, parent.effective_visibility)
        FROM repertoire child
        JOIN descendants parent ON parent.id = child.parent_repertoire_id
    )
    UPDATE repertoire target
    SET root_repertoire_id = descendants.root_repertoire_id,
        effective_owner_musician_id = descendants.effective_owner_musician_id,
        effective_visibility = descendants.effective_visibility
    FROM descendants
    WHERE target.id = descendants.id
      AND (
          target.root_repertoire_id,
          target.effective_owner_musician_id,
          target.effective_visibility
      ) IS DISTINCT FROM (
          descendants.root_repertoire_id,
          descendants.effective_owner_musician_id,
          descendants.effective_visibility
      );

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repertoire_effective_access_cascade
AFTER UPDATE OF parent_repertoire_id, owner_musician_id, visibility
ON repertoire
FOR EACH ROW
WHEN (
    OLD.root_repertoire_id IS DISTINCT FROM NEW.root_repertoire_id
    OR OLD.effective_owner_musician_id IS DISTINCT FROM NEW.effective_owner_musician_id
    OR OLD.effective_visibility IS DISTINCT FROM NEW.effective_visibility
)
EXECUTE FUNCTION cascade_repertoire_effective_access();

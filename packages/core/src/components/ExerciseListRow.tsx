import { Show, createSignal } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { ExerciseNotation } from '@/components/ExerciseNotation';
import type { ExerciseNotationFormat } from '@/domain/exercise';

export type ExerciseListRowItem = {
  id: string;
  name: string;
  instrumentName: string | null;
  visibility: string;
  notation: string | null;
  notationFormat: ExerciseNotationFormat;
  inLibrary: boolean;
  copiedFrom?: string | null;
};

export function ExerciseListRow(props: {
  item: ExerciseListRowItem;
  pending?: boolean;
  onAdd?: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const notationId = `exercise-list-notation-${props.item.id}`;

  return (
    <article class="catalog-result-card">
      <div class="catalog-result-summary">
        <div>
          <Link to="/exercises/$exerciseId" params={{ exerciseId: props.item.id }}>
            <h3>{props.item.name}</h3>
          </Link>
          <small>
            {[props.item.instrumentName, props.item.visibility.toLowerCase()]
              .filter(Boolean)
              .join(' · ')}
          </small>
          <Show when={props.item.copiedFrom}>
            <small class="exercise-list-source">Adapted from {props.item.copiedFrom}</small>
          </Show>
        </div>
        <div class="catalog-result-actions">
          <Show when={props.item.notation}>
            <button
              class="text-button exercise-notation-toggle"
              type="button"
              aria-expanded={expanded()}
              aria-controls={notationId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded() ? 'Hide notation' : 'Show notation'}
            </button>
          </Show>
          <Show
            when={props.item.inLibrary}
            fallback={
              <button
                class="primary-button"
                type="button"
                aria-label={`Add ${props.item.name} to My Library`}
                disabled={props.pending}
                onClick={() => void props.onAdd?.()}
              >
                {props.pending ? 'Adding…' : '+ Add'}
              </button>
            }
          >
            <DeleteConfirmationDialog
              triggerLabel={props.pending ? 'Removing…' : '- Remove'}
              title="Remove from My Library?"
              itemName={props.item.name}
              description="This removes the library entry. The exercise and your practice history remain available."
              confirmLabel="Remove from My Library"
              pendingLabel="Removing…"
              onConfirm={props.onRemove}
            />
          </Show>
        </div>
      </div>
      <Show when={props.item.notation && expanded()}>
        <div id={notationId} class="exercise-library-notation">
          <ExerciseNotation
            notation={props.item.notation ?? ''}
            format={props.item.notationFormat}
          />
        </div>
      </Show>
    </article>
  );
}

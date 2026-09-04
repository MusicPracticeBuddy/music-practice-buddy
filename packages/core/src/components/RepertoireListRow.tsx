import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { RepertoireLibraryNote } from '@/components/RepertoireLibraryNote';

export type RepertoireListRowItem = {
  id: string;
  title: string;
  composer: string;
  details?: string[];
  inLibrary: boolean;
  libraryNotes?: string | null;
};

export function RepertoireListRow(props: {
  item: RepertoireListRowItem;
  pending?: boolean;
  actions?: JSX.Element;
  children?: JSX.Element;
  onAdd?: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  return (
    <article class="catalog-result-card">
      <div class="catalog-result-summary">
        <div>
          <Link to="/repertoire/$repertoireId" params={{ repertoireId: props.item.id }}>
            <h3>{props.item.title}</h3>
          </Link>
          <p>{props.item.composer || 'Unknown composer'}</p>
          <Show when={props.item.details?.length}>
            <small>{props.item.details!.join(' · ')}</small>
          </Show>
        </div>
        <div class="catalog-result-actions">
          {props.actions}
          <Show
            when={props.item.inLibrary}
            fallback={
              <button
                class="primary-button"
                type="button"
                aria-label="Add to My Library"
                title="Add to My Library"
                disabled={props.pending}
                onClick={() => void props.onAdd?.()}
              >
                {props.pending ? 'Adding…' : '+ Add'}
              </button>
            }
          >
            <DeleteConfirmationDialog
              triggerLabel={props.pending ? 'Removing…' : '- Remove'}
              triggerAriaLabel="Remove from My Library"
              triggerTooltip="Remove from My Library"
              title="Remove from My Library?"
              itemName={props.item.title}
              description="This removes the library entry and its note. The repertoire and your practice history remain available."
              confirmLabel="Remove from My Library"
              pendingLabel="Removing…"
              onConfirm={props.onRemove}
            />
          </Show>
        </div>
      </div>

      <Show when={props.item.inLibrary}>
        <RepertoireLibraryNote
          repertoireId={props.item.id}
          repertoireTitle={props.item.title}
          initialNote={props.item.libraryNotes ?? null}
        />
      </Show>
      {props.children}
    </article>
  );
}

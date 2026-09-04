import { For, Show, createSignal } from 'solid-js';
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/solid-router';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { ExerciseNotation } from '@/components/ExerciseNotation';
import {
  addExerciseToLibrary,
  deleteExercise,
  getExerciseDetail,
  removeExerciseFromLibrary,
} from '@/data/exercises';

export const Route = createFileRoute('/exercises/$exerciseId')({
  loader: async ({ params }) => {
    const exercise = await getExerciseDetail({ data: params.exerciseId });
    if (!exercise) throw notFound();
    return exercise;
  },
  component: ExerciseDetail,
  notFoundComponent: ExerciseNotFound,
});

function formatDate(value: string | null) {
  if (!value) return 'Not started';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function ExerciseDetail() {
  const exercise = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [updatingLibrary, setUpdatingLibrary] = createSignal(false);
  const [libraryError, setLibraryError] = createSignal('');

  async function updateLibrary(action: 'add' | 'remove') {
    setUpdatingLibrary(true);
    setLibraryError('');
    try {
      if (action === 'add') await addExerciseToLibrary({ data: exercise().id });
      else await removeExerciseFromLibrary({ data: exercise().id });
      await router.invalidate({ sync: true });
    } catch (caught) {
      setLibraryError(
        caught instanceof Error ? caught.message : 'My Library could not be updated.',
      );
      if (action === 'remove') throw caught;
    } finally {
      setUpdatingLibrary(false);
    }
  }

  return (
    <main class="page detail-page">
      <Link class="back-link" to="/library">
        ← My Library
      </Link>

      <header class="record-header">
        <div>
          <h1>{exercise().name}</h1>
          <Show when={exercise().instrumentName !== null}>{exercise().instrumentName}</Show>
        </div>
        <div class="header-actions">
          <span class="tag">{exercise().visibility.toLowerCase()}</span>
          <Show
            when={exercise().inLibrary}
            fallback={
              <button
                class="primary-button"
                type="button"
                aria-label="Add to My Library"
                title="Add to My Library"
                disabled={updatingLibrary()}
                onClick={() => void updateLibrary('add')}
              >
                {updatingLibrary() ? 'Adding…' : '+ Add'}
              </button>
            }
          >
            <DeleteConfirmationDialog
              triggerLabel="- Remove"
              triggerAriaLabel="Remove from My Library"
              triggerTooltip="Remove from My Library"
              title="Remove from My Library?"
              itemName={exercise().name}
              description="This removes the library entry. The exercise and your practice history remain available."
              confirmLabel="Remove from My Library"
              pendingLabel="Removing…"
              onConfirm={() => updateLibrary('remove')}
            />
          </Show>
          <Show when={exercise().canManage}>
            <Link
              class="secondary-button"
              to="/exercises/$exerciseId/edit"
              params={{ exerciseId: exercise().id }}
            >
              Edit
            </Link>
            <DeleteConfirmationDialog
              triggerLabel="Delete"
              title="Delete this exercise?"
              itemName={exercise().name}
              description="This removes the exercise from your library. Historical session entries will remain."
              confirmLabel="Delete exercise"
              onConfirm={async () => {
                await deleteExercise({ data: exercise().id });
                await router.invalidate({ sync: true });
                await navigate({ to: '/library' });
              }}
            />
          </Show>
        </div>
      </header>

      <Show when={libraryError()}>
        <p class="form-error" role="alert">
          {libraryError()}
        </p>
      </Show>

      <section class="detail-grid">
        <article class="detail-card detail-card-wide">
          <p class="eyebrow">Practice instruction</p>
          <Show
            when={exercise().notation}
            fallback={<p class="muted">No notation or instructions have been added.</p>}
          >
            <ExerciseNotation
              notation={exercise().notation ?? ''}
              format={exercise().notationFormat}
            />
          </Show>
        </article>

        <Show when={exercise().copiedFrom}>
          {(source) => (
            <article class="detail-card">
              <p class="eyebrow">Lineage</p>
              <p>
                Adapted from{' '}
                <Link
                  class="text-link"
                  to="/exercises/$exerciseId"
                  params={{ exerciseId: source().id }}
                >
                  {source().name}
                </Link>
              </p>
              <Show when={exercise().adaptations.length > 0}>
                <h2>Adaptations</h2>
                <ul class="detail-list">
                  <For each={exercise().adaptations}>
                    {(adaptation) => (
                      <li>
                        <Link to="/exercises/$exerciseId" params={{ exerciseId: adaptation.id }}>
                          {adaptation.name}
                        </Link>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </article>
          )}
        </Show>

        <article class="detail-card">
          <p class="eyebrow">Practice history</p>
          <Show
            when={exercise().sessions.length > 0}
            fallback={<p class="muted">This exercise has not appeared in a session.</p>}
          >
            <ul class="detail-list">
              <For each={exercise().sessions}>
                {(session) => (
                  <li>
                    <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
                      <strong>{session.templateName}</strong>
                      <span>
                        {formatDate(session.startedAt)} · {session.status.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>
      </section>
    </main>
  );
}

function ExerciseNotFound() {
  return (
    <main class="page empty-state">
      <h1>Exercise not found</h1>
      <p>The requested exercise does not exist.</p>
      <Link class="text-link" to="/library">
        Return to My Library
      </Link>
    </main>
  );
}

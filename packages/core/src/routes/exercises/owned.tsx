import { For, Show, createSignal } from 'solid-js';
import { Link, createFileRoute, useRouter } from '@tanstack/solid-router';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import {
  addExerciseToLibrary,
  getOwnedExercisePage,
  removeExerciseFromLibrary,
  type OwnedExerciseRow,
} from '@/data/exercises';

export const Route = createFileRoute('/exercises/owned')({
  loader: () => getOwnedExercisePage({ data: 1 }),
  component: OwnedExercises,
});

function OwnedExercises() {
  const initialPage = Route.useLoaderData();
  const router = useRouter();
  const [results, setResults] = createSignal(initialPage());
  const [loading, setLoading] = createSignal(false);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal('');

  function setLibraryStatus(exerciseId: string, inLibrary: boolean) {
    setResults((page) => ({
      ...page,
      items: page.items.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, inLibrary } : exercise,
      ),
    }));
  }

  async function loadPage(page: number) {
    setLoading(true);
    setError('');
    try {
      setResults(await getOwnedExercisePage({ data: page }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Owned exercises could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  async function addToLibrary(exercise: OwnedExerciseRow) {
    setAddingId(exercise.id);
    setError('');
    try {
      await addExerciseToLibrary({ data: exercise.id });
      setLibraryStatus(exercise.id, true);
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be added.');
    } finally {
      setAddingId(null);
    }
  }

  async function removeFromLibrary(exercise: OwnedExerciseRow) {
    await removeExerciseFromLibrary({ data: exercise.id });
    setLibraryStatus(exercise.id, false);
    await router.invalidate({ sync: true });
  }

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Exercise management</p>
          <h1>Owned by me</h1>
          <p class="lede">Manage exercises you created, whether or not they are in My Library.</p>
        </div>
        <div class="library-section-actions">
          <Link class="secondary-button" to="/library">
            My Library
          </Link>
          <Link class="primary-button" to="/exercises/search">
            Find exercises
          </Link>
        </div>
      </header>

      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>

      <section aria-live="polite" aria-busy={loading()}>
        <header class="library-section-header">
          <div>
            <p class="eyebrow">Created exercises</p>
            <h2>{results().total} exercises</h2>
          </div>
          <Link class="primary-button" to="/exercises/new">
            + Create exercise
          </Link>
        </header>

        <div class="card-grid" classList={{ 'catalog-results-loading': loading() }}>
          <For each={results().items} fallback={<p class="library-empty">No owned exercises.</p>}>
            {(exercise) => {
              return (
                <article class="content-card">
                  <div class="card-topline">
                    <span class="tag">{exercise.visibility.toLowerCase()}</span>
                    <span>{exercise.notationFormat}</span>
                  </div>
                  <h2>
                    <Link to="/exercises/$exerciseId" params={{ exerciseId: exercise.id }}>
                      {exercise.name}
                    </Link>
                  </h2>
                  <Show when={exercise.copiedFrom}>
                    <p class="muted">Adapted from {exercise.copiedFrom}</p>
                  </Show>
                  <div class="library-section-actions">
                    <Show
                      when={exercise.inLibrary}
                      fallback={
                        <button
                          class="primary-button"
                          type="button"
                          disabled={addingId() === exercise.id}
                          onClick={() => void addToLibrary(exercise)}
                        >
                          {addingId() === exercise.id ? 'Adding…' : '+ Add to Library'}
                        </button>
                      }
                    >
                      <DeleteConfirmationDialog
                        triggerLabel="Remove from Library"
                        title="Remove from My Library?"
                        itemName={exercise.name}
                        description="This removes the library entry. The exercise and your practice history remain available."
                        confirmLabel="Remove from My Library"
                        pendingLabel="Removing…"
                        onConfirm={() => removeFromLibrary(exercise)}
                      />
                    </Show>
                    <Link
                      class="secondary-button"
                      to="/exercises/$exerciseId"
                      params={{ exerciseId: exercise.id }}
                    >
                      View
                    </Link>
                    <Link
                      class="secondary-button"
                      to="/exercises/$exerciseId/edit"
                      params={{ exerciseId: exercise.id }}
                    >
                      Edit
                    </Link>
                  </div>
                </article>
              );
            }}
          </For>
        </div>

        <Show when={results().totalPages > 1}>
          <nav class="catalog-pagination" aria-label="Owned exercise pages">
            <button
              class="secondary-button"
              type="button"
              disabled={loading() || results().page === 1}
              onClick={() => void loadPage(results().page - 1)}
            >
              Previous
            </button>
            <span>
              Page {results().page} of {results().totalPages}
            </span>
            <button
              class="secondary-button"
              type="button"
              disabled={loading() || results().page === results().totalPages}
              onClick={() => void loadPage(results().page + 1)}
            >
              Next
            </button>
          </nav>
        </Show>
      </section>
    </main>
  );
}

import { For, Show, createSignal, onCleanup } from 'solid-js';
import { useRouter } from '@tanstack/solid-router';
import { ExerciseListRow } from '@/components/ExerciseListRow';
import { InstrumentFilter } from '@/components/InstrumentFields';
import {
  addExerciseToLibrary,
  getPublicExerciseCatalogPage,
  removeExerciseFromLibrary,
  type ExerciseCatalogPage,
  type ExerciseCatalogRow,
  type ExerciseCatalogSearchInput,
} from '@/data/exercises';
import type { InstrumentOption } from '@/data/repertoire';

export function ExerciseCatalogSearch(props: {
  initialPage: ExerciseCatalogPage;
  instruments: InstrumentOption[];
  initialInstrumentIds: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = createSignal('');
  const [hasNotation, setHasNotation] = createSignal(false);
  const [results, setResults] = createSignal(props.initialPage);
  const [instrumentIds, setInstrumentIds] = createSignal(props.initialInstrumentIds);
  const [loading, setLoading] = createSignal(false);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [addedIds, setAddedIds] = createSignal<string[]>([]);
  const [removedIds, setRemovedIds] = createSignal<string[]>([]);
  const [error, setError] = createSignal('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;

  function searchInput(page: number): ExerciseCatalogSearchInput {
    return {
      query: query(),
      hasNotation: hasNotation(),
      instrumentIds: instrumentIds(),
      page,
    };
  }

  async function loadPage(page: number) {
    clearTimeout(searchTimer);
    const currentRequest = ++requestId;
    setLoading(true);
    setError('');
    try {
      const nextResults = await getPublicExerciseCatalogPage({ data: searchInput(page) });
      if (currentRequest === requestId) setResults(nextResults);
    } catch (caught) {
      if (currentRequest === requestId) {
        setError(
          caught instanceof Error ? caught.message : 'The exercise catalog could not be searched.',
        );
      }
    } finally {
      if (currentRequest === requestId) setLoading(false);
    }
  }

  function queueSearch(delay = 0) {
    clearTimeout(searchTimer);
    requestId += 1;
    searchTimer = setTimeout(() => void loadPage(1), delay);
  }

  onCleanup(() => clearTimeout(searchTimer));

  async function addToLibrary(exercise: ExerciseCatalogRow) {
    setAddingId(exercise.id);
    setError('');
    try {
      await addExerciseToLibrary({ data: exercise.id });
      setAddedIds((ids) => [...ids, exercise.id]);
      setRemovedIds((ids) => ids.filter((id) => id !== exercise.id));
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be added.');
    } finally {
      setAddingId(null);
    }
  }

  async function removeFromLibrary(exercise: ExerciseCatalogRow) {
    setAddingId(exercise.id);
    setError('');
    try {
      await removeExerciseFromLibrary({ data: exercise.id });
      setRemovedIds((ids) => [...ids, exercise.id]);
      setAddedIds((ids) => ids.filter((id) => id !== exercise.id));
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be removed.');
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div class="catalog-search-layout">
      <aside class="catalog-filters" aria-label="Exercise catalog filters">
        <label class="field-label" for="exercise-catalog-search">
          Search exercises
        </label>
        <input
          id="exercise-catalog-search"
          class="text-input"
          type="search"
          value={query()}
          placeholder="Exercise name…"
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            queueSearch(300);
          }}
        />

        <label class="checkbox-field" for="exercise-catalog-notation">
          <input
            id="exercise-catalog-notation"
            type="checkbox"
            checked={hasNotation()}
            onChange={(event) => {
              setHasNotation(event.currentTarget.checked);
              queueSearch();
            }}
          />
          <span>Has notation</span>
        </label>

        <InstrumentFilter
          instruments={props.instruments}
          selectedIds={instrumentIds()}
          onChange={(ids) => {
            setInstrumentIds(ids);
            queueSearch();
          }}
        />

        <button
          class="text-button"
          type="button"
          onClick={() => {
            setQuery('');
            setHasNotation(false);
            setInstrumentIds([]);
            queueSearch();
          }}
        >
          Clear all filters
        </button>
      </aside>

      <section class="catalog-results" aria-live="polite" aria-busy={loading()}>
        <header>
          <div>
            <p class="eyebrow">Public exercise catalog</p>
            <h2>{results().total} matching exercises</h2>
          </div>
          <Show when={results().total > 0}>
            <small>
              Showing {(results().page - 1) * results().pageSize + 1}–
              {Math.min(results().page * results().pageSize, results().total)} of {results().total}
            </small>
          </Show>
        </header>

        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>

        <div class="catalog-result-list" classList={{ 'catalog-results-loading': loading() }}>
          <For
            each={results().items}
            fallback={<p class="library-empty">No public exercises match.</p>}
          >
            {(exercise) => {
              const inLibrary = () =>
                !removedIds().includes(exercise.id) &&
                (exercise.inLibrary || addedIds().includes(exercise.id));
              return (
                <ExerciseListRow
                  item={{ ...exercise, inLibrary: inLibrary() }}
                  pending={addingId() === exercise.id}
                  onAdd={() => addToLibrary(exercise)}
                  onRemove={() => removeFromLibrary(exercise)}
                />
              );
            }}
          </For>
        </div>

        <Show when={results().totalPages > 1}>
          <nav class="catalog-pagination" aria-label="Exercise catalog pages">
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
    </div>
  );
}

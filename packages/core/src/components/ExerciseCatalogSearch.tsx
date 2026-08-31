import { For, Show, createSignal, onCleanup } from 'solid-js';
import { Link, useRouter } from '@tanstack/solid-router';
import { InstrumentFilter } from '@/components/InstrumentFields';
import {
  addExerciseToLibrary,
  getPublicExerciseCatalogPage,
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
  const [notationFormat, setNotationFormat] =
    createSignal<ExerciseCatalogSearchInput['notationFormat']>('ALL');
  const [results, setResults] = createSignal(props.initialPage);
  const [instrumentIds, setInstrumentIds] = createSignal(props.initialInstrumentIds);
  const [loading, setLoading] = createSignal(false);
  const [addingId, setAddingId] = createSignal<string | null>(null);
  const [addedIds, setAddedIds] = createSignal<string[]>([]);
  const [error, setError] = createSignal('');
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let requestId = 0;

  function searchInput(page: number): ExerciseCatalogSearchInput {
    return {
      query: query(),
      notationFormat: notationFormat(),
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
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The exercise could not be added.');
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

        <label class="field-label" for="exercise-catalog-notation">
          Notation format
        </label>
        <select
          id="exercise-catalog-notation"
          class="text-input"
          value={notationFormat()}
          onChange={(event) => {
            setNotationFormat(
              event.currentTarget.value as ExerciseCatalogSearchInput['notationFormat'],
            );
            queueSearch();
          }}
        >
          <option value="ALL">All formats</option>
          <option value="text">Text</option>
          <option value="abc">ABC notation</option>
        </select>

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
            setNotationFormat('ALL');
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
              const inLibrary = () => exercise.inLibrary || addedIds().includes(exercise.id);
              return (
                <article class="catalog-result-card">
                  <div class="catalog-result-summary">
                    <div>
                      <div class="card-topline">
                        <span class="tag">{exercise.notationFormat}</span>
                        <Show when={exercise.instrumentName}>
                          <span>{exercise.instrumentName}</span>
                        </Show>
                        <span>By {exercise.owner}</span>
                      </div>
                      <h3>{exercise.name}</h3>
                      <Show when={exercise.copiedFrom}>
                        <small>Adapted from {exercise.copiedFrom}</small>
                      </Show>
                    </div>
                    <div class="catalog-result-actions">
                      <Link
                        class="secondary-button"
                        to="/exercises/$exerciseId"
                        params={{ exerciseId: exercise.id }}
                      >
                        View
                      </Link>
                      <button
                        class={inLibrary() ? 'secondary-button' : 'primary-button'}
                        type="button"
                        disabled={inLibrary() || addingId() === exercise.id}
                        onClick={() => void addToLibrary(exercise)}
                      >
                        {inLibrary()
                          ? 'In My Library'
                          : addingId() === exercise.id
                            ? 'Adding…'
                            : '+ Add'}
                      </button>
                    </div>
                  </div>
                </article>
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

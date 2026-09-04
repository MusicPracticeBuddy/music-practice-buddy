import { For, Show, createSignal, onCleanup } from 'solid-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { useRouter } from '@tanstack/solid-router';
import { ExerciseListRow } from '@/components/ExerciseListRow';
import { InstrumentFilter } from '@/components/InstrumentFields';
import {
  addExerciseToLibrary,
  removeExerciseFromLibrary,
  type ExerciseCatalogPage,
  type ExerciseCatalogRow,
  type ExerciseCatalogSearchInput,
} from '@/data/exercises';
import { exerciseCatalogQueryOptions, exerciseKeys } from '@/data/exerciseQueries';
import type { InstrumentOption } from '@/data/repertoire';

export function ExerciseCatalogSearch(props: {
  initialPage: ExerciseCatalogPage;
  instruments: InstrumentOption[];
  initialInstrumentIds: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = createSignal('');
  const [hasNotation, setHasNotation] = createSignal(false);
  const [instrumentIds, setInstrumentIds] = createSignal(props.initialInstrumentIds);
  const [search, setSearch] = createSignal<ExerciseCatalogSearchInput>(searchInput(1));
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function searchInput(page: number): ExerciseCatalogSearchInput {
    return {
      query: query(),
      hasNotation: hasNotation(),
      instrumentIds: instrumentIds(),
      page,
    };
  }

  function loadPage(page: number) {
    clearTimeout(searchTimer);
    setSearch(searchInput(page));
  }

  function queueSearch(delay = 0) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPage(1), delay);
  }

  onCleanup(() => clearTimeout(searchTimer));

  const queryClient = useQueryClient();
  const catalogQuery = useQuery(() => ({
    ...exerciseCatalogQueryOptions(search()),
    initialData: props.initialPage,
  }));
  const results = () => catalogQuery.data ?? props.initialPage;
  const libraryMutation = useMutation(() => ({
    mutationFn: async (input: { exercise: ExerciseCatalogRow; add: boolean }) => {
      if (input.add) await addExerciseToLibrary({ data: input.exercise.id });
      else await removeExerciseFromLibrary({ data: input.exercise.id });
      return input;
    },
    onSuccess: async ({ exercise, add }) => {
      queryClient.setQueryData<ExerciseCatalogPage>(exerciseKeys.catalog(search()), (page) =>
        page
          ? {
              ...page,
              items: page.items.map((item) =>
                item.id === exercise.id ? { ...item, inLibrary: add } : item,
              ),
            }
          : page,
      );
      await router.invalidate({ sync: true });
    },
  }));
  const addingId = () =>
    libraryMutation.isPending ? libraryMutation.variables?.exercise.id : null;
  const error = () => catalogQuery.error ?? libraryMutation.error;
  const errorMessage = () => {
    const caught = error();
    return caught instanceof Error ? caught.message : 'The exercise catalog could not be searched.';
  };

  const addToLibrary = async (exercise: ExerciseCatalogRow) => {
    await libraryMutation.mutateAsync({ exercise, add: true });
  };
  const removeFromLibrary = async (exercise: ExerciseCatalogRow) => {
    await libraryMutation.mutateAsync({ exercise, add: false });
  };

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

      <section class="catalog-results" aria-live="polite" aria-busy={catalogQuery.isFetching}>
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
            {errorMessage()}
          </p>
        </Show>

        <div
          class="catalog-result-list"
          classList={{ 'catalog-results-loading': catalogQuery.isFetching }}
        >
          <For
            each={results().items}
            fallback={<p class="library-empty">No public exercises match.</p>}
          >
            {(exercise) => {
              return (
                <ExerciseListRow
                  item={exercise}
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
              disabled={catalogQuery.isFetching || results().page === 1}
              onClick={() => loadPage(results().page - 1)}
            >
              Previous
            </button>
            <span>
              Page {results().page} of {results().totalPages}
            </span>
            <button
              class="secondary-button"
              type="button"
              disabled={catalogQuery.isFetching || results().page === results().totalPages}
              onClick={() => loadPage(results().page + 1)}
            >
              Next
            </button>
          </nav>
        </Show>
      </section>
    </div>
  );
}

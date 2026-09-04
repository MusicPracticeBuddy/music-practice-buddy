import { For, Show, createSignal, onCleanup } from 'solid-js';
import { Link, createFileRoute } from '@tanstack/solid-router';
import { ExerciseListRow } from '@/components/ExerciseListRow';
import { RepertoireListRow } from '@/components/RepertoireListRow';
import { InstrumentFilter } from '@/components/InstrumentFields';
import {
  getExerciseLibraryPage,
  removeExerciseFromLibrary,
  type ExerciseLibrarySearchInput,
  type ExerciseLibraryPage,
} from '@/data/exercises';
import {
  addRepertoireToLibrary,
  getInstruments,
  getRepertoireLibraryPage,
  removeRepertoireFromLibrary,
  type RepertoireLibrarySearchInput,
  type RepertoireLibraryPage,
  type CatalogRepertoireRow,
} from '@/data/repertoire';

export const Route = createFileRoute('/library')({
  loader: async () => {
    const instruments = await getInstruments();
    return { instruments };
  },
  component: Library,
});

function Library() {
  const data = Route.useLoaderData();
  const emptyRepertoirePage: RepertoireLibraryPage = {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };
  const emptyExercisePage: ExerciseLibraryPage = {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  };
  const [repertoire, setRepertoire] = createSignal(emptyRepertoirePage);
  const [exercises, setExercises] = createSignal(emptyExercisePage);
  const [repertoireExpanded, setRepertoireExpanded] = createSignal(false);
  const [exercisesExpanded, setExercisesExpanded] = createSignal(false);
  const [repertoireLoaded, setRepertoireLoaded] = createSignal(false);
  const [exercisesLoaded, setExercisesLoaded] = createSignal(false);
  const [repertoireLoading, setRepertoireLoading] = createSignal(false);
  const [exercisesLoading, setExercisesLoading] = createSignal(false);
  const [repertoireError, setRepertoireError] = createSignal('');
  const [expandedRepertoireIds, setExpandedRepertoireIds] = createSignal<string[]>([]);
  const [updatingRepertoireId, setUpdatingRepertoireId] = createSignal<string | null>(null);
  const [exerciseError, setExerciseError] = createSignal('');
  const [repertoireQuery, setRepertoireQuery] = createSignal('');
  const [composer, setComposer] = createSignal('');
  const [instrumentIds, setInstrumentIds] = createSignal<string[]>([]);
  const [exerciseInstrumentIds, setExerciseInstrumentIds] = createSignal<string[]>([]);
  const [repertoireVisibility, setRepertoireVisibility] =
    createSignal<RepertoireLibrarySearchInput['visibility']>('ALL');
  const [exerciseQuery, setExerciseQuery] = createSignal('');
  const [exerciseVisibility, setExerciseVisibility] =
    createSignal<ExerciseLibrarySearchInput['visibility']>('ALL');
  const [hasNotation, setHasNotation] = createSignal(false);
  let repertoireTimer: ReturnType<typeof setTimeout> | undefined;
  let exerciseTimer: ReturnType<typeof setTimeout> | undefined;
  let repertoireRequestId = 0;
  let exerciseRequestId = 0;

  function repertoireSearchInput(page: number): RepertoireLibrarySearchInput {
    return {
      query: repertoireQuery(),
      composer: composer(),
      instrumentIds: instrumentIds(),
      visibility: repertoireVisibility(),
      page,
    };
  }

  function exerciseSearchInput(page: number): ExerciseLibrarySearchInput {
    return {
      query: exerciseQuery(),
      visibility: exerciseVisibility(),
      hasNotation: hasNotation(),
      instrumentIds: exerciseInstrumentIds(),
      page,
    };
  }

  async function loadRepertoirePage(page: number) {
    clearTimeout(repertoireTimer);
    const currentRequest = ++repertoireRequestId;
    setRepertoireLoading(true);
    setRepertoireError('');
    try {
      let result = await getRepertoireLibraryPage({ data: repertoireSearchInput(page) });
      const lastPage = Math.max(1, result.totalPages);
      if (result.page > lastPage) {
        result = await getRepertoireLibraryPage({ data: repertoireSearchInput(lastPage) });
      }
      if (currentRequest === repertoireRequestId) {
        setRepertoire(result);
        setRepertoireLoaded(true);
      }
    } catch (caught) {
      if (currentRequest === repertoireRequestId) {
        setRepertoireError(
          caught instanceof Error ? caught.message : 'Repertoire could not be loaded.',
        );
      }
    } finally {
      if (currentRequest === repertoireRequestId) setRepertoireLoading(false);
    }
  }

  async function loadExercisePage(page: number) {
    clearTimeout(exerciseTimer);
    const currentRequest = ++exerciseRequestId;
    setExercisesLoading(true);
    setExerciseError('');
    try {
      const result = await getExerciseLibraryPage({ data: exerciseSearchInput(page) });
      if (currentRequest === exerciseRequestId) {
        setExercises(result);
        setExercisesLoaded(true);
      }
    } catch (caught) {
      if (currentRequest === exerciseRequestId) {
        setExerciseError(
          caught instanceof Error ? caught.message : 'Exercises could not be loaded.',
        );
      }
    } finally {
      if (currentRequest === exerciseRequestId) setExercisesLoading(false);
    }
  }

  function queueRepertoireSearch(delay = 0) {
    clearTimeout(repertoireTimer);
    repertoireRequestId += 1;
    repertoireTimer = setTimeout(() => void loadRepertoirePage(1), delay);
  }

  function queueExerciseSearch(delay = 0) {
    clearTimeout(exerciseTimer);
    exerciseRequestId += 1;
    exerciseTimer = setTimeout(() => void loadExercisePage(1), delay);
  }

  function toggleRepertoire() {
    const expanded = !repertoireExpanded();
    setRepertoireExpanded(expanded);
    if (expanded && !repertoireLoaded() && !repertoireLoading()) void loadRepertoirePage(1);
  }

  function toggleExercises() {
    const expanded = !exercisesExpanded();
    setExercisesExpanded(expanded);
    if (expanded && !exercisesLoaded() && !exercisesLoading()) void loadExercisePage(1);
  }

  onCleanup(() => {
    clearTimeout(repertoireTimer);
    clearTimeout(exerciseTimer);
  });

  return (
    <main class="page">
      <header class="page-header library-page-header">
        <h1>My Library</h1>
      </header>

      <div class="library-sections">
        <section
          class="library-section"
          aria-labelledby="repertoire-heading"
          aria-busy={repertoireLoading()}
        >
          <header class="library-section-header">
            <div>
              <button
                class="section-disclosure"
                type="button"
                aria-label={repertoireExpanded() ? 'Collapse repertoire' : 'Expand repertoire'}
                aria-expanded={repertoireExpanded()}
                aria-controls="library-repertoire-content"
                onClick={toggleRepertoire}
              >
                <span class="disclosure-icon" aria-hidden="true">
                  {repertoireExpanded() ? '⌄' : '›'}
                </span>
                <h2 id="repertoire-heading">My Repertoire</h2>
              </button>
              <Show when={repertoireLoaded()}>
                <span class="count-badge">{repertoire().total} entries</span>
              </Show>
            </div>
            <div class="library-section-actions">
              <Show when={repertoireExpanded()}>
                <Link class="secondary-button" to="/repertoire/owned">
                  Owned repertoire
                </Link>
                <Link class="primary-button" to="/repertoire/search">
                  Find repertoire
                </Link>
              </Show>
            </div>
          </header>

          <Show when={repertoireExpanded()}>
            <div id="library-repertoire-content">
              <div
                class="library-filter-bar"
                role="search"
                aria-label="Search My Library repertoire"
              >
                <label>
                  <span>Search</span>
                  <input
                    class="text-input"
                    type="search"
                    value={repertoireQuery()}
                    placeholder="Title or composer…"
                    onInput={(event) => {
                      setRepertoireQuery(event.currentTarget.value);
                      queueRepertoireSearch(300);
                    }}
                  />
                </label>
                <label>
                  <span>Composer</span>
                  <input
                    class="text-input"
                    type="search"
                    value={composer()}
                    placeholder="Any composer"
                    onInput={(event) => {
                      setComposer(event.currentTarget.value);
                      queueRepertoireSearch(300);
                    }}
                  />
                </label>
                <InstrumentFilter
                  instruments={data().instruments}
                  selectedIds={instrumentIds()}
                  onChange={(ids) => {
                    setInstrumentIds(ids);
                    queueRepertoireSearch();
                  }}
                />
                <label>
                  <span>Visibility</span>
                  <select
                    class="text-input"
                    value={repertoireVisibility()}
                    onChange={(event) => {
                      setRepertoireVisibility(
                        event.currentTarget.value as RepertoireLibrarySearchInput['visibility'],
                      );
                      queueRepertoireSearch();
                    }}
                  >
                    <option value="ALL">All visibility</option>
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public</option>
                  </select>
                </label>
                <button
                  class="text-button library-filter-clear"
                  type="button"
                  onClick={() => {
                    setRepertoireQuery('');
                    setComposer('');
                    setInstrumentIds([]);
                    setRepertoireVisibility('ALL');
                    queueRepertoireSearch();
                  }}
                >
                  Clear filters
                </button>
              </div>

              <Show when={repertoireError()}>
                <p class="form-error" role="alert">
                  {repertoireError()}
                </p>
              </Show>

              <Show
                when={repertoire().items.length > 0}
                fallback={
                  <Show when={!repertoireError()}>
                    <p class="library-empty">
                      {repertoireLoading()
                        ? 'Loading repertoire…'
                        : 'No repertoire items match these filters.'}
                    </p>
                  </Show>
                }
              >
                <div
                  class="catalog-result-list"
                  classList={{ 'catalog-results-loading': repertoireLoading() }}
                >
                  <For each={repertoire().items}>
                    {(piece) => {
                      const expanded = () => expandedRepertoireIds().includes(piece.id);
                      return (
                        <RepertoireListRow
                          item={{
                            id: piece.id,
                            title: piece.title,
                            composer: piece.composer,
                            details: [
                              piece.instrument ?? 'Unscored',
                              String(piece.compositionYear ?? 'Year unknown'),
                              piece.visibility.toLowerCase(),
                              ...(piece.measureRange ? [piece.measureRange] : []),
                            ],
                            inLibrary: true,
                            libraryNotes: piece.libraryNotes,
                          }}
                          pending={updatingRepertoireId() === piece.id}
                          actions={
                            <Show when={(piece.children?.length ?? 0) > 0}>
                              <button
                                class="text-button catalog-expand-button"
                                type="button"
                                aria-expanded={expanded()}
                                onClick={() =>
                                  setExpandedRepertoireIds((ids) =>
                                    expanded()
                                      ? ids.filter((id) => id !== piece.id)
                                      : [...ids, piece.id],
                                  )
                                }
                              >
                                {expanded() ? 'Hide' : 'Show'} {piece.children!.length}{' '}
                                {piece.children!.length === 1 ? 'child' : 'children'}
                              </button>
                            </Show>
                          }
                          onRemove={async () => {
                            setUpdatingRepertoireId(piece.id);
                            try {
                              await removeRepertoireFromLibrary({ data: piece.id });
                              await loadRepertoirePage(repertoire().page);
                            } finally {
                              setUpdatingRepertoireId(null);
                            }
                          }}
                        >
                          <Show when={expanded()}>
                            <LibraryRepertoireChildren
                              items={piece.children ?? []}
                              updatingId={updatingRepertoireId()}
                              onAdd={async (item) => {
                                setUpdatingRepertoireId(item.id);
                                try {
                                  await addRepertoireToLibrary({ data: item.id });
                                  await loadRepertoirePage(repertoire().page);
                                } finally {
                                  setUpdatingRepertoireId(null);
                                }
                              }}
                              onRemove={async (item) => {
                                setUpdatingRepertoireId(item.id);
                                try {
                                  await removeRepertoireFromLibrary({ data: item.id });
                                  await loadRepertoirePage(repertoire().page);
                                } finally {
                                  setUpdatingRepertoireId(null);
                                }
                              }}
                            />
                          </Show>
                        </RepertoireListRow>
                      );
                    }}
                  </For>
                </div>
              </Show>

              <Show when={repertoire().totalPages > 1}>
                <nav class="catalog-pagination" aria-label="My Library repertoire pages">
                  <button
                    class="secondary-button"
                    type="button"
                    disabled={repertoireLoading() || repertoire().page === 1}
                    onClick={() => void loadRepertoirePage(repertoire().page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {repertoire().page} of {repertoire().totalPages}
                  </span>
                  <button
                    class="secondary-button"
                    type="button"
                    disabled={repertoireLoading() || repertoire().page === repertoire().totalPages}
                    onClick={() => void loadRepertoirePage(repertoire().page + 1)}
                  >
                    Next
                  </button>
                </nav>
              </Show>
            </div>
          </Show>
        </section>

        <section
          class="library-section"
          aria-labelledby="exercises-heading"
          aria-busy={exercisesLoading()}
        >
          <header class="library-section-header">
            <div>
              <button
                class="section-disclosure"
                type="button"
                aria-label={exercisesExpanded() ? 'Collapse exercises' : 'Expand exercises'}
                aria-expanded={exercisesExpanded()}
                aria-controls="library-exercises-content"
                onClick={toggleExercises}
              >
                <span class="disclosure-icon" aria-hidden="true">
                  {exercisesExpanded() ? '⌄' : '›'}
                </span>
                <h2 id="exercises-heading">My Exercises</h2>
              </button>
              <Show when={exercisesLoaded()}>
                <span class="count-badge">{exercises().total} exercises</span>
              </Show>
            </div>
            <div class="library-section-actions">
              <Show when={exercisesExpanded()}>
                <Link class="secondary-button" to="/exercises/owned">
                  Owned exercises
                </Link>
                <Link class="secondary-button" to="/exercises/new">
                  + Create exercise
                </Link>
                <Link class="primary-button" to="/exercises/search">
                  Find exercises
                </Link>
              </Show>
            </div>
          </header>

          <Show when={exercisesExpanded()}>
            <div id="library-exercises-content">
              <div
                class="library-filter-bar"
                role="search"
                aria-label="Search My Library exercises"
              >
                <label>
                  <span>Search</span>
                  <input
                    class="text-input"
                    type="search"
                    value={exerciseQuery()}
                    placeholder="Exercise name…"
                    onInput={(event) => {
                      setExerciseQuery(event.currentTarget.value);
                      queueExerciseSearch(300);
                    }}
                  />
                </label>
                <label class="checkbox-field library-checkbox-filter">
                  <input
                    type="checkbox"
                    checked={hasNotation()}
                    onChange={(event) => {
                      setHasNotation(event.currentTarget.checked);
                      queueExerciseSearch();
                    }}
                  />
                  <span>Has notation</span>
                </label>
                <InstrumentFilter
                  instruments={data().instruments}
                  selectedIds={exerciseInstrumentIds()}
                  onChange={(ids) => {
                    setExerciseInstrumentIds(ids);
                    queueExerciseSearch();
                  }}
                />
                <label>
                  <span>Visibility</span>
                  <select
                    class="text-input"
                    value={exerciseVisibility()}
                    onChange={(event) => {
                      setExerciseVisibility(
                        event.currentTarget.value as ExerciseLibrarySearchInput['visibility'],
                      );
                      queueExerciseSearch();
                    }}
                  >
                    <option value="ALL">All visibility</option>
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public</option>
                  </select>
                </label>
                <button
                  class="text-button library-filter-clear"
                  type="button"
                  onClick={() => {
                    setExerciseQuery('');
                    setHasNotation(false);
                    setExerciseVisibility('ALL');
                    setExerciseInstrumentIds([]);
                    queueExerciseSearch();
                  }}
                >
                  Clear filters
                </button>
              </div>

              <Show when={exerciseError()}>
                <p class="form-error" role="alert">
                  {exerciseError()}
                </p>
              </Show>

              <Show
                when={exercises().items.length > 0}
                fallback={
                  <Show when={!exerciseError()}>
                    <p class="library-empty">
                      {exercisesLoading()
                        ? 'Loading exercises…'
                        : 'No exercises match these filters.'}
                    </p>
                  </Show>
                }
              >
                <div
                  class="catalog-result-list"
                  classList={{ 'catalog-results-loading': exercisesLoading() }}
                >
                  <For each={exercises().items}>
                    {(exercise) => (
                      <ExerciseListRow
                        item={{ ...exercise, inLibrary: true }}
                        onRemove={async () => {
                          await removeExerciseFromLibrary({ data: exercise.id });
                          await loadExercisePage(exercises().page);
                        }}
                      />
                    )}
                  </For>
                </div>
              </Show>

              <Show when={exercises().totalPages > 1}>
                <nav class="catalog-pagination" aria-label="My Library exercise pages">
                  <button
                    class="secondary-button"
                    type="button"
                    disabled={exercisesLoading() || exercises().page === 1}
                    onClick={() => void loadExercisePage(exercises().page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {exercises().page} of {exercises().totalPages}
                  </span>
                  <button
                    class="secondary-button"
                    type="button"
                    disabled={exercisesLoading() || exercises().page === exercises().totalPages}
                    onClick={() => void loadExercisePage(exercises().page + 1)}
                  >
                    Next
                  </button>
                </nav>
              </Show>
            </div>
          </Show>
        </section>
      </div>
    </main>
  );
}

function LibraryRepertoireChildren(props: {
  items: CatalogRepertoireRow[];
  updatingId: string | null;
  onAdd: (item: CatalogRepertoireRow) => Promise<void>;
  onRemove: (item: CatalogRepertoireRow) => Promise<void>;
}) {
  return (
    <ul class="catalog-child-list">
      <For each={props.items}>
        {(item) => (
          <li>
            <RepertoireListRow
              item={{
                id: item.id,
                title: item.title,
                composer: item.composers.map((composer) => composer.name).join(', '),
                details: [
                  item.instruments.map((instrument) => instrument.name).join(', ') || 'Unscored',
                  item.compositionYear === null ? 'Year unknown' : String(item.compositionYear),
                  item.visibility.toLowerCase(),
                  ...(item.measureRange ? [item.measureRange] : []),
                ],
                inLibrary: item.inLibrary,
                libraryNotes: item.libraryNotes,
              }}
              pending={props.updatingId === item.id}
              onAdd={() => props.onAdd(item)}
              onRemove={() => props.onRemove(item)}
            >
              <Show when={item.children.length > 0}>
                <LibraryRepertoireChildren {...props} items={item.children} />
              </Show>
            </RepertoireListRow>
          </li>
        )}
      </For>
    </ul>
  );
}

import { For, Show, createSignal, onCleanup } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { RepertoireLibraryNote } from '@/components/RepertoireLibraryNote'
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import {
  EMPTY_EXERCISE_LIBRARY_SEARCH,
  getExerciseLibraryPage,
  type ExerciseLibrarySearchInput,
} from '@/data/exercises'
import {
  EMPTY_REPERTOIRE_LIBRARY_SEARCH,
  getInstruments,
  getRepertoireLibraryPage,
  removeRepertoireFromLibrary,
  type RepertoireLibrarySearchInput,
  type RepertoireRow,
} from '@/data/repertoire'

export const Route = createFileRoute('/library')({
  loader: async () => {
    const [repertoire, exercises, instruments] = await Promise.all([
      getRepertoireLibraryPage({ data: EMPTY_REPERTOIRE_LIBRARY_SEARCH }),
      getExerciseLibraryPage({ data: EMPTY_EXERCISE_LIBRARY_SEARCH }),
      getInstruments(),
    ])
    return { repertoire, exercises, instruments }
  },
  component: Library,
})

function Library() {
  const data = Route.useLoaderData()
  const [repertoire, setRepertoire] = createSignal(data().repertoire)
  const [exercises, setExercises] = createSignal(data().exercises)
  const [repertoireLoading, setRepertoireLoading] = createSignal(false)
  const [exercisesLoading, setExercisesLoading] = createSignal(false)
  const [repertoireError, setRepertoireError] = createSignal('')
  const [exerciseError, setExerciseError] = createSignal('')
  const [repertoireQuery, setRepertoireQuery] = createSignal('')
  const [composer, setComposer] = createSignal('')
  const [instrumentId, setInstrumentId] = createSignal('')
  const [repertoireVisibility, setRepertoireVisibility] =
    createSignal<RepertoireLibrarySearchInput['visibility']>('ALL')
  const [exerciseQuery, setExerciseQuery] = createSignal('')
  const [exerciseVisibility, setExerciseVisibility] =
    createSignal<ExerciseLibrarySearchInput['visibility']>('ALL')
  const [notationFormat, setNotationFormat] =
    createSignal<ExerciseLibrarySearchInput['notationFormat']>('ALL')
  let repertoireTimer: ReturnType<typeof setTimeout> | undefined
  let exerciseTimer: ReturnType<typeof setTimeout> | undefined
  let repertoireRequestId = 0
  let exerciseRequestId = 0

  function repertoireSearchInput(page: number): RepertoireLibrarySearchInput {
    return {
      query: repertoireQuery(),
      composer: composer(),
      instrumentId: instrumentId(),
      visibility: repertoireVisibility(),
      page,
    }
  }

  function exerciseSearchInput(page: number): ExerciseLibrarySearchInput {
    return {
      query: exerciseQuery(),
      visibility: exerciseVisibility(),
      notationFormat: notationFormat(),
      page,
    }
  }

  async function loadRepertoirePage(page: number) {
    clearTimeout(repertoireTimer)
    const currentRequest = ++repertoireRequestId
    setRepertoireLoading(true)
    setRepertoireError('')
    try {
      let result = await getRepertoireLibraryPage({ data: repertoireSearchInput(page) })
      const lastPage = Math.max(1, result.totalPages)
      if (result.page > lastPage) {
        result = await getRepertoireLibraryPage({ data: repertoireSearchInput(lastPage) })
      }
      if (currentRequest === repertoireRequestId) setRepertoire(result)
    } catch (caught) {
      if (currentRequest === repertoireRequestId) {
        setRepertoireError(
          caught instanceof Error ? caught.message : 'Repertoire could not be loaded.',
        )
      }
    } finally {
      if (currentRequest === repertoireRequestId) setRepertoireLoading(false)
    }
  }

  async function loadExercisePage(page: number) {
    clearTimeout(exerciseTimer)
    const currentRequest = ++exerciseRequestId
    setExercisesLoading(true)
    setExerciseError('')
    try {
      const result = await getExerciseLibraryPage({ data: exerciseSearchInput(page) })
      if (currentRequest === exerciseRequestId) setExercises(result)
    } catch (caught) {
      if (currentRequest === exerciseRequestId) {
        setExerciseError(
          caught instanceof Error ? caught.message : 'Exercises could not be loaded.',
        )
      }
    } finally {
      if (currentRequest === exerciseRequestId) setExercisesLoading(false)
    }
  }

  function queueRepertoireSearch(delay = 0) {
    clearTimeout(repertoireTimer)
    repertoireRequestId += 1
    repertoireTimer = setTimeout(() => void loadRepertoirePage(1), delay)
  }

  function queueExerciseSearch(delay = 0) {
    clearTimeout(exerciseTimer)
    exerciseRequestId += 1
    exerciseTimer = setTimeout(() => void loadExercisePage(1), delay)
  }

  onCleanup(() => {
    clearTimeout(repertoireTimer)
    clearTimeout(exerciseTimer)
  })

  return (
    <main class="page">
      <header class="page-header library-page-header">
        <div>
          <p class="eyebrow">Music and technique</p>
          <h1>My Library</h1>
          <p class="lede">Your repertoire and exercises, together in one place.</p>
        </div>
      </header>

      <div class="library-sections">
        <section
          class="library-section"
          aria-labelledby="repertoire-heading"
          aria-busy={repertoireLoading()}
        >
          <header class="library-section-header">
            <div>
              <p class="eyebrow">Music library</p>
              <h2 id="repertoire-heading">Repertoire</h2>
              <span class="count-badge">{repertoire().total} entries</span>
            </div>
            <div class="library-section-actions">
              <Link class="secondary-button" to="/repertoire/owned">
                Owned repertoire
              </Link>
              <Link class="primary-button" to="/repertoire/search">
                + Add repertoire
              </Link>
            </div>
          </header>

          <div class="library-filter-bar" role="search" aria-label="Search My Library repertoire">
            <label>
              <span>Search</span>
              <input
                class="text-input"
                type="search"
                value={repertoireQuery()}
                placeholder="Title or composer…"
                onInput={(event) => {
                  setRepertoireQuery(event.currentTarget.value)
                  queueRepertoireSearch(300)
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
                  setComposer(event.currentTarget.value)
                  queueRepertoireSearch(300)
                }}
              />
            </label>
            <label>
              <span>Instrument</span>
              <select
                class="text-input"
                value={instrumentId()}
                onChange={(event) => {
                  setInstrumentId(event.currentTarget.value)
                  queueRepertoireSearch()
                }}
              >
                <option value="">Any instrument</option>
                <For each={data().instruments}>
                  {(instrument) => <option value={instrument.id}>{instrument.name}</option>}
                </For>
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select
                class="text-input"
                value={repertoireVisibility()}
                onChange={(event) => {
                  setRepertoireVisibility(
                    event.currentTarget.value as RepertoireLibrarySearchInput['visibility'],
                  )
                  queueRepertoireSearch()
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
                setRepertoireQuery('')
                setComposer('')
                setInstrumentId('')
                setRepertoireVisibility('ALL')
                queueRepertoireSearch()
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
            fallback={<p class="library-empty">No repertoire items match these filters.</p>}
          >
            <div class="card-grid" classList={{ 'catalog-results-loading': repertoireLoading() }}>
              <For each={repertoire().items}>
                {(piece) => (
                  <RepertoireCard
                    piece={piece}
                    onRemove={async () => {
                      await removeRepertoireFromLibrary({ data: piece.id })
                      await loadRepertoirePage(repertoire().page)
                    }}
                  />
                )}
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
        </section>

        <section
          class="library-section"
          aria-labelledby="exercises-heading"
          aria-busy={exercisesLoading()}
        >
          <header class="library-section-header">
            <div>
              <p class="eyebrow">Technique library</p>
              <h2 id="exercises-heading">Exercises</h2>
              <span class="count-badge">{exercises().total} exercises</span>
            </div>
            <div class="library-section-actions">
              <Link class="secondary-button" to="/exercises/new">
                + Create exercise
              </Link>
              <Link class="primary-button" to="/exercises/search">
                Find exercises
              </Link>
            </div>
          </header>

          <div class="library-filter-bar" role="search" aria-label="Search My Library exercises">
            <label>
              <span>Search</span>
              <input
                class="text-input"
                type="search"
                value={exerciseQuery()}
                placeholder="Exercise name…"
                onInput={(event) => {
                  setExerciseQuery(event.currentTarget.value)
                  queueExerciseSearch(300)
                }}
              />
            </label>
            <label>
              <span>Notation</span>
              <select
                class="text-input"
                value={notationFormat()}
                onChange={(event) => {
                  setNotationFormat(
                    event.currentTarget.value as ExerciseLibrarySearchInput['notationFormat'],
                  )
                  queueExerciseSearch()
                }}
              >
                <option value="ALL">All formats</option>
                <option value="text">Text</option>
                <option value="abc">ABC notation</option>
              </select>
            </label>
            <label>
              <span>Visibility</span>
              <select
                class="text-input"
                value={exerciseVisibility()}
                onChange={(event) => {
                  setExerciseVisibility(
                    event.currentTarget.value as ExerciseLibrarySearchInput['visibility'],
                  )
                  queueExerciseSearch()
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
                setExerciseQuery('')
                setNotationFormat('ALL')
                setExerciseVisibility('ALL')
                queueExerciseSearch()
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
            fallback={<p class="library-empty">No exercises match these filters.</p>}
          >
            <div class="list-stack" classList={{ 'catalog-results-loading': exercisesLoading() }}>
              <For each={exercises().items}>
                {(exercise, index) => (
                  <Link
                    class="list-card"
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: exercise.id }}
                  >
                    <span class="list-number">
                      {String((exercises().page - 1) * exercises().pageSize + index() + 1).padStart(
                        2,
                        '0',
                      )}
                    </span>
                    <div class="list-main">
                      <div class="card-topline">
                        <span class="tag">{exercise.visibility.toLowerCase()}</span>
                        <span>{exercise.notationFormat}</span>
                      </div>
                      <h2>{exercise.name}</h2>
                      <Show when={exercise.notation} fallback={<p>No notation added yet.</p>}>
                        <ExerciseNotation
                          notation={exercise.notation ?? ''}
                          format={exercise.notationFormat}
                        />
                      </Show>
                      {exercise.copiedFrom && <small>Adapted from {exercise.copiedFrom}</small>}
                    </div>
                  </Link>
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
        </section>
      </div>
    </main>
  )
}

function RepertoireCard(props: { piece: RepertoireRow; onRemove: () => Promise<void> }) {
  return (
    <article class="content-card">
      <div class="card-topline">
        <span class="tag">{props.piece.instrument ?? 'Unscored'}</span>
        <span>{props.piece.visibility.toLowerCase()}</span>
      </div>
      <h2>
        <Link to="/repertoire/$repertoireId" params={{ repertoireId: props.piece.id }}>
          {props.piece.title}
        </Link>
      </h2>
      <p class="muted">{props.piece.composer}</p>
      {props.piece.parentTitle && <p class="detail">From {props.piece.parentTitle}</p>}
      {props.piece.measureRange && <p class="detail">{props.piece.measureRange}</p>}

      <RepertoireLibraryNote
        repertoireId={props.piece.id}
        repertoireTitle={props.piece.title}
        initialNote={props.piece.libraryNotes}
      />

      <div class="library-section-actions">
        <Link
          class="text-link"
          to="/repertoire/$repertoireId"
          params={{ repertoireId: props.piece.id }}
        >
          View details →
        </Link>
        <DeleteConfirmationDialog
          triggerLabel="Remove"
          title="Remove from My Library?"
          itemName={props.piece.title}
          description="This removes the library entry and its note. The repertoire and your practice history remain available."
          confirmLabel="Remove from My Library"
          pendingLabel="Removing…"
          onConfirm={props.onRemove}
        />
      </div>
    </article>
  )
}

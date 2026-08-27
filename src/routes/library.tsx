import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { getExercises } from '@/data/exercises'
import { getRepertoire } from '@/data/repertoire'

export const Route = createFileRoute('/library')({
  loader: async () => {
    const [repertoire, exercises] = await Promise.all([getRepertoire(), getExercises()])
    return { repertoire, exercises }
  },
  component: Library,
})

function LibraryToggle(props: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label class="library-toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" />
      {props.label}
    </label>
  )
}

function Library() {
  const data = Route.useLoaderData()
  const [includePublicRepertoire, setIncludePublicRepertoire] = createSignal(false)
  const [includePublicExercises, setIncludePublicExercises] = createSignal(false)

  const repertoire = createMemo(() =>
    data().repertoire.filter((piece) => includePublicRepertoire() || piece.visibility !== 'PUBLIC'),
  )
  const exercises = createMemo(() =>
    data().exercises.filter(
      (exercise) => includePublicExercises() || exercise.visibility !== 'PUBLIC',
    ),
  )

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
        <section class="library-section" aria-labelledby="repertoire-heading">
          <header class="library-section-header">
            <div>
              <p class="eyebrow">Music library</p>
              <h2 id="repertoire-heading">Repertoire</h2>
              <span class="count-badge">{repertoire().length} entries</span>
            </div>
            <div class="library-section-actions">
              <LibraryToggle
                checked={includePublicRepertoire()}
                label="Include public repertoire"
                onChange={setIncludePublicRepertoire}
              />
              <Link class="primary-button" to="/repertoire/new">
                + Add repertoire
              </Link>
            </div>
          </header>

          <Show
            when={repertoire().length > 0}
            fallback={<p class="library-empty">No repertoire items to show.</p>}
          >
            <div class="card-grid">
              <For each={repertoire()}>
                {(piece) => (
                  <article class="content-card">
                    <div class="card-topline">
                      <span class="tag">{piece.instrument ?? 'Unscored'}</span>
                      <span>{piece.visibility.toLowerCase()}</span>
                    </div>
                    <h2>
                      <Link to="/repertoire/$repertoireId" params={{ repertoireId: piece.id }}>
                        {piece.title}
                      </Link>
                    </h2>
                    <p class="muted">{piece.composer}</p>
                    {piece.parentTitle && <p class="detail">From {piece.parentTitle}</p>}
                    {piece.measureRange && <p class="detail">{piece.measureRange}</p>}
                    {piece.libraryNotes && <p class="note">{piece.libraryNotes}</p>}
                    <Link
                      class="text-link"
                      to="/repertoire/$repertoireId"
                      params={{ repertoireId: piece.id }}
                    >
                      View details →
                    </Link>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </section>

        <section class="library-section" aria-labelledby="exercises-heading">
          <header class="library-section-header">
            <div>
              <p class="eyebrow">Technique library</p>
              <h2 id="exercises-heading">Exercises</h2>
              <span class="count-badge">{exercises().length} exercises</span>
            </div>
            <div class="library-section-actions">
              <LibraryToggle
                checked={includePublicExercises()}
                label="Include public exercises"
                onChange={setIncludePublicExercises}
              />
              <Link class="primary-button" to="/exercises/new">
                + Add exercise
              </Link>
            </div>
          </header>

          <Show
            when={exercises().length > 0}
            fallback={<p class="library-empty">No exercises to show.</p>}
          >
            <div class="list-stack">
              <For each={exercises()}>
                {(exercise, index) => (
                  <Link
                    class="list-card"
                    to="/exercises/$exerciseId"
                    params={{ exerciseId: exercise.id }}
                  >
                    <span class="list-number">{String(index() + 1).padStart(2, '0')}</span>
                    <div class="list-main">
                      <div class="card-topline">
                        <span class="tag">{exercise.visibility.toLowerCase()}</span>
                        <span>{exercise.notationFormat}</span>
                      </div>
                      <h2>{exercise.name}</h2>
                      <p>{exercise.notation ?? 'No notation added yet.'}</p>
                      {exercise.copiedFrom && <small>Adapted from {exercise.copiedFrom}</small>}
                    </div>
                  </Link>
                )}
              </For>
            </div>
          </Show>
        </section>
      </div>
    </main>
  )
}

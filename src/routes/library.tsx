import { For, Show } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { RepertoireLibraryNote } from '@/components/RepertoireLibraryNote'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import { getExercises } from '@/data/exercises'
import { getRepertoire, type RepertoireRow } from '@/data/repertoire'

export const Route = createFileRoute('/library')({
  loader: async () => {
    const [repertoire, exercises] = await Promise.all([getRepertoire(), getExercises()])
    return { repertoire, exercises }
  },
  component: Library,
})

function Library() {
  const data = Route.useLoaderData()
  const repertoire = () => data().repertoire
  const exercises = () => data().exercises

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
              <For each={repertoire()}>{(piece) => <RepertoireCard piece={piece} />}</For>
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
        </section>
      </div>
    </main>
  )
}

function RepertoireCard(props: { piece: RepertoireRow }) {
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

      <Link
        class="text-link"
        to="/repertoire/$repertoireId"
        params={{ repertoireId: props.piece.id }}
      >
        View details →
      </Link>
    </article>
  )
}

import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { getExercises } from '../../data/music'

export const Route = createFileRoute('/exercises/')({
  loader: () => getExercises(),
  component: Exercises,
})

function Exercises() {
  const exercises = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Technique library</p>
          <h1>Exercises</h1>
        </div>
        <span class="count-badge">{exercises().length} exercises</span>
      </header>

      <section class="list-stack">
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
                <small>
                  {exercise.owner}
                  {exercise.copiedFrom && ` · Adapted from ${exercise.copiedFrom}`}
                </small>
              </div>
            </Link>
          )}
        </For>
      </section>
    </main>
  )
}

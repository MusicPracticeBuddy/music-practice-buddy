import { For, Show } from 'solid-js'
import { Link, createFileRoute, notFound } from '@tanstack/solid-router'
import { getExerciseDetail } from '@/data/exercises'

export const Route = createFileRoute('/exercises/$exerciseId')({
  loader: async ({ params }) => {
    const exercise = await getExerciseDetail({ data: params.exerciseId })
    if (!exercise) throw notFound()
    return exercise
  },
  component: ExerciseDetail,
  notFoundComponent: ExerciseNotFound,
})

function formatDate(value: string | null) {
  if (!value) return 'Not started'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function ExerciseDetail() {
  const exercise = Route.useLoaderData()

  return (
    <main class="page detail-page">
      <Link class="back-link" to="/library">
        ← My Library
      </Link>

      <header class="record-header">
        <div>
          <p class="eyebrow">Exercise #{exercise().id}</p>
          <h1>{exercise().name}</h1>
        </div>
        <span class="tag">{exercise().visibility.toLowerCase()}</span>
      </header>

      <section class="detail-grid">
        <article class="detail-card detail-card-wide">
          <p class="eyebrow">Practice instruction</p>
          <Show
            when={exercise().notation}
            fallback={<p class="muted">No notation or instructions have been added.</p>}
          >
            <div class="notation-block">
              <span>{exercise().notationFormat}</span>
              <p>{exercise().notation}</p>
            </div>
          </Show>
        </article>

        <article class="detail-card">
          <p class="eyebrow">Lineage</p>
          <Show when={exercise().copiedFrom} fallback={<p>This is an original exercise.</p>}>
            {(source) => (
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
            )}
          </Show>
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
  )
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
  )
}

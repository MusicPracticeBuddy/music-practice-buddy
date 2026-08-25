import { Show } from 'solid-js'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { getDashboard } from '../data/music'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: Dashboard,
})

function formatDate(value: string | null) {
  if (!value) return 'No time assigned'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function Dashboard() {
  const data = Route.useLoaderData()

  return (
    <main class="page">
      <section class="hero">
        <p class="eyebrow">Practice overview</p>
        <h1>Make today’s practice count.</h1>
        <p class="lede">Your repertoire, exercises, and recent sessions—all in one calm place.</p>
      </section>

      <section class="stat-grid" aria-label="Practice statistics">
        <Link class="stat-card" to="/repertoire">
          <span>Repertoire</span>
          <strong>{data().counts.repertoire}</strong>
          <small>pieces and excerpts</small>
        </Link>
        <Link class="stat-card" to="/exercises">
          <span>Exercises</span>
          <strong>{data().counts.exercises}</strong>
          <small>in the library</small>
        </Link>
        <Link class="stat-card" to="/sessions">
          <span>Practice time</span>
          <strong>{data().minutesPracticed}</strong>
          <small>minutes completed</small>
        </Link>
        <Link class="stat-card" to="/sessions">
          <span>Sessions</span>
          <strong>{data().counts.sessions}</strong>
          <small>{data().counts.completedSessions} completed</small>
        </Link>
      </section>

      <section class="feature-card">
        <Show
          when={data().nextSession}
          fallback={
            <div>
              <p class="eyebrow">Up next</p>
              <h2>Nothing scheduled</h2>
              <p>Your practice calendar is clear.</p>
            </div>
          }
        >
          {(session) => (
            <>
              <div>
                <p class="eyebrow">Up next</p>
                <h2>{session().templateName}</h2>
                <p>{formatDate(session().assignedAt)}</p>
              </div>
              <span class={`status status-${session().status.toLowerCase()}`}>
                {session().status.replace('_', ' ')}
              </span>
            </>
          )}
        </Show>
      </section>
    </main>
  )
}

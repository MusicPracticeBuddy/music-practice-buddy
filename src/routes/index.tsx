import { Show } from 'solid-js'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { getDashboard } from '../data/dashboard'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: Dashboard,
})

function formatSchedule(assignedDate: string | null) {
  if (!assignedDate) return 'No date assigned'
  const [year, month, day] = assignedDate.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(year!, month! - 1, day))
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
                <p>{formatSchedule(session().assignedDate)}</p>
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

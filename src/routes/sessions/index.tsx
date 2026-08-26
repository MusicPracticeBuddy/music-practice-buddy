import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { getSessions } from '../../data/sessions'

export const Route = createFileRoute('/sessions/')({
  loader: () => getSessions(),
  component: Sessions,
})

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function dateOnlyValue(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day)
}

function formatSchedule(startedAt: string | null, assignedDate: string | null) {
  if (startedAt) return formatDate(startedAt)
  if (!assignedDate) return 'Not scheduled'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dateOnlyValue(assignedDate))
}

function datePart(value: string | null, assignedDate: string | null, part: 'day' | 'month') {
  if (!value && !assignedDate) return '—'
  return new Intl.DateTimeFormat(undefined, {
    [part]: part === 'day' ? '2-digit' : 'short',
  }).format(value ? new Date(value) : dateOnlyValue(assignedDate!))
}

function Sessions() {
  const sessions = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Practice log</p>
          <h1>Sessions</h1>
        </div>
        <div class="header-actions">
          <span class="count-badge">{sessions().length} sessions</span>
          <Link class="primary-button" to="/sessions/new" search={{}}>
            Create session
          </Link>
        </div>
      </header>

      <section class="session-table">
        <For each={sessions()}>
          {(session) => (
            <Link class="session-row" to="/sessions/$sessionId" params={{ sessionId: session.id }}>
              <div class="date-tile">
                <strong>{datePart(session.startedAt, session.assignedDate, 'day')}</strong>
                <span>{datePart(session.startedAt, session.assignedDate, 'month')}</span>
              </div>
              <div class="session-main">
                <h2>{session.templateName}</h2>
                <p>{formatSchedule(session.startedAt, session.assignedDate)}</p>
              </div>
              <div class="session-meta">
                <strong>
                  {session.durationMinutes
                    ? `${session.durationMinutes} min`
                    : `${session.itemCount} items`}
                </strong>
                <span class={`status status-${session.status.toLowerCase()}`}>
                  {session.status.replace('_', ' ')}
                </span>
              </div>
            </Link>
          )}
        </For>
      </section>
    </main>
  )
}

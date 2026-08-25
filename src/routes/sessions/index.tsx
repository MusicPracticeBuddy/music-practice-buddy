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

function Sessions() {
  const sessions = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Practice log</p>
          <h1>Sessions</h1>
        </div>
        <span class="count-badge">{sessions().length} sessions</span>
      </header>

      <section class="session-table">
        <For each={sessions()}>
          {(session) => (
            <Link class="session-row" to="/sessions/$sessionId" params={{ sessionId: session.id }}>
              <div class="date-tile">
                <strong>
                  {new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(
                    new Date(session.assignedAt ?? session.startedAt ?? ''),
                  )}
                </strong>
                <span>
                  {new Intl.DateTimeFormat(undefined, { month: 'short' }).format(
                    new Date(session.assignedAt ?? session.startedAt ?? ''),
                  )}
                </span>
              </div>
              <div class="session-main">
                <h2>{session.templateName}</h2>
                <p>{formatDate(session.startedAt ?? session.assignedAt)}</p>
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

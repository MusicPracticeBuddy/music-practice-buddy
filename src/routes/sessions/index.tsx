import { For, Show, createSignal } from 'solid-js'
import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '../../components/DeleteConfirmationDialog'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import { deletePlannedSession, getSessions, type SessionRow } from '../../data/sessions'

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
        <For each={sessions()}>{(session) => <SessionListItem session={session} />}</For>
      </section>
    </main>
  )
}

function SessionListItem(props: { session: SessionRow }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const isPlanned = () => props.session.status === 'PLANNED'
  const displayedStatus = () =>
    props.session.readyToFinalize
      ? { className: 'ready', label: 'Ready to finalize' }
      : {
          className: props.session.status.toLowerCase(),
          label: props.session.status.replace('_', ' '),
        }

  return (
    <SwipeToDelete enabled={isPlanned()} onDeleteRequest={() => setDeleteOpen(true)}>
      <article class="session-row">
        <Link
          class="session-row-link"
          to="/sessions/$sessionId"
          params={{ sessionId: props.session.id }}
          draggable={false}
        >
          <div class="date-tile">
            <strong>{datePart(props.session.startedAt, props.session.assignedDate, 'day')}</strong>
            <span>{datePart(props.session.startedAt, props.session.assignedDate, 'month')}</span>
          </div>
          <div class="session-main">
            <h2>{props.session.templateName}</h2>
            <p>{formatSchedule(props.session.startedAt, props.session.assignedDate)}</p>
          </div>
          <div class="session-meta">
            <strong>
              {props.session.durationMinutes
                ? `${props.session.durationMinutes} min`
                : `${props.session.itemCount} items`}
            </strong>
            <span class={`status status-${displayedStatus().className}`}>
              {displayedStatus().label}
            </span>
          </div>
        </Link>
        <Show when={isPlanned()}>
          <DeleteConfirmationDialog
            triggerLabel="Delete"
            title="Delete this planned session?"
            itemName={props.session.templateName}
            description="This permanently deletes the planned session and its practice outline."
            confirmLabel="Delete session"
            open={deleteOpen()}
            onOpenChange={setDeleteOpen}
            onConfirm={async () => {
              await deletePlannedSession({ data: props.session.id })
              await router.invalidate()
            }}
          />
        </Show>
      </article>
    </SwipeToDelete>
  )
}

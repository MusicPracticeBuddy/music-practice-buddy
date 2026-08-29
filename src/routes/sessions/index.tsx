import { For, Show, createSignal } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import { SwipeToDelete } from '@/components/SwipeToDelete'
import { InstrumentFilter } from '@/components/InstrumentFields'
import {
  deletePlannedSession,
  EMPTY_SESSION_SEARCH,
  getSessionsPage,
  type SessionRow,
} from '@/data/sessions'
import { getMusicianInstrumentIds } from '@/data/preferences'
import { getInstruments } from '@/data/repertoire'
import { SESSION_STATUS } from '@/domain/session'

export const Route = createFileRoute('/sessions/')({
  loader: async () => {
    const instrumentIds = await getMusicianInstrumentIds()
    const [page, instruments] = await Promise.all([
      getSessionsPage({ data: { ...EMPTY_SESSION_SEARCH, instrumentIds } }),
      getInstruments(),
    ])
    return { page, instruments, instrumentIds }
  },
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
  const initialPage = Route.useLoaderData()
  const [sessions, setSessions] = createSignal(initialPage().page)
  const [instrumentIds, setInstrumentIds] = createSignal(initialPage().instrumentIds)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')

  async function loadPage(page: number) {
    setLoading(true)
    setError('')
    try {
      let result = await getSessionsPage({ data: { instrumentIds: instrumentIds(), page } })
      const lastPage = Math.max(1, result.totalPages)
      if (result.page > lastPage) {
        result = await getSessionsPage({ data: { instrumentIds: instrumentIds(), page: lastPage } })
      }
      setSessions(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sessions could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Practice log</p>
          <h1>Sessions</h1>
        </div>
        <div class="header-actions">
          <span class="count-badge">{sessions().total} sessions</span>
          <Link class="primary-button" to="/sessions/new" search={{}}>
            Create session
          </Link>
        </div>
      </header>

      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>

      <div class="library-filter-bar" role="search" aria-label="Filter sessions">
        <InstrumentFilter
          instruments={initialPage().instruments}
          selectedIds={instrumentIds()}
          onChange={(ids) => {
            setInstrumentIds(ids)
            void loadPage(1)
          }}
        />
        <button
          class="text-button library-filter-clear"
          type="button"
          onClick={() => {
            setInstrumentIds([])
            void loadPage(1)
          }}
        >
          Clear filters
        </button>
      </div>

      <section
        class="session-table"
        classList={{ 'catalog-results-loading': loading() }}
        aria-live="polite"
        aria-busy={loading()}
      >
        <For each={sessions().items} fallback={<p class="library-empty">No sessions yet.</p>}>
          {(session) => (
            <SessionListItem
              session={session}
              onDelete={async () => {
                await deletePlannedSession({ data: session.id })
                await loadPage(sessions().page)
              }}
            />
          )}
        </For>
      </section>

      <Show when={sessions().totalPages > 1}>
        <nav class="catalog-pagination" aria-label="Session pages">
          <button
            class="secondary-button"
            type="button"
            disabled={loading() || sessions().page === 1}
            onClick={() => void loadPage(sessions().page - 1)}
          >
            Previous
          </button>
          <span>
            Page {sessions().page} of {sessions().totalPages}
          </span>
          <button
            class="secondary-button"
            type="button"
            disabled={loading() || sessions().page === sessions().totalPages}
            onClick={() => void loadPage(sessions().page + 1)}
          >
            Next
          </button>
        </nav>
      </Show>
    </main>
  )
}

function SessionListItem(props: { session: SessionRow; onDelete: () => Promise<void> }) {
  const [deleteOpen, setDeleteOpen] = createSignal(false)
  const isPlanned = () => props.session.status === SESSION_STATUS.PLANNED
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
            <Show when={props.session.instrumentName}>
              <small>{props.session.instrumentName}</small>
            </Show>
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
            onConfirm={props.onDelete}
          />
        </Show>
      </article>
    </SwipeToDelete>
  )
}

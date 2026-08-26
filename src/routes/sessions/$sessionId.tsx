import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import {
  Link,
  createFileRoute,
  notFound,
  useBlocker,
  useNavigate,
  useRouter,
} from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '../../components/DeleteConfirmationDialog'
import {
  completePracticeSession,
  deletePlannedSession,
  getSessionDetail,
  startPracticeSession,
  updateSessionProgress,
  type SessionDetail,
  type SessionDetailItem,
  type SessionItemAction,
  type SessionItemStatus,
  type SessionProgressUpdate,
  type SessionTimingMode,
} from '../../data/sessions'

type SessionItemNode = SessionDetailItem & { children: SessionItemNode[] }

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const session = await getSessionDetail({ data: params.sessionId })
    if (!session) throw notFound()
    return session
  },
  component: SessionDetailPage,
  notFoundComponent: SessionNotFound,
})

function buildItemTree(items: SessionDetailItem[]): SessionItemNode[] {
  const nodes = new Map<string, SessionItemNode>()
  const roots: SessionItemNode[] = []
  for (const item of items) nodes.set(item.id, { ...item, children: [] })
  for (const item of items) {
    const node = nodes.get(item.id)
    if (!node) continue
    const parent = item.parentId ? nodes.get(item.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function descendants(item: SessionItemNode): SessionItemNode[] {
  return item.children.flatMap((child) => [child, ...descendants(child)])
}

function practiceDescendants(item: SessionItemNode) {
  return descendants(item).filter((child) => child.type !== 'SECTION')
}

function derivedSectionStatus(item: SessionItemNode): SessionItemStatus {
  const children = practiceDescendants(item)
  if (children.length === 0) return 'NOT_STARTED'
  if (children.every((child) => child.status === 'SKIPPED')) return 'SKIPPED'
  if (children.every((child) => child.status === 'COMPLETE' || child.status === 'SKIPPED')) {
    return 'COMPLETE'
  }
  if (children.some((child) => child.status === 'IN_PROGRESS' || child.status === 'COMPLETE')) {
    return 'IN_PROGRESS'
  }
  return 'NOT_STARTED'
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatSchedule(startedAt: string | null, assignedDate: string | null) {
  if (startedAt) return formatDate(startedAt)
  if (!assignedDate) return 'Not scheduled'
  const [year, month, day] = assignedDate.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(year!, month! - 1, day))
}

function localDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusLabel(status: SessionItemStatus) {
  return status
    .replace('_', ' ')
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase())
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The session could not be updated.'
}

function StatusIndicator(props: { status: SessionItemStatus }) {
  const icon = () => {
    if (props.status === 'COMPLETE') return '✓'
    if (props.status === 'SKIPPED') return '—'
    if (props.status === 'IN_PROGRESS') return '◐'
    return '○'
  }
  return (
    <span
      class={`item-state item-state-${props.status.toLowerCase().replace('_', '-')}`}
      aria-label={statusLabel(props.status)}
      title={statusLabel(props.status)}
    >
      {icon()}
    </span>
  )
}

function SessionDetailPage() {
  const loadedSession = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [session, setSession] = createStore<SessionDetail>({
    ...loadedSession(),
    items: loadedSession().items.map((item) => ({ ...item })),
  })
  const [timingChoice, setTimingChoice] = createSignal<SessionTimingMode>('MANUAL')
  const [starting, setStarting] = createSignal(false)
  const [completing, setCompleting] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [queuedChangeCount, setQueuedChangeCount] = createSignal(0)
  const [routeDataDirty, setRouteDataDirty] = createSignal(false)
  const [error, setError] = createSignal('')
  const pendingChanges: Array<{ itemId: string; action: SessionItemAction }> = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let activeFlush: Promise<void> | undefined

  const itemTree = createMemo(() => buildItemTree(session.items))
  const practiceItems = createMemo(() => session.items.filter((item) => item.type !== 'SECTION'))
  const completeCount = createMemo(
    () => practiceItems().filter((item) => item.status === 'COMPLETE').length,
  )
  const skippedCount = createMemo(
    () => practiceItems().filter((item) => item.status === 'SKIPPED').length,
  )
  const resolvedCount = createMemo(() => completeCount() + skippedCount())
  const progress = createMemo(() => {
    const total = practiceItems().length
    return total === 0 ? 0 : Math.round((resolvedCount() / total) * 100)
  })
  const allResolved = createMemo(() => resolvedCount() === practiceItems().length)
  const displayedStatus = createMemo(() =>
    session.status === 'IN_PROGRESS' && allResolved()
      ? { className: 'ready', label: 'Ready to finalize' }
      : { className: session.status.toLowerCase(), label: session.status.replace('_', ' ') },
  )
  const canStart = createMemo(
    () =>
      session.status === 'PLANNED' &&
      (!session.assignedDate || session.assignedDate === localDate()),
  )
  const hasActiveItem = createMemo(() =>
    practiceItems().some((item) => item.status === 'IN_PROGRESS'),
  )

  createEffect(() => {
    const loaded = loadedSession()
    if (queuedChangeCount() > 0 || saving() || routeDataDirty()) return
    setSession({ ...loaded, items: loaded.items.map((item) => ({ ...item })) })
  })

  function applyProgress(update: SessionProgressUpdate) {
    setSession('status', update.status)
    setSession('timingMode', update.timingMode)
    setSession('startedAt', update.startedAt)
    setSession('endedAt', update.endedAt)
    setSession('durationMinutes', update.durationMinutes)
    for (const changed of update.items) {
      const index = session.items.findIndex((item) => item.id === changed.id)
      if (index >= 0) setSession('items', index, changed)
    }
    setRouteDataDirty(true)
  }

  function sectionNode(itemId: string) {
    return flattenTree(buildItemTree(session.items)).find((item) => item.id === itemId)
  }

  function optimisticAction(itemId: string, action: SessionItemAction) {
    const index = session.items.findIndex((item) => item.id === itemId)
    const item = session.items[index]
    if (!item) return
    const now = new Date().toISOString()

    if (item.type === 'SECTION') {
      const section = sectionNode(itemId)
      if (!section) return
      const childIds = new Set(practiceDescendants(section).map((child) => child.id))
      for (let childIndex = 0; childIndex < session.items.length; childIndex += 1) {
        const child = session.items[childIndex]!
        if (!childIds.has(child.id)) continue
        if (action === 'SKIP') {
          setSession('items', childIndex, { status: 'SKIPPED', startedAt: null, endedAt: null })
        } else if (action === 'RESET' && child.status === 'SKIPPED') {
          setSession('items', childIndex, { status: 'NOT_STARTED', startedAt: null, endedAt: null })
        }
      }
      return
    }

    if (action === 'START') {
      setSession('items', index, { status: 'IN_PROGRESS', startedAt: now, endedAt: null })
    } else if (action === 'COMPLETE') {
      setSession('items', index, { status: 'COMPLETE', endedAt: item.startedAt ? now : null })
    } else if (action === 'SKIP') {
      setSession('items', index, { status: 'SKIPPED', startedAt: null, endedAt: null })
    } else {
      setSession('items', index, { status: 'NOT_STARTED', startedAt: null, endedAt: null })
    }

    if (session.timingMode === 'AUTO' && !hasActiveItem()) {
      const next = flattenTree(buildItemTree(session.items)).find(
        (candidate) => candidate.type !== 'SECTION' && candidate.status === 'NOT_STARTED',
      )
      if (next) {
        const nextIndex = session.items.findIndex((candidate) => candidate.id === next.id)
        setSession('items', nextIndex, { status: 'IN_PROGRESS', startedAt: now, endedAt: null })
      }
    }
  }

  function flushChanges(): Promise<void> {
    flushTimer = undefined
    if (activeFlush) return activeFlush
    if (pendingChanges.length === 0) return Promise.resolve()
    const changes = pendingChanges.splice(0)
    setQueuedChangeCount(pendingChanges.length)
    activeFlush = (async () => {
      setSaving(true)
      setError('')
      try {
        const update = await updateSessionProgress({ data: { sessionId: session.id, changes } })
        applyProgress(update)
        for (const pending of pendingChanges) optimisticAction(pending.itemId, pending.action)
      } catch (caught) {
        setError(errorMessage(caught))
        const fresh = await getSessionDetail({ data: session.id })
        if (fresh) setSession(fresh)
        for (const pending of pendingChanges) optimisticAction(pending.itemId, pending.action)
        await router.invalidate()
        setRouteDataDirty(false)
      } finally {
        setSaving(false)
        activeFlush = undefined
        if (pendingChanges.length > 0) flushTimer = setTimeout(flushChanges, 0)
      }
    })()
    return activeFlush
  }

  async function drainChanges() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
    while (activeFlush || pendingChanges.length > 0) {
      if (activeFlush) await activeFlush
      else await flushChanges()
    }
    if (routeDataDirty()) {
      await router.invalidate()
      setRouteDataDirty(false)
    }
  }

  function queueAction(itemId: string, action: SessionItemAction) {
    optimisticAction(itemId, action)
    pendingChanges.push({ itemId, action })
    setQueuedChangeCount(pendingChanges.length)
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushChanges, 250)
  }

  async function startSession() {
    setStarting(true)
    setError('')
    try {
      const update = await startPracticeSession({
        data: { sessionId: session.id, timingMode: timingChoice(), localDate: localDate() },
      })
      applyProgress(update)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setStarting(false)
    }
  }

  async function completeSession() {
    await drainChanges()

    setCompleting(true)
    setError('')
    try {
      const update = await completePracticeSession({ data: session.id })
      applyProgress(update)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setCompleting(false)
    }
  }

  useBlocker({
    shouldBlockFn: async () => {
      if (queuedChangeCount() === 0 && !saving() && !routeDataDirty()) return false
      await drainChanges()
      return false
    },
    enableBeforeUnload: () => queuedChangeCount() > 0 || saving(),
  })

  onCleanup(() => {
    if (flushTimer) clearTimeout(flushTimer)
    if (pendingChanges.length > 0) void flushChanges()
  })

  return (
    <main class="page session-detail-page">
      <Link class="back-link" to="/sessions">
        ← All sessions
      </Link>
      <header class="session-detail-header">
        <div>
          <p class="eyebrow">Session #{session.id}</p>
          <h1>{session.templateName}</h1>
          <p class="lede">{formatSchedule(session.startedAt, session.assignedDate)}</p>
        </div>
        <div class="header-actions">
          <Show when={session.status === 'PLANNED'}>
            <Link
              class="secondary-button"
              to="/sessions/$sessionId/edit"
              params={{ sessionId: session.id }}
            >
              Edit session
            </Link>
            <DeleteConfirmationDialog
              triggerLabel="Delete session"
              title="Delete this planned session?"
              itemName={session.templateName}
              description="This permanently deletes the planned session and its practice outline."
              confirmLabel="Delete session"
              onConfirm={async () => {
                await deletePlannedSession({ data: session.id })
                await navigate({ to: '/sessions' })
              }}
            />
          </Show>
          <span class={`status status-${displayedStatus().className}`}>
            {displayedStatus().label}
          </span>
        </div>
      </header>

      <div class="meta-row">
        <span class="count-badge">{practiceItems().length} practice items</span>
        <Show when={session.timingMode}>
          <span class="count-badge">
            {session.timingMode === 'AUTO' ? 'Auto-timing' : 'Manual timing'}
          </span>
        </Show>
        <Show when={session.durationMinutes !== null}>
          <span class="count-badge">{session.durationMinutes} timed minutes</span>
        </Show>
        <Show when={saving()}>
          <span class="sync-state">Saving…</span>
        </Show>
      </div>
      <Show when={error()}>
        <p class="form-error session-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show when={session.status === 'PLANNED'}>
        <section class="session-start-card" aria-labelledby="start-session-title">
          <div>
            <p class="eyebrow">Ready when you are</p>
            <h2 id="start-session-title">Start this session</h2>
            <p>Choose how timers should behave. Manual timing is the default.</p>
          </div>
          <div class="timing-options">
            <label classList={{ selected: timingChoice() === 'MANUAL' }}>
              <input
                type="radio"
                name="timing-mode"
                value="MANUAL"
                checked={timingChoice() === 'MANUAL'}
                onChange={() => setTimingChoice('MANUAL')}
              />
              <span>
                <strong>Manual timing</strong>
                <small>Use as a checklist. Start a timer only when you want one.</small>
              </span>
            </label>
            <label classList={{ selected: timingChoice() === 'AUTO' }}>
              <input
                type="radio"
                name="timing-mode"
                value="AUTO"
                checked={timingChoice() === 'AUTO'}
                onChange={() => setTimingChoice('AUTO')}
              />
              <span>
                <strong>Auto-timing</strong>
                <small>Start the first item now and automatically advance.</small>
              </span>
            </label>
          </div>
          <button
            class="primary-button"
            type="button"
            disabled={!canStart() || starting()}
            onClick={startSession}
          >
            {starting() ? 'Starting…' : 'Start session'}
          </button>
          <Show when={!canStart()}>
            <p class="start-restriction">
              This session can be started on {formatSchedule(null, session.assignedDate)}.
            </p>
          </Show>
        </section>
      </Show>

      <section class="progress-card" aria-label="Session progress">
        <div class="progress-topline">
          <strong>Session progress</strong>
          <span>
            {completeCount()} complete · {skippedCount()} skipped ·{' '}
            {practiceItems().length - resolvedCount()} remaining
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-value" style={{ width: `${progress()}%` }} />
        </div>
      </section>

      <Show
        when={itemTree().length > 0}
        fallback={
          <section class="empty-state">
            <h2>No practice items</h2>
            <p>This session does not have any copied exercises or repertoire yet.</p>
          </section>
        }
      >
        <section class="session-outline" aria-label="Session contents">
          <For each={itemTree()}>
            {(item) => (
              <SessionItem
                item={item}
                sessionActive={session.status === 'IN_PROGRESS'}
                timingMode={session.timingMode}
                hasActiveItem={hasActiveItem()}
                onAction={queueAction}
              />
            )}
          </For>
        </section>
      </Show>

      <Show when={session.status === 'IN_PROGRESS'}>
        <section class="session-completion-card">
          <div>
            <p class="eyebrow">Finish session</p>
            <h2>{allResolved() ? 'Everything is resolved' : 'Resolve the remaining items'}</h2>
            <p>
              Completing the session locks it permanently. Until then, completed and skipped items
              can still be reset.
            </p>
          </div>
          <button
            class="primary-button"
            type="button"
            disabled={!allResolved() || saving() || completing()}
            onClick={completeSession}
          >
            {completing()
              ? 'Completing…'
              : allResolved()
                ? 'Complete session'
                : `${practiceItems().length - resolvedCount()} items remaining`}
          </button>
        </section>
      </Show>
      <Show when={session.status === 'COMPLETED'}>
        <section class="session-locked-note">
          <strong>Session complete</strong>
          <span>This practice record is locked and can no longer be changed.</span>
        </section>
      </Show>
    </main>
  )
}

function flattenTree(items: SessionItemNode[]): SessionItemNode[] {
  return items.flatMap((item) => [item, ...flattenTree(item.children)])
}

function SessionItem(props: {
  item: SessionItemNode
  sessionActive: boolean
  timingMode: SessionTimingMode | null
  hasActiveItem: boolean
  onAction: (itemId: string, action: SessionItemAction) => void
}) {
  const isSection = props.item.type === 'SECTION'
  const [expanded, setExpanded] = createSignal(isSection)
  const contentId = `session-item-${props.item.id}-content`
  const status = () => (isSection ? derivedSectionStatus(props.item) : props.item.status)
  const sectionCanSkip = () => {
    const items = practiceDescendants(props.item)
    return (
      items.length > 0 &&
      items.every((item) => item.status === 'NOT_STARTED' || item.status === 'SKIPPED')
    )
  }

  if (isSection) {
    return (
      <section class="practice-section">
        <div class="practice-section-header">
          <button
            type="button"
            class="section-disclosure"
            aria-expanded={expanded()}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span class="disclosure-icon" aria-hidden="true">
              {expanded() ? '⌄' : '›'}
            </span>
            <h2>{props.item.name}</h2>
          </button>
          <div class="disclosure-status">
            <Show when={props.sessionActive && status() === 'SKIPPED'}>
              <button
                class="item-action item-action-reset"
                type="button"
                onClick={() => props.onAction(props.item.id, 'RESET')}
              >
                Reset section
              </button>
            </Show>
            <Show when={props.sessionActive && status() !== 'SKIPPED' && sectionCanSkip()}>
              <button
                class="item-action"
                type="button"
                onClick={() => props.onAction(props.item.id, 'SKIP')}
              >
                Skip section
              </button>
            </Show>
            <StatusIndicator status={status()} />
          </div>
        </div>
        <Show when={expanded()}>
          <div id={contentId}>
            <Show when={props.item.notes}>
              <p class="practice-notes">{props.item.notes}</p>
            </Show>
            <div class="practice-items">
              <For each={props.item.children}>
                {(child) => <SessionItem {...props} item={child} />}
              </For>
            </div>
          </div>
        </Show>
      </section>
    )
  }

  return (
    <article
      class={`practice-item practice-item-${props.item.status.toLowerCase().replace('_', '-')}`}
    >
      <button
        type="button"
        class="practice-item-toggle"
        aria-expanded={expanded()}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span class="disclosure-icon" aria-hidden="true">
          {expanded() ? '⌄' : '›'}
        </span>
        <h3>{props.item.name}</h3>
        <StatusIndicator status={props.item.status} />
      </button>
      <Show when={expanded()}>
        <div id={contentId} class="practice-item-details">
          <div class="practice-item-heading">
            <span class="item-type">{props.item.type.toLowerCase()}</span>
            <span class="item-timing">
              {props.item.durationMinutes !== null
                ? `${props.item.durationMinutes} min`
                : statusLabel(props.item.status)}
            </span>
          </div>
          <Show when={props.item.notes}>
            <p class="practice-notes">{props.item.notes}</p>
          </Show>
          <Show when={props.item.notation}>
            <div class="notation-block">
              <span>{props.item.notationFormat}</span>
              <p>{props.item.notation}</p>
            </div>
          </Show>
          <Show when={props.sessionActive}>
            <div class="item-actions">
              <Show when={props.item.status === 'NOT_STARTED' && props.timingMode === 'MANUAL'}>
                <button
                  class="item-action"
                  type="button"
                  disabled={props.hasActiveItem}
                  onClick={() => props.onAction(props.item.id, 'START')}
                >
                  Start timer
                </button>
              </Show>
              <Show
                when={props.item.status === 'NOT_STARTED' || props.item.status === 'IN_PROGRESS'}
              >
                <button
                  class="item-action item-action-complete"
                  type="button"
                  onClick={() => props.onAction(props.item.id, 'COMPLETE')}
                >
                  Complete
                </button>
                <button
                  class="item-action"
                  type="button"
                  onClick={() => props.onAction(props.item.id, 'SKIP')}
                >
                  Skip
                </button>
              </Show>
              <Show when={props.item.status === 'COMPLETE' || props.item.status === 'SKIPPED'}>
                <button
                  class="item-action item-action-reset"
                  type="button"
                  onClick={() => props.onAction(props.item.id, 'RESET')}
                >
                  Reset to not started
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </article>
  )
}

function SessionNotFound() {
  return (
    <main class="page empty-state">
      <h1>Session not found</h1>
      <p>The requested practice session does not exist.</p>
      <Link class="text-link" to="/sessions">
        Return to sessions
      </Link>
    </main>
  )
}

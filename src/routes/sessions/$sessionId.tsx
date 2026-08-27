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
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import { PracticeLibraryPanel } from '@/components/PracticeLibraryPanel'
import { SessionExerciseNotation } from '@/components/SessionExerciseNotation'
import {
  addRunningSessionItem,
  completePracticeSession,
  createTemplateFromSession,
  deletePlannedSession,
  duplicatePracticeSession,
  getSessionDetail,
  removeRunningSessionItem,
  startPracticeSession,
  updateSessionName,
  updateRunningSessionItemSessionNote,
  updateSessionProgress,
  type SessionDetail,
  type SessionDetailItem,
  type SessionItemAction,
  type SessionItemStatus,
  type SessionProgressUpdate,
  type SessionTimingMode,
} from '@/data/sessions'
import { getTemplateLibrary, type TemplateLibraryItem } from '@/data/sessionTemplates'
import {
  LIBRARY_ITEM_TYPE,
  PRACTICE_ITEM_TYPE,
  SESSION_ITEM_ACTION,
  SESSION_ITEM_STATUS,
  SESSION_STATUS,
  SESSION_TIMING_MODE,
  isLibraryItemType,
  isResolvedSessionItemStatus,
  appendKeyToSessionNote,
  type LibraryItemType,
} from '@/domain/session'

type SessionItemNode = SessionDetailItem & { children: SessionItemNode[] }

const SESSION_MANAGEMENT_ACTION = {
  DUPLICATE: 'DUPLICATE',
  TEMPLATE: 'TEMPLATE',
} as const

type SessionManagementAction =
  (typeof SESSION_MANAGEMENT_ACTION)[keyof typeof SESSION_MANAGEMENT_ACTION]

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
  return descendants(item).filter((child) => child.type !== PRACTICE_ITEM_TYPE.SECTION)
}

function derivedSectionStatus(item: SessionItemNode): SessionItemStatus {
  const children = practiceDescendants(item)
  if (children.length === 0) return SESSION_ITEM_STATUS.NOT_STARTED
  if (children.every((child) => child.status === SESSION_ITEM_STATUS.SKIPPED)) {
    return SESSION_ITEM_STATUS.SKIPPED
  }
  if (children.every((child) => isResolvedSessionItemStatus(child.status))) {
    return SESSION_ITEM_STATUS.COMPLETE
  }
  if (
    children.some(
      (child) =>
        child.status === SESSION_ITEM_STATUS.IN_PROGRESS ||
        child.status === SESSION_ITEM_STATUS.COMPLETE,
    )
  ) {
    return SESSION_ITEM_STATUS.IN_PROGRESS
  }
  return SESSION_ITEM_STATUS.NOT_STARTED
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

function dragLibraryItem(event: DragEvent, item: TemplateLibraryItem) {
  event.dataTransfer?.setData('application/x-practice-library-item', JSON.stringify(item))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function StatusIndicator(props: { status: SessionItemStatus }) {
  const icon = () => {
    if (props.status === SESSION_ITEM_STATUS.COMPLETE) return '✓'
    if (props.status === SESSION_ITEM_STATUS.SKIPPED) return '—'
    if (props.status === SESSION_ITEM_STATUS.IN_PROGRESS) return '◐'
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
  const [timingChoice, setTimingChoice] = createSignal<SessionTimingMode>(
    SESSION_TIMING_MODE.MANUAL,
  )
  const [starting, setStarting] = createSignal(false)
  const [completing, setCompleting] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [editingName, setEditingName] = createSignal(false)
  const [nameDraft, setNameDraft] = createSignal(loadedSession().templateName)
  const [nameDirty, setNameDirty] = createSignal(false)
  const [nameSaving, setNameSaving] = createSignal(false)
  const [structuralSaving, setStructuralSaving] = createSignal(false)
  const [managementAction, setManagementAction] = createSignal<SessionManagementAction | null>(null)
  const [addingItem, setAddingItem] = createSignal(false)
  const [libraryLoading, setLibraryLoading] = createSignal(false)
  const [library, setLibrary] = createSignal<TemplateLibraryItem[]>([])
  const [libraryType, setLibraryType] = createSignal<LibraryItemType>(LIBRARY_ITEM_TYPE.EXERCISE)
  const [queuedChangeCount, setQueuedChangeCount] = createSignal(0)
  const [routeDataDirty, setRouteDataDirty] = createSignal(false)
  const [error, setError] = createSignal('')
  const pendingChanges: Array<{ itemId: string; action: SessionItemAction }> = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let activeFlush: Promise<void> | undefined
  let nameFlushTimer: ReturnType<typeof setTimeout> | undefined
  let activeNameFlush: Promise<void> | undefined
  let activeStructuralChange: Promise<boolean> | undefined

  const itemTree = createMemo(() => buildItemTree(session.items))
  const practiceItems = createMemo(() =>
    session.items.filter((item) => item.type !== PRACTICE_ITEM_TYPE.SECTION),
  )
  const completeCount = createMemo(
    () => practiceItems().filter((item) => item.status === SESSION_ITEM_STATUS.COMPLETE).length,
  )
  const skippedCount = createMemo(
    () => practiceItems().filter((item) => item.status === SESSION_ITEM_STATUS.SKIPPED).length,
  )
  const resolvedCount = createMemo(() => completeCount() + skippedCount())
  const progress = createMemo(() => {
    const total = practiceItems().length
    return total === 0 ? 0 : Math.round((resolvedCount() / total) * 100)
  })
  const allResolved = createMemo(() => resolvedCount() === practiceItems().length)
  const displayedStatus = createMemo(() =>
    session.status === SESSION_STATUS.IN_PROGRESS && allResolved()
      ? { className: 'ready', label: 'Ready to finalize' }
      : { className: session.status.toLowerCase(), label: session.status.replace('_', ' ') },
  )
  const canStart = createMemo(
    () =>
      session.status === SESSION_STATUS.PLANNED &&
      (!session.assignedDate || session.assignedDate === localDate()),
  )
  const hasActiveItem = createMemo(() =>
    practiceItems().some((item) => item.status === SESSION_ITEM_STATUS.IN_PROGRESS),
  )

  createEffect(() => {
    const loaded = loadedSession()
    if (
      queuedChangeCount() > 0 ||
      saving() ||
      nameDirty() ||
      nameSaving() ||
      structuralSaving() ||
      routeDataDirty()
    ) {
      return
    }
    setSession({ ...loaded, items: loaded.items.map((item) => ({ ...item })) })
    setNameDraft(loaded.templateName)
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

    if (item.type === PRACTICE_ITEM_TYPE.SECTION) {
      const section = sectionNode(itemId)
      if (!section) return
      const childIds = new Set(practiceDescendants(section).map((child) => child.id))
      for (let childIndex = 0; childIndex < session.items.length; childIndex += 1) {
        const child = session.items[childIndex]!
        if (!childIds.has(child.id)) continue
        if (action === SESSION_ITEM_ACTION.SKIP) {
          setSession('items', childIndex, {
            status: SESSION_ITEM_STATUS.SKIPPED,
            startedAt: null,
            endedAt: null,
          })
        } else if (
          action === SESSION_ITEM_ACTION.RESET &&
          child.status === SESSION_ITEM_STATUS.SKIPPED
        ) {
          setSession('items', childIndex, {
            status: SESSION_ITEM_STATUS.NOT_STARTED,
            startedAt: null,
            endedAt: null,
          })
        }
      }
      return
    }

    if (action === SESSION_ITEM_ACTION.START) {
      setSession('items', index, {
        status: SESSION_ITEM_STATUS.IN_PROGRESS,
        startedAt: now,
        endedAt: null,
      })
    } else if (action === SESSION_ITEM_ACTION.COMPLETE) {
      setSession('items', index, {
        status: SESSION_ITEM_STATUS.COMPLETE,
        endedAt: item.startedAt ? now : null,
      })
    } else if (action === SESSION_ITEM_ACTION.SKIP) {
      setSession('items', index, {
        status: SESSION_ITEM_STATUS.SKIPPED,
        startedAt: null,
        endedAt: null,
      })
    } else {
      setSession('items', index, {
        status: SESSION_ITEM_STATUS.NOT_STARTED,
        startedAt: null,
        endedAt: null,
      })
    }

    if (session.timingMode === SESSION_TIMING_MODE.AUTO && !hasActiveItem()) {
      const next = flattenTree(buildItemTree(session.items)).find(
        (candidate) =>
          candidate.type !== PRACTICE_ITEM_TYPE.SECTION &&
          candidate.status === SESSION_ITEM_STATUS.NOT_STARTED,
      )
      if (next) {
        const nextIndex = session.items.findIndex((candidate) => candidate.id === next.id)
        setSession('items', nextIndex, {
          status: SESSION_ITEM_STATUS.IN_PROGRESS,
          startedAt: now,
          endedAt: null,
        })
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

  function flushNameChange(): Promise<void> {
    if (nameFlushTimer) clearTimeout(nameFlushTimer)
    nameFlushTimer = undefined
    if (activeNameFlush) return activeNameFlush
    if (!nameDirty()) return Promise.resolve()

    const name = nameDraft().trim()
    if (!name || name.length > 200) {
      setError(name ? 'Session name must be 200 characters or fewer' : 'Session name is required')
      setNameDraft(session.templateName)
      setNameDirty(false)
      return Promise.resolve()
    }

    setNameDirty(false)
    activeNameFlush = (async () => {
      setNameSaving(true)
      setError('')
      try {
        const updated = await updateSessionName({ data: { sessionId: session.id, name } })
        setSession('templateName', updated.name)
        if (!nameDirty()) setNameDraft(updated.name)
        setRouteDataDirty(true)
      } catch (caught) {
        setError(errorMessage(caught))
        const fresh = await getSessionDetail({ data: session.id })
        if (fresh) {
          setSession(fresh)
          if (!nameDirty()) setNameDraft(fresh.templateName)
        }
      } finally {
        setNameSaving(false)
        activeNameFlush = undefined
        if (nameDirty()) nameFlushTimer = setTimeout(flushNameChange, 0)
      }
    })()
    return activeNameFlush
  }

  function queueNameChange(value: string) {
    setNameDraft(value)
    setNameDirty(true)
    if (nameFlushTimer) clearTimeout(nameFlushTimer)
    nameFlushTimer = setTimeout(flushNameChange, 400)
  }

  async function refreshSession() {
    const fresh = await getSessionDetail({ data: session.id })
    if (!fresh) throw new Error('Session not found')
    setSession(fresh)
    setNameDraft(fresh.templateName)
    setRouteDataDirty(true)
  }

  function runStructuralChange(change: () => Promise<void>): Promise<boolean> {
    if (activeStructuralChange) return activeStructuralChange
    activeStructuralChange = (async () => {
      setStructuralSaving(true)
      setError('')
      try {
        await change()
        await refreshSession()
        return true
      } catch (caught) {
        setError(errorMessage(caught))
        return false
      } finally {
        setStructuralSaving(false)
        activeStructuralChange = undefined
      }
    })()
    return activeStructuralChange
  }

  async function openItemPicker() {
    setAddingItem(true)
    if (library().length > 0 || libraryLoading()) return
    setLibraryLoading(true)
    try {
      const items = await getTemplateLibrary()
      setLibrary(items)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLibraryLoading(false)
    }
  }

  function addLibraryItem(item: TemplateLibraryItem, parentId: string | null) {
    return runStructuralChange(async () => {
      await addRunningSessionItem({
        data: {
          sessionId: session.id,
          parentId,
          type: item.type,
          sourceId: item.id,
          instruction: '',
        },
      })
    })
  }

  function dropLibraryItem(event: DragEvent, parentId: string | null) {
    event.preventDefault()
    const value = event.dataTransfer?.getData('application/x-practice-library-item')
    if (!value) return
    try {
      const item = JSON.parse(value) as TemplateLibraryItem
      if (!isLibraryItemType(item.type)) return
      void addLibraryItem(item, parentId)
    } catch {
      setError('That practice item could not be added')
    }
  }

  function removeItem(itemId: string) {
    return runStructuralChange(async () => {
      await removeRunningSessionItem({ data: { sessionId: session.id, itemId } })
    })
  }

  async function updateItemSessionNote(itemId: string, sessionNote: string) {
    if (activeStructuralChange) await activeStructuralChange
    return runStructuralChange(async () => {
      await updateRunningSessionItemSessionNote({
        data: { sessionId: session.id, itemId, sessionNote },
      })
    })
  }

  async function duplicateSession() {
    setManagementAction(SESSION_MANAGEMENT_ACTION.DUPLICATE)
    setError('')
    try {
      await drainChanges()
      const duplicated = await duplicatePracticeSession({ data: session.id })
      await navigate({
        to: '/sessions/$sessionId/edit',
        params: { sessionId: duplicated.id },
      })
    } catch (caught) {
      setError(errorMessage(caught))
      setManagementAction(null)
    }
  }

  async function saveAsTemplate() {
    setManagementAction(SESSION_MANAGEMENT_ACTION.TEMPLATE)
    setError('')
    try {
      await drainChanges()
      const template = await createTemplateFromSession({ data: session.id })
      await navigate({
        to: '/templates/$templateId',
        params: { templateId: template.id },
      })
    } catch (caught) {
      setError(errorMessage(caught))
      setManagementAction(null)
    }
  }

  async function drainChanges() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = undefined
    while (activeFlush || pendingChanges.length > 0) {
      if (activeFlush) await activeFlush
      else await flushChanges()
    }
    while (activeNameFlush || nameDirty()) {
      if (activeNameFlush) await activeNameFlush
      else await flushNameChange()
    }
    if (activeStructuralChange) await activeStructuralChange
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
      if (
        queuedChangeCount() === 0 &&
        !saving() &&
        !nameDirty() &&
        !nameSaving() &&
        !structuralSaving() &&
        !routeDataDirty()
      ) {
        return false
      }
      await drainChanges()
      return false
    },
    enableBeforeUnload: () =>
      queuedChangeCount() > 0 || saving() || nameDirty() || nameSaving() || structuralSaving(),
  })

  onCleanup(() => {
    if (flushTimer) clearTimeout(flushTimer)
    if (nameFlushTimer) clearTimeout(nameFlushTimer)
    if (pendingChanges.length > 0) void flushChanges()
    if (nameDirty()) void flushNameChange()
  })

  return (
    <main class="page session-detail-page">
      <Link class="back-link" to="/sessions">
        ← All sessions
      </Link>
      <header class="session-detail-header">
        <div>
          <p class="eyebrow">Session #{session.id}</p>
          <Show
            when={session.status === SESSION_STATUS.IN_PROGRESS && editingName()}
            fallback={
              <div class="session-title-row">
                <h1>{session.templateName}</h1>
                <Show when={session.status === SESSION_STATUS.IN_PROGRESS}>
                  <button class="text-button" type="button" onClick={() => setEditingName(true)}>
                    Edit name
                  </button>
                </Show>
              </div>
            }
          >
            <div class="session-name-editor">
              <input
                class="text-input"
                aria-label="Session name"
                value={nameDraft()}
                maxlength="200"
                onInput={(event) => queueNameChange(event.currentTarget.value)}
              />
              <button
                class="secondary-button"
                type="button"
                onClick={async () => {
                  await drainChanges()
                  setEditingName(false)
                }}
              >
                Done
              </button>
            </div>
          </Show>
          <p class="lede">{formatSchedule(session.startedAt, session.assignedDate)}</p>
        </div>
        <div class="header-actions">
          <button
            class="secondary-button"
            type="button"
            disabled={managementAction() !== null}
            onClick={duplicateSession}
          >
            {managementAction() === SESSION_MANAGEMENT_ACTION.DUPLICATE
              ? 'Duplicating…'
              : 'Duplicate session'}
          </button>
          <button
            class="secondary-button"
            type="button"
            disabled={managementAction() !== null}
            onClick={saveAsTemplate}
          >
            {managementAction() === SESSION_MANAGEMENT_ACTION.TEMPLATE
              ? 'Creating…'
              : 'Save as template'}
          </button>
          <Show when={session.status === SESSION_STATUS.PLANNED}>
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
            {session.timingMode === SESSION_TIMING_MODE.AUTO ? 'Auto-timing' : 'Manual timing'}
          </span>
        </Show>
        <Show when={session.durationMinutes !== null}>
          <span class="count-badge">{session.durationMinutes} timed minutes</span>
        </Show>
        <Show when={saving() || nameSaving()}>
          <span class="sync-state">Saving…</span>
        </Show>
      </div>
      <Show when={error()}>
        <p class="form-error session-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show when={session.status === SESSION_STATUS.PLANNED}>
        <section class="session-start-card" aria-labelledby="start-session-title">
          <div>
            <p class="eyebrow">Ready when you are</p>
            <h2 id="start-session-title">Start this session</h2>
            <p>Choose how timers should behave. Manual timing is the default.</p>
          </div>
          <div class="timing-options">
            <label classList={{ selected: timingChoice() === SESSION_TIMING_MODE.MANUAL }}>
              <input
                type="radio"
                name="timing-mode"
                value={SESSION_TIMING_MODE.MANUAL}
                checked={timingChoice() === SESSION_TIMING_MODE.MANUAL}
                onChange={() => setTimingChoice(SESSION_TIMING_MODE.MANUAL)}
              />
              <span>
                <strong>Manual timing</strong>
                <small>Use as a checklist. Start a timer only when you want one.</small>
              </span>
            </label>
            <label classList={{ selected: timingChoice() === SESSION_TIMING_MODE.AUTO }}>
              <input
                type="radio"
                name="timing-mode"
                value={SESSION_TIMING_MODE.AUTO}
                checked={timingChoice() === SESSION_TIMING_MODE.AUTO}
                onChange={() => setTimingChoice(SESSION_TIMING_MODE.AUTO)}
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

      <div class="running-session-workspace" classList={{ active: addingItem() }}>
        <div class="running-session-outline-column">
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
                    sessionActive={session.status === SESSION_STATUS.IN_PROGRESS}
                    addingItem={addingItem()}
                    timingMode={session.timingMode}
                    hasActiveItem={hasActiveItem()}
                    onAction={queueAction}
                    onRemove={removeItem}
                    onUpdateSessionNote={updateItemSessionNote}
                    onDropLibraryItem={dropLibraryItem}
                  />
                )}
              </For>
            </section>
          </Show>
          <Show when={addingItem()}>
            <div
              class="running-drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropLibraryItem(event, null)}
            >
              Drop here to add at the top level
            </div>
          </Show>

          <Show when={session.status === SESSION_STATUS.IN_PROGRESS && !addingItem()}>
            <section class="session-add-item-card">
              <button class="secondary-button" type="button" onClick={openItemPicker}>
                + Add practice item
              </button>
            </section>
          </Show>
        </div>

        <Show when={addingItem()}>
          <PracticeLibraryPanel
            class="running-library-panel"
            items={library()}
            type={libraryType()}
            onTypeChange={setLibraryType}
            onSelect={(item) => void addLibraryItem(item, null)}
            loading={libraryLoading()}
            disabled={structuralSaving()}
            dragMode="native"
            itemActionLabel="Drag"
            onItemDragStart={dragLibraryItem}
            headerAction={
              <button class="text-button" type="button" onClick={() => setAddingItem(false)}>
                Close
              </button>
            }
            helpText="Drag an item into a section or the top-level drop zone. Click an item to add it at the top level."
          />
        </Show>
      </div>

      <Show when={session.status === SESSION_STATUS.IN_PROGRESS}>
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
      <Show when={session.status === SESSION_STATUS.COMPLETED}>
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
  addingItem: boolean
  timingMode: SessionTimingMode | null
  hasActiveItem: boolean
  onAction: (itemId: string, action: SessionItemAction) => void
  onRemove: (itemId: string) => Promise<boolean>
  onUpdateSessionNote: (itemId: string, sessionNote: string) => Promise<boolean>
  onDropLibraryItem: (event: DragEvent, parentId: string | null) => void
}) {
  const isSection = props.item.type === PRACTICE_ITEM_TYPE.SECTION
  const [expanded, setExpanded] = createSignal(isSection)
  const [editingSessionNote, setEditingSessionNote] = createSignal(false)
  const [sessionNoteDraft, setSessionNoteDraft] = createSignal(props.item.sessionNote ?? '')
  const [savingSessionNote, setSavingSessionNote] = createSignal(false)
  const contentId = `session-item-${props.item.id}-content`
  const sessionNoteId = `session-item-${props.item.id}-session-note`
  let sessionNoteElement: HTMLTextAreaElement | undefined
  const status = () => (isSection ? derivedSectionStatus(props.item) : props.item.status)
  const sectionCanSkip = () => {
    const items = practiceDescendants(props.item)
    return (
      items.length > 0 &&
      items.every(
        (item) =>
          item.status === SESSION_ITEM_STATUS.NOT_STARTED ||
          item.status === SESSION_ITEM_STATUS.SKIPPED,
      )
    )
  }

  function editSessionNote() {
    setSessionNoteDraft(props.item.sessionNote ?? '')
    setEditingSessionNote(true)
  }

  async function saveSessionNote() {
    setSavingSessionNote(true)
    const saved = await props.onUpdateSessionNote(props.item.id, sessionNoteDraft())
    setSavingSessionNote(false)
    if (saved) setEditingSessionNote(false)
  }

  function recordSelectedKey(keyLabel: string) {
    const currentNote = editingSessionNote() ? sessionNoteDraft() : (props.item.sessionNote ?? '')
    const nextNote = appendKeyToSessionNote(currentNote, keyLabel)
    setSessionNoteDraft(nextNote)
    setEditingSessionNote(true)
    queueMicrotask(() => {
      sessionNoteElement?.focus()
      sessionNoteElement?.setSelectionRange(nextNote.length, nextNote.length)
    })
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
            <Show when={props.sessionActive && status() === SESSION_ITEM_STATUS.SKIPPED}>
              <button
                class="item-action item-action-reset"
                type="button"
                onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.RESET)}
              >
                Reset section
              </button>
            </Show>
            <Show
              when={
                props.sessionActive && status() !== SESSION_ITEM_STATUS.SKIPPED && sectionCanSkip()
              }
            >
              <button
                class="item-action"
                type="button"
                onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.SKIP)}
              >
                Skip section
              </button>
            </Show>
            <StatusIndicator status={status()} />
          </div>
        </div>
        <Show when={props.addingItem}>
          <div
            class="running-drop-zone running-drop-zone-section"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => props.onDropLibraryItem(event, props.item.id)}
          >
            Drop here to add to {props.item.name}
          </div>
        </Show>
        <Show when={expanded()}>
          <div id={contentId}>
            <Show when={props.item.instruction}>
              <div class="practice-instruction">
                <strong>Instruction</strong>
                <p>{props.item.instruction}</p>
              </div>
            </Show>
            <Show when={props.item.sessionNote}>
              <div class="practice-session-note">
                <strong>Session note</strong>
                <p>{props.item.sessionNote}</p>
              </div>
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
      <div class="practice-item-header">
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
        </button>
        <div class="practice-item-quick-actions">
          <Show
            when={
              props.sessionActive &&
              props.item.status === SESSION_ITEM_STATUS.NOT_STARTED &&
              props.timingMode === SESSION_TIMING_MODE.MANUAL
            }
          >
            <button
              class="item-action"
              type="button"
              disabled={props.hasActiveItem}
              onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.START)}
            >
              Start timer
            </button>
          </Show>
          <Show
            when={
              props.sessionActive &&
              (props.item.status === SESSION_ITEM_STATUS.NOT_STARTED ||
                props.item.status === SESSION_ITEM_STATUS.IN_PROGRESS)
            }
          >
            <button
              class="item-action item-action-complete"
              type="button"
              onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.COMPLETE)}
            >
              Complete
            </button>
            <button
              class="item-action"
              type="button"
              onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.SKIP)}
            >
              Skip
            </button>
          </Show>
          <Show
            when={
              props.sessionActive &&
              (props.item.status === SESSION_ITEM_STATUS.COMPLETE ||
                props.item.status === SESSION_ITEM_STATUS.SKIPPED)
            }
          >
            <button
              class="item-action item-action-reset"
              type="button"
              aria-label={`Reset ${props.item.name} to not started`}
              onClick={() => props.onAction(props.item.id, SESSION_ITEM_ACTION.RESET)}
            >
              Reset
            </button>
          </Show>
          <Show when={props.sessionActive && props.item.addedDuringSession}>
            <button
              class="item-action item-action-remove"
              type="button"
              aria-label={`Remove ${props.item.name} from this session`}
              onClick={() => void props.onRemove(props.item.id)}
            >
              Remove
            </button>
          </Show>
          <StatusIndicator status={props.item.status} />
        </div>
      </div>
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
          <Show when={props.item.instruction}>
            <div class="practice-instruction">
              <strong>Instruction</strong>
              <p>{props.item.instruction}</p>
            </div>
          </Show>
          <Show when={props.item.sessionNote && !editingSessionNote()}>
            <div class="practice-session-note">
              <strong>Session note</strong>
              <p>{props.item.sessionNote}</p>
            </div>
          </Show>
          <Show when={props.sessionActive && !editingSessionNote()}>
            <button
              class="text-button practice-note-action"
              type="button"
              onClick={editSessionNote}
            >
              {props.item.sessionNote ? 'Edit session note' : '+ Add session note'}
            </button>
          </Show>
          <Show when={props.sessionActive && editingSessionNote()}>
            <div class="running-note-editor">
              <label class="field-label" for={sessionNoteId}>
                Session note
              </label>
              <textarea
                id={sessionNoteId}
                class="text-input"
                rows="3"
                maxlength="2000"
                value={sessionNoteDraft()}
                ref={(element) => {
                  sessionNoteElement = element
                }}
                onInput={(event) => setSessionNoteDraft(event.currentTarget.value)}
              />
              <div class="running-note-actions">
                <button
                  class="secondary-button"
                  type="button"
                  disabled={savingSessionNote()}
                  onClick={() => setEditingSessionNote(false)}
                >
                  Cancel
                </button>
                <button
                  class="primary-button"
                  type="button"
                  disabled={savingSessionNote()}
                  onClick={() => void saveSessionNote()}
                >
                  {savingSessionNote() ? 'Saving…' : 'Save session note'}
                </button>
              </div>
            </div>
          </Show>
          <Show when={props.item.notation}>
            <SessionExerciseNotation
              notation={props.item.notation ?? ''}
              format={props.item.notationFormat}
              onRecordKey={props.sessionActive ? recordSelectedKey : undefined}
            />
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

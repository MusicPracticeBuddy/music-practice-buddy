import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link, createFileRoute, notFound } from '@tanstack/solid-router'
import { getSessionDetail, type SessionDetailItem } from '../../data/sessions'

type SessionItemNode = SessionDetailItem & {
  children: SessionItemNode[]
}

export const Route = createFileRoute('/sessions/$sessionId')({
  loader: async ({ params }) => {
    const session = await getSessionDetail({ data: params.sessionId })
    if (!session) throw notFound()
    return session
  },
  component: SessionDetail,
  notFoundComponent: SessionNotFound,
})

function buildItemTree(items: SessionDetailItem[]): SessionItemNode[] {
  const nodes = new Map<string, SessionItemNode>()
  const roots: SessionItemNode[] = []

  for (const item of items) {
    nodes.set(item.id, { ...item, children: [] })
  }

  for (const item of items) {
    const node = nodes.get(item.id)
    if (!node) continue

    const parent = item.parentId ? nodes.get(item.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
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

function itemState(item: SessionDetailItem) {
  if (item.endedAt) return 'Complete'
  if (item.startedAt) return 'In progress'
  return 'Remaining'
}

function descendants(item: SessionItemNode): SessionItemNode[] {
  return item.children.flatMap((child) => [child, ...descendants(child)])
}

function nodeState(item: SessionItemNode): ReturnType<typeof itemState> {
  if (item.type !== 'SECTION') return itemState(item)

  const practiceItems = descendants(item).filter((child) => child.type !== 'SECTION')
  if (practiceItems.length > 0 && practiceItems.every((child) => child.endedAt)) return 'Complete'
  if (practiceItems.some((child) => child.startedAt || child.endedAt)) return 'In progress'
  return 'Remaining'
}

function StatusIndicator(props: { state: ReturnType<typeof itemState> }) {
  const className = () => props.state.toLowerCase().replace(' ', '-')

  return (
    <span
      class={`item-state item-state-${className()}`}
      aria-label={props.state}
      title={props.state}
    >
      {props.state === 'Complete' ? '✓' : props.state === 'In progress' ? '◐' : '○'}
    </span>
  )
}

function SessionDetail() {
  const session = Route.useLoaderData()
  const itemTree = createMemo(() => buildItemTree(session().items))
  const practiceItems = createMemo(() => session().items.filter((item) => item.type !== 'SECTION'))
  const completeCount = createMemo(
    () => practiceItems().filter((item) => item.endedAt !== null).length,
  )
  const progress = createMemo(() => {
    const total = practiceItems().length
    return total === 0 ? 0 : Math.round((completeCount() / total) * 100)
  })

  return (
    <main class="page session-detail-page">
      <Link class="back-link" to="/sessions">
        ← All sessions
      </Link>

      <header class="session-detail-header">
        <div>
          <p class="eyebrow">Session #{session().id}</p>
          <h1>{session().templateName}</h1>
          <p class="lede">{formatDate(session().startedAt ?? session().assignedAt)}</p>
        </div>
        <span class={`status status-${session().status.toLowerCase()}`}>
          {session().status.replace('_', ' ')}
        </span>
      </header>

      <div class="meta-row">
        <span class="count-badge">{practiceItems().length} practice items</span>
        <Show when={session().durationMinutes !== null}>
          <span class="count-badge">{session().durationMinutes} minutes</span>
        </Show>
      </div>

      <section class="progress-card" aria-label="Session progress">
        <div class="progress-topline">
          <strong>Session progress</strong>
          <span>
            {completeCount()} complete · {practiceItems().length - completeCount()} remaining
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
          <For each={itemTree()}>{(item) => <SessionItem item={item} />}</For>
        </section>
      </Show>
    </main>
  )
}

function SessionItem(props: { item: SessionItemNode }) {
  const isSection = props.item.type === 'SECTION'
  const [expanded, setExpanded] = createSignal(isSection)
  const contentId = `session-item-${props.item.id}-content`

  if (props.item.type === 'SECTION') {
    return (
      <section class="practice-section">
        <button
          type="button"
          class="practice-section-header"
          aria-expanded={expanded()}
          aria-controls={contentId}
          onClick={() => setExpanded((value) => !value)}
        >
          <div>
            <span class="disclosure-icon" aria-hidden="true">
              {expanded() ? '⌄' : '›'}
            </span>
            <h2>{props.item.name}</h2>
          </div>
          <div class="disclosure-status">
            <Show when={expanded()}>
              <span>{props.item.children.length} items</span>
            </Show>
            <StatusIndicator state={nodeState(props.item)} />
          </div>
        </button>
        <Show when={expanded()}>
          <div id={contentId}>
            <Show when={props.item.notes}>
              <p class="practice-notes">{props.item.notes}</p>
            </Show>
            <div class="practice-items">
              <For each={props.item.children}>{(child) => <SessionItem item={child} />}</For>
            </div>
          </div>
        </Show>
      </section>
    )
  }

  return (
    <article class="practice-item">
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
        <StatusIndicator state={itemState(props.item)} />
      </button>
      <Show when={expanded()}>
        <div id={contentId} class="practice-item-details">
          <div>
            <div class="practice-item-heading">
              <span class="item-type">{props.item.type.toLowerCase()}</span>
              <span class="item-timing">
                {props.item.durationMinutes !== null
                  ? `${props.item.durationMinutes} min`
                  : itemState(props.item)}
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
          </div>
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

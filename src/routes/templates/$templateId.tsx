import { For, Show } from 'solid-js'
import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import {
  deleteSessionTemplate,
  getSessionTemplate,
  type SessionTemplateDetail,
  type TemplateItemInput,
} from '@/data/sessionTemplates'
import { PRACTICE_ITEM_TYPE } from '@/domain/session'

export const Route = createFileRoute('/templates/$templateId')({
  loader: async ({ params }) => {
    const template = await getSessionTemplate({ data: params.templateId })
    if (!template) throw notFound()
    return template
  },
  component: TemplateDetail,
  notFoundComponent: () => (
    <main class="page empty-state">
      <h1>Template not found</h1>
      <p>The requested session template does not exist.</p>
    </main>
  ),
})

type TemplateNode = TemplateItemInput & { children: TemplateNode[] }

function buildTree(template: SessionTemplateDetail): TemplateNode[] {
  const nodes = new Map<string, TemplateNode>()
  const roots: TemplateNode[] = []
  for (const item of template.items) nodes.set(item.clientId, { ...item, children: [] })
  for (const item of template.items) {
    const node = nodes.get(item.clientId)
    if (!node) continue
    const parent = item.parentClientId ? nodes.get(item.parentClientId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function TemplateDetail() {
  const template = Route.useLoaderData()
  const navigate = useNavigate()
  const tree = () => buildTree(template())
  const practiceItemCount = () =>
    template().items.filter((item) => item.type !== PRACTICE_ITEM_TYPE.SECTION).length

  return (
    <main class="page session-detail-page">
      <Link class="back-link" to="/templates">
        ← All templates
      </Link>
      <header class="session-detail-header">
        <div>
          <p class="eyebrow">Session template</p>
          <h1>{template().name}</h1>
          <p class="lede">
            {practiceItemCount()} practice {practiceItemCount() === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div class="header-actions">
          <Link
            class="secondary-button"
            to="/templates/$templateId/edit"
            params={{ templateId: template().id }}
          >
            Edit template
          </Link>
          <Link class="primary-button" to="/sessions/new" search={{ template: template().id }}>
            Use template
          </Link>
          <DeleteConfirmationDialog
            triggerLabel="Delete template"
            title="Delete this template?"
            itemName={template().name}
            description="This permanently deletes the template. Existing sessions created from it will remain."
            confirmLabel="Delete template"
            onConfirm={async () => {
              await deleteSessionTemplate({ data: template().id })
              await navigate({ to: '/templates' })
            }}
          />
        </div>
      </header>

      <Show
        when={tree().length > 0}
        fallback={
          <section class="empty-state">
            <h2>Empty template</h2>
            <p>This template does not contain any sections or practice items.</p>
          </section>
        }
      >
        <section class="session-outline" aria-label="Template contents">
          <For each={tree()}>{(item) => <TemplateOutlineItem item={item} />}</For>
        </section>
      </Show>
    </main>
  )
}

function TemplateOutlineItem(props: { item: TemplateNode }) {
  if (props.item.type === PRACTICE_ITEM_TYPE.SECTION) {
    return (
      <section class="practice-section">
        <div class="practice-section-header template-section-header">
          <div>
            <h2>{props.item.name}</h2>
          </div>
          <span>{props.item.children.length} items</span>
        </div>
        <Show when={props.item.notes}>
          <p class="practice-notes">{props.item.notes}</p>
        </Show>
        <div class="practice-items">
          <For each={props.item.children}>{(child) => <TemplateOutlineItem item={child} />}</For>
        </div>
      </section>
    )
  }

  return (
    <article class="practice-item template-outline-item">
      <div class="practice-item-toggle">
        <div>
          <h3>{props.item.name}</h3>
          <Show when={props.item.notes}>
            <p class="practice-notes">{props.item.notes}</p>
          </Show>
        </div>
        <span class="item-type">{props.item.type.toLowerCase()}</span>
      </div>
    </article>
  )
}

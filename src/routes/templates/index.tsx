import { For, Show, createSignal } from 'solid-js'
import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '../../components/DeleteConfirmationDialog'
import { SwipeToDelete } from '../../components/SwipeToDelete'
import {
  deleteSessionTemplate,
  getSessionTemplates,
  type SessionTemplateSummary,
} from '../../data/sessionTemplates'

export const Route = createFileRoute('/templates/')({
  loader: () => getSessionTemplates(),
  component: Templates,
})

function Templates() {
  const templates = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Reusable plans</p>
          <h1>Templates</h1>
        </div>
        <Link class="primary-button" to="/templates/new">
          Create template
        </Link>
      </header>

      <Show
        when={templates().length > 0}
        fallback={
          <section class="empty-state">
            <h2>No templates yet</h2>
            <p>Build a reusable outline, then use it to create practice sessions.</p>
            <Link class="text-link" to="/templates/new">
              Create your first template
            </Link>
          </section>
        }
      >
        <section class="list-stack">
          <For each={templates()}>{(template) => <TemplateListItem template={template} />}</For>
        </section>
      </Show>
    </main>
  )
}

function TemplateListItem(props: { template: SessionTemplateSummary }) {
  const router = useRouter()
  const [deleteOpen, setDeleteOpen] = createSignal(false)

  return (
    <SwipeToDelete onDeleteRequest={() => setDeleteOpen(true)}>
      <article class="template-list-row">
        <div>
          <h2>
            <Link
              to="/templates/$templateId"
              params={{ templateId: props.template.id }}
              draggable={false}
            >
              {props.template.name}
            </Link>
          </h2>
          <p>
            {props.template.itemCount} practice {props.template.itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div class="header-actions">
          <Link
            class="secondary-button"
            to="/templates/$templateId/edit"
            params={{ templateId: props.template.id }}
            draggable={false}
          >
            Edit
          </Link>
          <Link
            class="secondary-button"
            to="/sessions/new"
            search={{ template: props.template.id }}
            draggable={false}
          >
            Use template
          </Link>
          <DeleteConfirmationDialog
            triggerLabel="Delete"
            title="Delete this template?"
            itemName={props.template.name}
            description="This permanently deletes the template. Existing sessions created from it will remain."
            confirmLabel="Delete template"
            open={deleteOpen()}
            onOpenChange={setDeleteOpen}
            onConfirm={async () => {
              await deleteSessionTemplate({ data: props.template.id })
              await router.invalidate()
            }}
          />
        </div>
      </article>
    </SwipeToDelete>
  )
}

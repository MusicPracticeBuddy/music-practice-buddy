import { For, Show, createEffect, createSignal } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import { SwipeToDelete } from '@/components/SwipeToDelete'
import { InstrumentFilter } from '@/components/InstrumentFields'
import {
  deleteSessionTemplate,
  EMPTY_SESSION_TEMPLATE_SEARCH,
  getSessionTemplatesPage,
  type SessionTemplateSummary,
} from '@/data/sessionTemplates'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/templates/')({
  loader: async () => {
    const [page, instruments] = await Promise.all([
      getSessionTemplatesPage({ data: EMPTY_SESSION_TEMPLATE_SEARCH }),
      getInstruments(),
    ])
    return { page, instruments }
  },
  component: Templates,
})

function Templates() {
  const initialPage = Route.useLoaderData()
  const [templates, setTemplates] = createSignal(initialPage().page)
  const [instrumentIds, setInstrumentIds] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')

  createEffect(() => {
    const refreshedPage = initialPage().page
    if (instrumentIds().length === 0) setTemplates(refreshedPage)
  })

  async function loadPage(page: number) {
    setLoading(true)
    setError('')
    try {
      let result = await getSessionTemplatesPage({ data: { instrumentIds: instrumentIds(), page } })
      const lastPage = Math.max(1, result.totalPages)
      if (result.page > lastPage) {
        result = await getSessionTemplatesPage({
          data: { instrumentIds: instrumentIds(), page: lastPage },
        })
      }
      setTemplates(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Templates could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

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

      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>

      <div class="library-filter-bar" role="search" aria-label="Filter templates">
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

      <Show
        when={templates().items.length > 0}
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
        <section
          class="list-stack"
          classList={{ 'catalog-results-loading': loading() }}
          aria-live="polite"
          aria-busy={loading()}
        >
          <For each={templates().items}>
            {(template) => (
              <TemplateListItem
                template={template}
                onDelete={async () => {
                  await deleteSessionTemplate({ data: template.id })
                  await loadPage(templates().page)
                }}
              />
            )}
          </For>
        </section>
      </Show>

      <Show when={templates().totalPages > 1}>
        <nav class="catalog-pagination" aria-label="Template pages">
          <button
            class="secondary-button"
            type="button"
            disabled={loading() || templates().page === 1}
            onClick={() => void loadPage(templates().page - 1)}
          >
            Previous
          </button>
          <span>
            Page {templates().page} of {templates().totalPages}
          </span>
          <button
            class="secondary-button"
            type="button"
            disabled={loading() || templates().page === templates().totalPages}
            onClick={() => void loadPage(templates().page + 1)}
          >
            Next
          </button>
        </nav>
      </Show>
    </main>
  )
}

function TemplateListItem(props: {
  template: SessionTemplateSummary
  onDelete: () => Promise<void>
}) {
  const [deleteOpen, setDeleteOpen] = createSignal(false)

  return (
    <SwipeToDelete onDeleteRequest={() => props.template.canManage && setDeleteOpen(true)}>
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
            {' · '}
            {props.template.visibility.toLowerCase()}
            <Show when={props.template.instrumentName}>
              {' · '}
              {props.template.instrumentName}
            </Show>
          </p>
        </div>
        <div class="header-actions">
          <Show when={props.template.canEdit}>
            <Link
              class="secondary-button"
              to="/templates/$templateId/edit"
              params={{ templateId: props.template.id }}
              draggable={false}
            >
              Edit
            </Link>
          </Show>
          <Link
            class="secondary-button"
            to="/sessions/new"
            search={{ template: props.template.id }}
            draggable={false}
          >
            Use template
          </Link>
          <Show when={props.template.canManage}>
            <DeleteConfirmationDialog
              triggerLabel="Delete"
              title="Delete this template?"
              itemName={props.template.name}
              description="This permanently deletes the template. Existing sessions created from it will remain."
              confirmLabel="Delete template"
              open={deleteOpen()}
              onOpenChange={setDeleteOpen}
              onConfirm={props.onDelete}
            />
          </Show>
        </div>
      </article>
    </SwipeToDelete>
  )
}

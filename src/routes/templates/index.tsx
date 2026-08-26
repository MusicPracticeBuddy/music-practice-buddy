import { For, Show } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { getSessionTemplates } from '../../data/sessionTemplates'

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
          <For each={templates()}>
            {(template) => (
              <article class="template-list-row">
                <div>
                  <h2>
                    <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                      {template.name}
                    </Link>
                  </h2>
                  <p>
                    {template.itemCount} practice {template.itemCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
                <div class="header-actions">
                  <Link
                    class="secondary-button"
                    to="/templates/$templateId/edit"
                    params={{ templateId: template.id }}
                  >
                    Edit
                  </Link>
                  <Link
                    class="secondary-button"
                    to="/sessions/new"
                    search={{ template: template.id }}
                  >
                    Use template
                  </Link>
                </div>
              </article>
            )}
          </For>
        </section>
      </Show>
    </main>
  )
}

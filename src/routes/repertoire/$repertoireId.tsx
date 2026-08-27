import { For, Show } from 'solid-js'
import { Link, createFileRoute, notFound, useNavigate } from '@tanstack/solid-router'
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog'
import { RepertoireLibraryNote } from '@/components/RepertoireLibraryNote'
import { deleteRepertoire, getRepertoireDetail } from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/$repertoireId')({
  loader: async ({ params }) => {
    const repertoire = await getRepertoireDetail({ data: params.repertoireId })
    if (!repertoire) throw notFound()
    return repertoire
  },
  component: RepertoireDetail,
  notFoundComponent: RepertoireNotFound,
})

function formatDate(value: string | null) {
  if (!value) return 'Not started'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function RepertoireDetail() {
  const repertoire = Route.useLoaderData()
  const navigate = useNavigate()

  return (
    <main class="page detail-page">
      <Link class="back-link" to="/library">
        ← My Library
      </Link>

      <header class="record-header">
        <div>
          <p class="eyebrow">Repertoire #{repertoire().id}</p>
          <h1>{repertoire().title}</h1>
          <p class="lede">
            {repertoire()
              .credits.map((credit) => credit.person)
              .join(', ') || 'Unknown composer'}
            <Show when={repertoire().compositionYear !== null}>
              {' '}
              · {repertoire().compositionYear}
            </Show>
          </p>
        </div>
        <div class="record-statuses">
          <span class="tag">{repertoire().visibility.toLowerCase()}</span>
          <span class="tag">{repertoire().status.toLowerCase()}</span>
          <Show when={repertoire().canManage && !repertoire().parent}>
            <Link
              class="secondary-button"
              to="/repertoire/$repertoireId/edit"
              params={{ repertoireId: repertoire().id }}
            >
              Edit repertoire
            </Link>
            <DeleteConfirmationDialog
              triggerLabel="Delete repertoire"
              title="Delete this repertoire?"
              itemName={repertoire().title}
              description="This removes the repertoire from your library. Historical session entries will remain."
              confirmLabel="Delete repertoire"
              onConfirm={async () => {
                await deleteRepertoire({ data: repertoire().id })
                await navigate({ to: '/library' })
              }}
            />
          </Show>
        </div>
      </header>

      <Show when={repertoire().parent}>
        {(parent) => (
          <p class="parent-record">
            Excerpt from{' '}
            <Link to="/repertoire/$repertoireId" params={{ repertoireId: parent().id }}>
              {parent().title}
            </Link>
            <Show when={repertoire().startMeasure !== null}>
              {' '}
              · Measures {repertoire().startMeasure}
              {repertoire().endMeasure !== null && `–${repertoire().endMeasure}`}
            </Show>
          </p>
        )}
      </Show>

      <section class="detail-grid">
        <article class="detail-card">
          <p class="eyebrow">Credits</p>
          <Show
            when={repertoire().credits.length > 0}
            fallback={<p class="muted">No credits recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().credits}>
                {(credit) => (
                  <li>
                    <Show when={credit.biographyLink} fallback={<strong>{credit.person}</strong>}>
                      {(url) => (
                        <a href={url()} target="_blank" rel="noreferrer">
                          <strong>{credit.person}</strong>
                        </a>
                      )}
                    </Show>
                    <span>{credit.role.toLowerCase()}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <article class="detail-card">
          <p class="eyebrow">Instrumentation</p>
          <Show
            when={repertoire().instruments.length > 0}
            fallback={<p class="muted">No instruments recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().instruments}>
                {(instrument) => (
                  <li>
                    <strong>{instrument.name}</strong>
                    <span>
                      {instrument.partName ?? instrument.role.toLowerCase()} ·{' '}
                      {instrument.family.toLowerCase()}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <Show when={repertoire().libraryEntries.length > 0}>
          <article class="detail-card detail-card-wide">
            <p class="eyebrow">Your library</p>
            <For each={repertoire().libraryEntries}>
              {(entry) => (
                <div>
                  <Show when={entry.acquiredOn}>
                    <small>Acquired {entry.acquiredOn}</small>
                  </Show>
                  <RepertoireLibraryNote
                    repertoireId={repertoire().id}
                    repertoireTitle={repertoire().title}
                    initialNote={entry.notes}
                  />
                </div>
              )}
            </For>
          </article>
        </Show>

        <Show when={repertoire().excerpts.length > 0}>
          <article class="detail-card">
            <p class="eyebrow">Excerpts</p>
            <ul class="detail-list">
              <For each={repertoire().excerpts}>
                {(excerpt) => (
                  <li>
                    <Link to="/repertoire/$repertoireId" params={{ repertoireId: excerpt.id }}>
                      <strong>{excerpt.title}</strong>
                      <span>
                        Measures {excerpt.startMeasure ?? '?'}–{excerpt.endMeasure ?? '?'}
                      </span>
                    </Link>
                  </li>
                )}
              </For>
            </ul>
          </article>
        </Show>

        <article class="detail-card">
          <p class="eyebrow">Resources</p>
          <Show
            when={repertoire().resources.length > 0}
            fallback={<p class="muted">No resources recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().resources}>
                {(resource) => (
                  <li>
                    <a href={resource.url} target="_blank" rel="noreferrer">
                      <strong>{resource.type.toLowerCase()} ↗</strong>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <article class="detail-card detail-card-wide">
          <p class="eyebrow">Practice history</p>
          <Show
            when={repertoire().sessions.length > 0}
            fallback={<p class="muted">This repertoire has not appeared in a session.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().sessions}>
                {(session) => (
                  <li>
                    <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
                      <strong>{session.templateName}</strong>
                      <span>
                        {formatDate(session.startedAt)} · {session.status.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>
      </section>
    </main>
  )
}

function RepertoireNotFound() {
  return (
    <main class="page empty-state">
      <h1>Repertoire not found</h1>
      <p>The requested repertoire entry does not exist.</p>
      <Link class="text-link" to="/library">
        Return to My Library
      </Link>
    </main>
  )
}

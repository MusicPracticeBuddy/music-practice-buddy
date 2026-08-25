import { For } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { getRepertoire } from '../../data/repertoire'

export const Route = createFileRoute('/repertoire/')({
  loader: () => getRepertoire(),
  component: Repertoire,
})

function Repertoire() {
  const pieces = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Music library</p>
          <h1>Repertoire</h1>
        </div>
        <span class="count-badge">{pieces().length} entries</span>
      </header>

      <section class="card-grid">
        <For each={pieces()}>
          {(piece) => (
            <article class="content-card">
              <div class="card-topline">
                <span class="tag">{piece.instrument ?? 'Unscored'}</span>
                <span>{piece.visibility.toLowerCase()}</span>
              </div>
              <h2>
                <Link to="/repertoire/$repertoireId" params={{ repertoireId: piece.id }}>
                  {piece.title}
                </Link>
              </h2>
              <p class="muted">{piece.composer}</p>
              {piece.parentTitle && <p class="detail">From {piece.parentTitle}</p>}
              {piece.measureRange && <p class="detail">{piece.measureRange}</p>}
              {piece.libraryNotes && <p class="note">{piece.libraryNotes}</p>}
              <Link
                class="text-link"
                to="/repertoire/$repertoireId"
                params={{ repertoireId: piece.id }}
              >
                View details →
              </Link>
            </article>
          )}
        </For>
      </section>
    </main>
  )
}

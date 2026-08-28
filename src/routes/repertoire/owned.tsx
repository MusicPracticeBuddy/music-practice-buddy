import { For, Show, createSignal } from 'solid-js'
import { Link, createFileRoute, useRouter } from '@tanstack/solid-router'
import {
  addRepertoireToLibrary,
  getOwnedRepertoirePage,
  type OwnedRepertoireRow,
} from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/owned')({
  loader: () => getOwnedRepertoirePage({ data: 1 }),
  component: OwnedRepertoire,
})

function OwnedRepertoire() {
  const initialPage = Route.useLoaderData()
  const router = useRouter()
  const [results, setResults] = createSignal(initialPage())
  const [loading, setLoading] = createSignal(false)
  const [addingId, setAddingId] = createSignal<string | null>(null)
  const [addedIds, setAddedIds] = createSignal<string[]>([])
  const [error, setError] = createSignal('')

  async function loadPage(page: number) {
    setLoading(true)
    setError('')
    try {
      setResults(await getOwnedRepertoirePage({ data: page }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Owned repertoire could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function addToLibrary(item: OwnedRepertoireRow) {
    setAddingId(item.id)
    setError('')
    try {
      await addRepertoireToLibrary({ data: item.id })
      setAddedIds((ids) => [...ids, item.id])
      await router.invalidate({ sync: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The repertoire could not be added.')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <main class="page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Repertoire management</p>
          <h1>Owned by me</h1>
          <p class="lede">Manage repertoire you created, whether or not it is in My Library.</p>
        </div>
        <div class="library-section-actions">
          <Link class="secondary-button" to="/library">
            My Library
          </Link>
          <Link class="primary-button" to="/repertoire/search">
            Find repertoire
          </Link>
        </div>
      </header>

      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>

      <section aria-live="polite" aria-busy={loading()}>
        <header class="library-section-header">
          <div>
            <p class="eyebrow">Created repertoire</p>
            <h2>{results().total} works</h2>
          </div>
        </header>
        <div class="card-grid" classList={{ 'catalog-results-loading': loading() }}>
          <For each={results().items} fallback={<p class="library-empty">No owned repertoire.</p>}>
            {(item) => {
              const inLibrary = () => item.inLibrary || addedIds().includes(item.id)
              return (
                <article class="content-card">
                  <div class="card-topline">
                    <span class="tag">{item.visibility.toLowerCase()}</span>
                    <span>{item.status.toLowerCase()}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p class="muted">{item.composer}</p>
                  <div class="library-section-actions">
                    <button
                      class={inLibrary() ? 'secondary-button' : 'primary-button'}
                      type="button"
                      disabled={inLibrary() || addingId() === item.id}
                      onClick={() => void addToLibrary(item)}
                    >
                      {inLibrary()
                        ? 'In My Library'
                        : addingId() === item.id
                          ? 'Adding…'
                          : '+ Add to Library'}
                    </button>
                    <Link
                      class="secondary-button"
                      to="/repertoire/$repertoireId/edit"
                      params={{ repertoireId: item.id }}
                    >
                      Edit
                    </Link>
                  </div>
                </article>
              )
            }}
          </For>
        </div>

        <Show when={results().totalPages > 1}>
          <nav class="catalog-pagination" aria-label="Owned repertoire pages">
            <button
              class="secondary-button"
              type="button"
              disabled={loading() || results().page === 1}
              onClick={() => void loadPage(results().page - 1)}
            >
              Previous
            </button>
            <span>
              Page {results().page} of {results().totalPages}
            </span>
            <button
              class="secondary-button"
              type="button"
              disabled={loading() || results().page === results().totalPages}
              onClick={() => void loadPage(results().page + 1)}
            >
              Next
            </button>
          </nav>
        </Show>
      </section>
    </main>
  )
}

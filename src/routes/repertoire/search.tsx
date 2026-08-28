import { Show, createSignal } from 'solid-js'
import { Link, createFileRoute } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { RepertoireCatalogSearch } from '@/components/RepertoireCatalogSearch'
import {
  EMPTY_CATALOG_SEARCH,
  getCatalogComposers,
  getInstruments,
  getPublicRepertoireCatalogPage,
} from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/search')({
  loader: async () => {
    const [catalog, composers, instruments] = await Promise.all([
      getPublicRepertoireCatalogPage({ data: EMPTY_CATALOG_SEARCH }),
      getCatalogComposers(),
      getInstruments(),
    ])
    return { catalog, composers, instruments }
  },
  component: SearchRepertoire,
})

function SearchRepertoire() {
  const data = Route.useLoaderData()
  const [creating, setCreating] = createSignal(false)

  return (
    <main class={`page ${creating() ? 'form-page repertoire-form-page' : ''}`}>
      <header class="page-header catalog-page-header">
        <div>
          <p class="eyebrow">My Library</p>
          <h1>{creating() ? 'Create repertoire' : 'Find repertoire'}</h1>
          <p class="lede">
            {creating()
              ? 'Add a work that is not yet available in the public catalog.'
              : 'Search the public catalog, then add existing works to your library.'}
          </p>
        </div>
        <Show
          when={!creating()}
          fallback={
            <button class="secondary-button" type="button" onClick={() => setCreating(false)}>
              Back to catalog
            </button>
          }
        >
          <Link class="secondary-button" to="/library">
            Cancel
          </Link>
        </Show>
      </header>

      <Show
        when={!creating()}
        fallback={
          <LibraryItemForm
            kind="repertoire"
            instrumentOptions={data().instruments}
            embedded
            cancelAction={
              <button class="secondary-button" type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
            }
          />
        }
      >
        <RepertoireCatalogSearch
          initialPage={data().catalog}
          composers={data().composers}
          instruments={data().instruments}
        />
        <div class="catalog-create-fallback">
          <div>
            <h2>Create a catalog entry</h2>
            <p>Create a new repertoire item and choose whether to share it publicly.</p>
          </div>
          <button class="secondary-button" type="button" onClick={() => setCreating(true)}>
            Can’t find what you need?
          </button>
        </div>
      </Show>
    </main>
  )
}

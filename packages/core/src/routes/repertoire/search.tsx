import { Show, createSignal } from 'solid-js';
import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router';
import { LibraryItemForm } from '@/components/LibraryItemForm';
import {
  RepertoireCatalogSearch,
  repertoireCatalogQueryOptions,
  type RepertoireCatalogSearchState,
} from '@/components/RepertoireCatalogSearch';
import { getInstruments } from '@/data/repertoire';
import { getMusicianInstrumentIds } from '@/data/preferences';

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalYear(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= -9999 && number <= 9999 ? number : null;
}

function positivePage(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

export type RepertoireCatalogUrlSearch = Omit<RepertoireCatalogSearchState, 'instrumentIds'> & {
  instrumentIds?: string[];
};

export const Route = createFileRoute('/repertoire/search')({
  validateSearch: (search: Record<string, unknown>): RepertoireCatalogUrlSearch => ({
    query: optionalString(search.query),
    composer: optionalString(search.composer),
    instrumentIds: Array.isArray(search.instrumentIds)
      ? search.instrumentIds.filter((id): id is string => typeof id === 'string')
      : typeof search.instrumentIds === 'string'
        ? [search.instrumentIds]
        : undefined,
    instrumentMatch: search.instrumentMatch === 'ALL' ? 'ALL' : 'ANY',
    yearFrom: optionalYear(search.yearFrom),
    yearTo: optionalYear(search.yearTo),
    page: positivePage(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, context }) => {
    const [instruments, instrumentIds] = await Promise.all([
      getInstruments(),
      getMusicianInstrumentIds(),
    ]);
    const catalogSearch = { ...deps, instrumentIds: deps.instrumentIds ?? instrumentIds };
    const catalog = await context.queryClient.query(repertoireCatalogQueryOptions(catalogSearch));
    return { catalog, catalogSearch, instruments, instrumentIds };
  },
  component: SearchRepertoire,
});

function SearchRepertoire() {
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: '/repertoire/search' });
  const context = Route.useRouteContext();
  const [creating, setCreating] = createSignal(false);

  return (
    <main class={`page ${creating() ? 'form-page repertoire-form-page' : ''}`}>
      <header class="page-header catalog-page-header">
        <div>
          <p class="eyebrow">My Library</p>
          <h1>{creating() ? 'Create repertoire' : 'Find repertoire'}</h1>
          <p class="lede">
            {creating()
              ? 'Add a work that is not yet available in the public catalog.'
              : 'Find public repertoire to add to your library.'}
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
            Return to My Library
          </Link>
        </Show>
      </header>

      <Show
        when={!creating()}
        fallback={
          <LibraryItemForm
            kind="repertoire"
            instrumentOptions={data().instruments}
            canCreatePublic={context().user?.isAdmin}
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
          instruments={data().instruments}
          search={data().catalogSearch}
          onSearchChange={(search, replace) =>
            navigate({
              search,
              replace,
            })
          }
        />
        <div class="catalog-create-fallback">
          <div>
            <h2>Can’t find what you need?</h2>
          </div>
          <button class="secondary-button" type="button" onClick={() => setCreating(true)}>
            Create a new repertoire item.
          </button>
        </div>
      </Show>
    </main>
  );
}

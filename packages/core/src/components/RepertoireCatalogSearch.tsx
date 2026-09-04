import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { useRouter } from '@tanstack/solid-router';
import { InstrumentFilter } from '@/components/InstrumentFields';
import { RepertoireListRow } from '@/components/RepertoireListRow';
import {
  addRepertoireToLibrary,
  removeRepertoireFromLibrary,
  searchComposerNames,
  type ComposerNameSuggestion,
  type CatalogRepertoireRow,
  type CatalogSearchInput,
  type CatalogSearchPage,
  type InstrumentOption,
  getPublicRepertoireCatalogPage,
} from '@/data/repertoire';

export type RepertoireCatalogSearchState = CatalogSearchInput;

export function repertoireCatalogQueryOptions(search: RepertoireCatalogSearchState) {
  return queryOptions({
    queryKey: ['repertoire', 'catalog', search] as const,
    queryFn: () => getPublicRepertoireCatalogPage({ data: search }),
    staleTime: 30_000,
  });
}

function updateLibraryState(
  items: CatalogRepertoireRow[],
  id: string,
  inLibrary: boolean,
): CatalogRepertoireRow[] {
  return items.map((item) => ({
    ...item,
    inLibrary: item.id === id ? inLibrary : item.inLibrary,
    children: updateLibraryState(item.children, id, inLibrary),
  }));
}

export function RepertoireCatalogSearch(props: {
  initialPage: CatalogSearchPage;
  instruments: InstrumentOption[];
  search: RepertoireCatalogSearchState;
  onSearchChange: (search: RepertoireCatalogSearchState, replace?: boolean) => void | Promise<void>;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = createSignal(props.search.query);
  const [composerQuery, setComposerQuery] = createSignal(props.search.composer);
  const [composerSuggestions, setComposerSuggestions] = createSignal<ComposerNameSuggestion[]>([]);
  const [acceptedComposerName, setAcceptedComposerName] = createSignal('');
  const [yearFrom, setYearFrom] = createSignal(props.search.yearFrom?.toString() ?? '');
  const [yearTo, setYearTo] = createSignal(props.search.yearTo?.toString() ?? '');
  const [expandedIds, setExpandedIds] = createSignal<string[]>([]);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let composerSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let composerRequestId = 0;

  const catalogQuery = useQuery(() => ({
    ...repertoireCatalogQueryOptions(props.search),
    initialData: props.initialPage,
  }));
  const results = () => catalogQuery.data ?? props.initialPage;

  createEffect(() => {
    setQuery(props.search.query);
    setComposerQuery(props.search.composer);
    setYearFrom(props.search.yearFrom?.toString() ?? '');
    setYearTo(props.search.yearTo?.toString() ?? '');
  });

  function searchInput(page: number): RepertoireCatalogSearchState {
    return {
      query: query(),
      composer: composerQuery(),
      instrumentIds: props.search.instrumentIds,
      instrumentMatch: props.search.instrumentMatch,
      yearFrom: yearFrom() === '' ? null : Number(yearFrom()),
      yearTo: yearTo() === '' ? null : Number(yearTo()),
      page,
    };
  }

  function loadPage(page: number, replace = false) {
    clearTimeout(searchTimer);
    void props.onSearchChange(searchInput(page), replace);
  }

  function queueSearch(delay = 0) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPage(1, true), delay);
  }

  function queueComposerLookup(composerName: string) {
    clearTimeout(composerSearchTimer);
    const request = ++composerRequestId;
    const normalizedQuery = composerName.trim().toLocaleLowerCase();
    if (acceptedComposerName().toLocaleLowerCase() === normalizedQuery) {
      setComposerSuggestions([]);
      return;
    }
    if (
      normalizedQuery &&
      composerSuggestions().some(
        (suggestion) => suggestion.name.toLocaleLowerCase() === normalizedQuery,
      )
    ) {
      setAcceptedComposerName(composerName.trim());
      setComposerSuggestions([]);
      return;
    }
    setAcceptedComposerName('');
    if (normalizedQuery.length < 2) {
      setComposerSuggestions([]);
      return;
    }
    composerSearchTimer = setTimeout(async () => {
      try {
        const suggestions = await searchComposerNames({ data: composerName });
        if (request === composerRequestId) setComposerSuggestions(suggestions);
      } catch {
        if (request === composerRequestId) setComposerSuggestions([]);
      }
    }, 200);
  }

  onCleanup(() => {
    clearTimeout(searchTimer);
    clearTimeout(composerSearchTimer);
  });

  function clearFilters() {
    setQuery('');
    setComposerQuery('');
    setComposerSuggestions([]);
    setAcceptedComposerName('');
    setYearFrom('');
    setYearTo('');
    void props.onSearchChange(
      {
        query: '',
        composer: '',
        instrumentIds: [],
        instrumentMatch: 'ANY',
        yearFrom: null,
        yearTo: null,
        page: 1,
      },
      true,
    );
  }

  const libraryMutation = useMutation(() => ({
    mutationFn: async (input: { item: CatalogRepertoireRow; inLibrary: boolean }) => {
      if (input.inLibrary) await addRepertoireToLibrary({ data: input.item.id });
      else await removeRepertoireFromLibrary({ data: input.item.id });
      return input;
    },
    onSuccess: async ({ item, inLibrary }) => {
      queryClient.setQueryData<CatalogSearchPage>(
        repertoireCatalogQueryOptions(props.search).queryKey,
        (page) =>
          page ? { ...page, items: updateLibraryState(page.items, item.id, inLibrary) } : page,
      );
      await router.invalidate({ sync: true });
    },
  }));

  const addingId = () => (libraryMutation.isPending ? libraryMutation.variables?.item.id : null);
  const mutationError = () =>
    libraryMutation.error instanceof Error
      ? libraryMutation.error.message
      : libraryMutation.isError
        ? 'The repertoire library could not be updated.'
        : '';

  async function addToLibrary(item: CatalogRepertoireRow) {
    await libraryMutation.mutateAsync({ item, inLibrary: true });
  }

  async function removeFromLibrary(item: CatalogRepertoireRow) {
    await libraryMutation.mutateAsync({ item, inLibrary: false });
  }

  return (
    <div class="catalog-search-layout">
      <aside class="catalog-filters" aria-label="Catalog filters">
        <label class="field-label" for="catalog-title-search">
          Search catalog
        </label>
        <input
          id="catalog-title-search"
          class="text-input"
          type="search"
          value={query()}
          placeholder="Title or composer…"
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            queueSearch(300);
          }}
        />

        <label class="field-label" for="catalog-composer-search">
          Composer
        </label>
        <input
          id="catalog-composer-search"
          class="text-input"
          type="search"
          list="catalog-composer-options"
          value={composerQuery()}
          placeholder="Search composers…"
          onFocus={() => queueComposerLookup(composerQuery())}
          onInput={(event) => {
            setComposerQuery(event.currentTarget.value);
            queueComposerLookup(event.currentTarget.value);
            queueSearch(300);
          }}
        />
        <datalist id="catalog-composer-options">
          <For each={composerSuggestions()}>{(composer) => <option value={composer.name} />}</For>
        </datalist>

        <fieldset class="catalog-year-filter">
          <legend>Year (inclusive)</legend>
          <div>
            <label for="catalog-year-from">From</label>
            <input
              id="catalog-year-from"
              class="text-input"
              type="number"
              value={yearFrom()}
              onInput={(event) => {
                setYearFrom(event.currentTarget.value);
                queueSearch(300);
              }}
            />
            <label for="catalog-year-to">To</label>
            <input
              id="catalog-year-to"
              class="text-input"
              type="number"
              value={yearTo()}
              onInput={(event) => {
                setYearTo(event.currentTarget.value);
                queueSearch(300);
              }}
            />
          </div>
        </fieldset>

        <fieldset class="catalog-instrument-filter">
          <legend>Instrumentation</legend>
          <div class="catalog-match-toggle">
            <label>
              <input
                type="radio"
                name="instrument-match"
                checked={props.search.instrumentMatch === 'ANY'}
                onChange={() => {
                  void props.onSearchChange({ ...searchInput(1), instrumentMatch: 'ANY' }, true);
                }}
              />
              Match any
            </label>
            <label>
              <input
                type="radio"
                name="instrument-match"
                checked={props.search.instrumentMatch === 'ALL'}
                onChange={() => {
                  void props.onSearchChange({ ...searchInput(1), instrumentMatch: 'ALL' }, true);
                }}
              />
              Match all
            </label>
          </div>
          <InstrumentFilter
            instruments={props.instruments}
            selectedIds={props.search.instrumentIds}
            onChange={(ids) => {
              void props.onSearchChange({ ...searchInput(1), instrumentIds: ids }, true);
            }}
          />
        </fieldset>

        <button class="text-button" type="button" onClick={clearFilters}>
          Clear all filters
        </button>
      </aside>

      <section class="catalog-results" aria-live="polite" aria-busy={catalogQuery.isFetching}>
        <header>
          <div>
            <p class="eyebrow">Repertoire catalog</p>
            <h2>{results().total} matching works</h2>
          </div>
          <Show when={results().total > 0}>
            <small>
              Showing {(results().page - 1) * results().pageSize + 1}–
              {Math.min(results().page * results().pageSize, results().total)} of {results().total}
            </small>
          </Show>
        </header>
        <Show when={catalogQuery.error ?? mutationError()}>
          <p class="form-error" role="alert">
            {catalogQuery.error instanceof Error
              ? catalogQuery.error.message
              : mutationError() || 'The catalog could not be searched.'}
          </p>
        </Show>
        <div
          class="catalog-result-list"
          classList={{ 'catalog-results-loading': catalogQuery.isFetching }}
        >
          <For
            each={results().items}
            fallback={<p class="library-empty">No catalog works match.</p>}
          >
            {(item) => {
              const inLibrary = () => item.inLibrary;
              const expanded = () => expandedIds().includes(item.id);
              return (
                <RepertoireListRow
                  item={{
                    id: item.id,
                    title: item.title,
                    composer: item.composers.map((composer) => composer.name).join(', '),
                    details: [
                      item.instruments.map((instrument) => instrument.name).join(', ') ||
                        'Unscored',
                      String(item.compositionYear ?? 'Year unknown'),
                      item.visibility.toLowerCase(),
                      ...(item.measureRange ? [item.measureRange] : []),
                    ],
                    inLibrary: inLibrary(),
                    libraryNotes: item.libraryNotes,
                  }}
                  pending={addingId() === item.id}
                  onAdd={() => addToLibrary(item)}
                  onRemove={() => removeFromLibrary(item)}
                  actions={
                    <Show when={item.children.length > 0}>
                      <button
                        class="text-button catalog-expand-button"
                        type="button"
                        aria-expanded={expanded()}
                        onClick={() =>
                          setExpandedIds((ids) =>
                            expanded() ? ids.filter((id) => id !== item.id) : [...ids, item.id],
                          )
                        }
                      >
                        {expanded() ? 'Hide' : 'Show'} {item.children.length}{' '}
                        {item.children.length === 1 ? 'child' : 'children'}
                      </button>
                    </Show>
                  }
                >
                  <Show when={item.ownedByUser && !inLibrary()}>
                    <span class="tag catalog-owned-tag">Owned by you · Not in My Library</span>
                  </Show>
                  <Show when={expanded()}>
                    <CatalogChildren
                      items={item.children}
                      addingId={addingId()}
                      onAdd={addToLibrary}
                      onRemove={removeFromLibrary}
                    />
                  </Show>
                </RepertoireListRow>
              );
            }}
          </For>
        </div>
        <Show when={results().totalPages > 1}>
          <nav class="catalog-pagination" aria-label="Catalog pages">
            <button
              class="secondary-button"
              type="button"
              disabled={catalogQuery.isFetching || results().page === 1}
              onClick={() => loadPage(results().page - 1)}
            >
              Previous
            </button>
            <span>
              Page {results().page} of {results().totalPages}
            </span>
            <button
              class="secondary-button"
              type="button"
              disabled={catalogQuery.isFetching || results().page === results().totalPages}
              onClick={() => loadPage(results().page + 1)}
            >
              Next
            </button>
          </nav>
        </Show>
      </section>
    </div>
  );
}

function CatalogChildren(props: {
  items: CatalogRepertoireRow[];
  addingId: string | null;
  onAdd: (item: CatalogRepertoireRow) => Promise<void>;
  onRemove: (item: CatalogRepertoireRow) => Promise<void>;
}) {
  return (
    <ul class="catalog-child-list">
      <For each={props.items}>
        {(item) => (
          <li>
            <RepertoireListRow
              item={{
                id: item.id,
                title: item.title,
                composer: item.composers.map((composer) => composer.name).join(', '),
                details: [
                  item.instruments.map((instrument) => instrument.name).join(', ') || 'Unscored',
                  item.compositionYear === null ? 'Year unknown' : String(item.compositionYear),
                  item.visibility.toLowerCase(),
                  ...(item.measureRange ? [item.measureRange] : []),
                ],
                inLibrary: item.inLibrary,
                libraryNotes: item.libraryNotes,
              }}
              pending={props.addingId === item.id}
              onAdd={() => props.onAdd(item)}
              onRemove={() => props.onRemove(item)}
            >
              <Show when={item.children.length > 0}>
                <CatalogChildren
                  items={item.children}
                  addingId={props.addingId}
                  onAdd={props.onAdd}
                  onRemove={props.onRemove}
                />
              </Show>
            </RepertoireListRow>
          </li>
        )}
      </For>
    </ul>
  );
}

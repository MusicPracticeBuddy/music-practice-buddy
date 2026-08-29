import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useRouter } from '@tanstack/solid-router'
import {
  addRepertoireToLibrary,
  type CatalogComposerOption,
  type CatalogInstrumentMatch,
  type CatalogRepertoireRow,
  type CatalogSearchInput,
  type CatalogSearchPage,
  type InstrumentOption,
  getPublicRepertoireCatalogPage,
} from '@/data/repertoire'

export function RepertoireCatalogSearch(props: {
  initialPage: CatalogSearchPage
  composers: CatalogComposerOption[]
  instruments: InstrumentOption[]
  initialInstrumentIds?: string[]
}) {
  const router = useRouter()
  const [query, setQuery] = createSignal('')
  const [composerQuery, setComposerQuery] = createSignal('')
  const [instrumentQuery, setInstrumentQuery] = createSignal('')
  const [selectedInstrumentIds, setSelectedInstrumentIds] = createSignal<string[]>(
    props.initialInstrumentIds ?? [],
  )
  const [instrumentMatch, setInstrumentMatch] = createSignal<CatalogInstrumentMatch>('ANY')
  const [yearFrom, setYearFrom] = createSignal('')
  const [yearTo, setYearTo] = createSignal('')
  const [results, setResults] = createSignal(props.initialPage)
  const [loading, setLoading] = createSignal(false)
  const [expandedIds, setExpandedIds] = createSignal<string[]>([])
  const [addingId, setAddingId] = createSignal<string | null>(null)
  const [addedIds, setAddedIds] = createSignal<string[]>([])
  const [error, setError] = createSignal('')
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let requestId = 0

  const visibleInstruments = createMemo(() => {
    const search = instrumentQuery().trim().toLocaleLowerCase()
    return search
      ? props.instruments.filter((instrument) =>
          `${instrument.name} ${instrument.family}`.toLocaleLowerCase().includes(search),
        )
      : props.instruments
  })

  function searchInput(page: number): CatalogSearchInput {
    return {
      query: query(),
      composer: composerQuery(),
      instrumentIds: selectedInstrumentIds(),
      instrumentMatch: instrumentMatch(),
      yearFrom: yearFrom() === '' ? null : Number(yearFrom()),
      yearTo: yearTo() === '' ? null : Number(yearTo()),
      page,
    }
  }

  async function loadPage(page: number) {
    clearTimeout(searchTimer)
    const currentRequest = ++requestId
    setLoading(true)
    setError('')
    try {
      const nextResults = await getPublicRepertoireCatalogPage({ data: searchInput(page) })
      if (currentRequest === requestId) setResults(nextResults)
    } catch (caught) {
      if (currentRequest === requestId) {
        setError(caught instanceof Error ? caught.message : 'The catalog could not be searched.')
      }
    } finally {
      if (currentRequest === requestId) setLoading(false)
    }
  }

  function queueSearch(delay = 0) {
    clearTimeout(searchTimer)
    requestId += 1
    searchTimer = setTimeout(() => void loadPage(1), delay)
  }

  onCleanup(() => clearTimeout(searchTimer))

  function toggleInstrument(id: string, checked: boolean) {
    setSelectedInstrumentIds((ids) =>
      checked ? [...ids, id] : ids.filter((candidate) => candidate !== id),
    )
    queueSearch()
  }

  function clearFilters() {
    setQuery('')
    setComposerQuery('')
    setInstrumentQuery('')
    setSelectedInstrumentIds([])
    setInstrumentMatch('ANY')
    setYearFrom('')
    setYearTo('')
    queueSearch()
  }

  async function addToLibrary(item: CatalogRepertoireRow) {
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
            setQuery(event.currentTarget.value)
            queueSearch(300)
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
          onInput={(event) => {
            setComposerQuery(event.currentTarget.value)
            queueSearch(300)
          }}
        />
        <datalist id="catalog-composer-options">
          <For each={props.composers}>{(composer) => <option value={composer.name} />}</For>
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
                setYearFrom(event.currentTarget.value)
                queueSearch(300)
              }}
            />
            <label for="catalog-year-to">To</label>
            <input
              id="catalog-year-to"
              class="text-input"
              type="number"
              value={yearTo()}
              onInput={(event) => {
                setYearTo(event.currentTarget.value)
                queueSearch(300)
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
                checked={instrumentMatch() === 'ANY'}
                onChange={() => {
                  setInstrumentMatch('ANY')
                  queueSearch()
                }}
              />
              Match any
            </label>
            <label>
              <input
                type="radio"
                name="instrument-match"
                checked={instrumentMatch() === 'ALL'}
                onChange={() => {
                  setInstrumentMatch('ALL')
                  queueSearch()
                }}
              />
              Match all
            </label>
          </div>
          <input
            class="text-input"
            type="search"
            value={instrumentQuery()}
            aria-label="Search instruments"
            placeholder="Search instruments…"
            onInput={(event) => setInstrumentQuery(event.currentTarget.value)}
          />
          <div class="catalog-instrument-options">
            <For each={visibleInstruments()}>
              {(instrument) => (
                <label>
                  <input
                    type="checkbox"
                    checked={selectedInstrumentIds().includes(instrument.id)}
                    onChange={(event) =>
                      toggleInstrument(instrument.id, event.currentTarget.checked)
                    }
                  />
                  <span>
                    {instrument.name}
                    <small>{instrument.family.toLocaleLowerCase()}</small>
                  </span>
                </label>
              )}
            </For>
          </div>
        </fieldset>

        <button class="text-button" type="button" onClick={clearFilters}>
          Clear all filters
        </button>
      </aside>

      <section class="catalog-results" aria-live="polite" aria-busy={loading()}>
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
        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
        <div class="catalog-result-list" classList={{ 'catalog-results-loading': loading() }}>
          <For
            each={results().items}
            fallback={<p class="library-empty">No catalog works match.</p>}
          >
            {(item) => {
              const inLibrary = () => item.inLibrary || addedIds().includes(item.id)
              const expanded = () => expandedIds().includes(item.id)
              return (
                <article class="catalog-result-card">
                  <div class="catalog-result-summary">
                    <div>
                      <h3>{item.title}</h3>
                      <Show when={item.ownedByUser && !inLibrary()}>
                        <span class="tag catalog-owned-tag">Owned by you · Not in My Library</span>
                      </Show>
                      <p>
                        {item.composers.map((composer) => composer.name).join(', ') ||
                          'Unknown composer'}
                      </p>
                      <small>
                        {item.compositionYear ?? 'Year unknown'}
                        {item.instruments.length > 0 &&
                          ` · ${item.instruments.map((instrument) => instrument.name).join(', ')}`}
                      </small>
                    </div>
                    <div class="catalog-result-actions">
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
                      <button
                        class={inLibrary() ? 'secondary-button' : 'primary-button'}
                        type="button"
                        disabled={inLibrary() || addingId() === item.id}
                        onClick={() => addToLibrary(item)}
                      >
                        {inLibrary()
                          ? 'In My Library'
                          : addingId() === item.id
                            ? 'Adding…'
                            : '+ Add'}
                      </button>
                    </div>
                  </div>
                  <Show when={expanded()}>
                    <CatalogChildren
                      items={item.children}
                      addingId={addingId()}
                      addedIds={addedIds()}
                      onAdd={addToLibrary}
                    />
                  </Show>
                </article>
              )
            }}
          </For>
        </div>
        <Show when={results().totalPages > 1}>
          <nav class="catalog-pagination" aria-label="Catalog pages">
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
    </div>
  )
}

function CatalogChildren(props: {
  items: CatalogRepertoireRow[]
  addingId: string | null
  addedIds: string[]
  onAdd: (item: CatalogRepertoireRow) => Promise<void>
}) {
  return (
    <ul class="catalog-child-list">
      <For each={props.items}>
        {(item) => (
          <li>
            <div class="catalog-child-summary">
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.composers.map((composer) => composer.name).join(', ') || 'Unknown composer'}
                  {item.compositionYear !== null && ` · ${item.compositionYear}`}
                  {item.instruments.length > 0 &&
                    ` · ${item.instruments.map((instrument) => instrument.name).join(', ')}`}
                </small>
              </div>
              <button
                class={
                  item.inLibrary || props.addedIds.includes(item.id)
                    ? 'secondary-button catalog-child-action'
                    : 'primary-button catalog-child-action'
                }
                type="button"
                aria-label={
                  item.inLibrary || props.addedIds.includes(item.id)
                    ? `${item.title} is in My Library`
                    : `Add ${item.title} to My Library`
                }
                disabled={
                  item.inLibrary || props.addedIds.includes(item.id) || props.addingId === item.id
                }
                onClick={() => void props.onAdd(item)}
              >
                {item.inLibrary || props.addedIds.includes(item.id)
                  ? 'In My Library'
                  : props.addingId === item.id
                    ? 'Adding…'
                    : '+ Add'}
              </button>
            </div>
            <Show when={item.children.length > 0}>
              <CatalogChildren
                items={item.children}
                addingId={props.addingId}
                addedIds={props.addedIds}
                onAdd={props.onAdd}
              />
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

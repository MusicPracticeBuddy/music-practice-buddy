import { For, Show, createMemo, createSignal } from 'solid-js'
import { useRouter } from '@tanstack/solid-router'
import {
  addPublicRepertoireToLibrary,
  type CatalogComposerOption,
  type CatalogRepertoireRow,
  type InstrumentOption,
} from '@/data/repertoire'

type InstrumentMatch = 'ANY' | 'ALL'

export function RepertoireCatalogSearch(props: {
  items: CatalogRepertoireRow[]
  composers: CatalogComposerOption[]
  instruments: InstrumentOption[]
}) {
  const router = useRouter()
  const [query, setQuery] = createSignal('')
  const [composerQuery, setComposerQuery] = createSignal('')
  const [instrumentQuery, setInstrumentQuery] = createSignal('')
  const [selectedInstrumentIds, setSelectedInstrumentIds] = createSignal<string[]>([])
  const [instrumentMatch, setInstrumentMatch] = createSignal<InstrumentMatch>('ANY')
  const [yearFrom, setYearFrom] = createSignal('')
  const [yearTo, setYearTo] = createSignal('')
  const [addingId, setAddingId] = createSignal<string | null>(null)
  const [addedIds, setAddedIds] = createSignal<string[]>([])
  const [error, setError] = createSignal('')

  const visibleInstruments = createMemo(() => {
    const search = instrumentQuery().trim().toLocaleLowerCase()
    return search
      ? props.instruments.filter((instrument) =>
          `${instrument.name} ${instrument.family}`.toLocaleLowerCase().includes(search),
        )
      : props.instruments
  })

  const filteredItems = createMemo(() => {
    const text = query().trim().toLocaleLowerCase()
    const composer = composerQuery().trim().toLocaleLowerCase()
    const instruments = selectedInstrumentIds()
    const lowerYear = yearFrom() ? Number(yearFrom()) : null
    const upperYear = yearTo() ? Number(yearTo()) : null

    return props.items.filter((item) => {
      if (
        text &&
        !`${item.title} ${item.composers.map((credit) => credit.name).join(' ')}`
          .toLocaleLowerCase()
          .includes(text)
      ) {
        return false
      }
      if (
        composer &&
        !item.composers.some((credit) => credit.name.toLocaleLowerCase().includes(composer))
      ) {
        return false
      }
      if (
        lowerYear !== null &&
        (item.compositionYear === null || item.compositionYear < lowerYear)
      ) {
        return false
      }
      if (
        upperYear !== null &&
        (item.compositionYear === null || item.compositionYear > upperYear)
      ) {
        return false
      }
      if (instruments.length > 0) {
        const itemInstrumentIds = new Set(item.instruments.map((instrument) => instrument.id))
        const matches = instruments.map((id) => itemInstrumentIds.has(id))
        if (instrumentMatch() === 'ALL' ? !matches.every(Boolean) : !matches.some(Boolean)) {
          return false
        }
      }
      return true
    })
  })

  const results = createMemo(() => filteredItems().slice(0, 100))

  function toggleInstrument(id: string, checked: boolean) {
    setSelectedInstrumentIds((ids) =>
      checked ? [...ids, id] : ids.filter((candidate) => candidate !== id),
    )
  }

  function clearFilters() {
    setQuery('')
    setComposerQuery('')
    setInstrumentQuery('')
    setSelectedInstrumentIds([])
    setYearFrom('')
    setYearTo('')
  }

  async function addToLibrary(item: CatalogRepertoireRow) {
    setAddingId(item.id)
    setError('')
    try {
      await addPublicRepertoireToLibrary({ data: item.id })
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
          onInput={(event) => setQuery(event.currentTarget.value)}
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
          onInput={(event) => setComposerQuery(event.currentTarget.value)}
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
              onInput={(event) => setYearFrom(event.currentTarget.value)}
            />
            <label for="catalog-year-to">To</label>
            <input
              id="catalog-year-to"
              class="text-input"
              type="number"
              value={yearTo()}
              onInput={(event) => setYearTo(event.currentTarget.value)}
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
                onChange={() => setInstrumentMatch('ANY')}
              />
              Match any
            </label>
            <label>
              <input
                type="radio"
                name="instrument-match"
                checked={instrumentMatch() === 'ALL'}
                onChange={() => setInstrumentMatch('ALL')}
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

      <section class="catalog-results" aria-live="polite">
        <header>
          <div>
            <p class="eyebrow">Public catalog</p>
            <h2>{filteredItems().length} matching works</h2>
          </div>
          <Show when={filteredItems().length > results().length}>
            <small>
              Showing the first {results().length}; refine your filters to narrow the list.
            </small>
          </Show>
        </header>
        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
        <div class="catalog-result-list">
          <For each={results()} fallback={<p class="library-empty">No catalog works match.</p>}>
            {(item) => {
              const inLibrary = () => item.inLibrary || addedIds().includes(item.id)
              return (
                <article class="catalog-result-card">
                  <div>
                    <h3>{item.title}</h3>
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
                  <button
                    class={inLibrary() ? 'secondary-button' : 'primary-button'}
                    type="button"
                    disabled={inLibrary() || addingId() === item.id}
                    onClick={() => addToLibrary(item)}
                  >
                    {inLibrary() ? 'In My Library' : addingId() === item.id ? 'Adding…' : '+ Add'}
                  </button>
                </article>
              )
            }}
          </For>
        </div>
      </section>
    </div>
  )
}

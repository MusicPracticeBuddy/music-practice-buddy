import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import type { CatalogRepertoireRow } from '@/data/repertoire'

const mocks = vi.hoisted(() => ({
  addToLibrary: vi.fn(async () => ({ id: '1' })),
  searchCatalog: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: JSX.Element }) => <a>{props.children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

vi.mock('../../src/data/repertoire', () => ({
  addRepertoireToLibrary: mocks.addToLibrary,
  getPublicRepertoireCatalogPage: mocks.searchCatalog,
}))

import { RepertoireCatalogSearch } from '@/components/RepertoireCatalogSearch'

const composers = [
  { id: '10', name: 'Wolfgang Amadeus Mozart' },
  { id: '11', name: 'Claude Debussy' },
]

const instruments = [
  { id: '20', name: 'Piano', family: 'KEYBOARD' },
  { id: '21', name: 'Violin', family: 'STRING' },
]

const items: CatalogRepertoireRow[] = [
  {
    id: '1',
    title: 'Inclusive Lower Bound',
    compositionYear: 1800,
    composers: [composers[0]!],
    instruments: [instruments[0]!, instruments[1]!],
    inLibrary: false,
    children: [],
  },
  {
    id: '2',
    title: 'Inclusive Upper Bound',
    compositionYear: 1900,
    composers: [composers[1]!],
    instruments: [instruments[0]!],
    inLibrary: false,
    children: [],
  },
  {
    id: '3',
    title: 'Outside Range',
    compositionYear: 1901,
    composers: [composers[1]!],
    instruments: [instruments[1]!],
    inLibrary: true,
    children: [],
  },
]

function renderSearch(
  initialPage = { items, page: 1, pageSize: 25, total: items.length, totalPages: 1 },
  initialInstrumentIds: string[] = [],
) {
  return render(() => (
    <RepertoireCatalogSearch
      initialPage={initialPage}
      composers={composers}
      instruments={instruments}
      initialInstrumentIds={initialInstrumentIds}
    />
  ))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function matchingPage(input: {
  query: string
  composer: string
  instrumentIds: string[]
  instrumentMatch: 'ANY' | 'ALL'
  yearFrom: number | null
  yearTo: number | null
  page: number
}) {
  const matches = items.filter((item) => {
    const text = input.query.toLowerCase()
    const composer = input.composer.toLowerCase()
    const itemInstrumentIds = new Set(item.instruments.map((instrument) => instrument.id))
    const instrumentMatches = input.instrumentIds.map((id) => itemInstrumentIds.has(id))
    return (
      (!text ||
        `${item.title} ${item.composers.map((credit) => credit.name).join(' ')}`
          .toLowerCase()
          .includes(text)) &&
      (!composer ||
        item.composers.some((credit) => credit.name.toLowerCase().includes(composer))) &&
      (input.yearFrom === null ||
        (item.compositionYear !== null && item.compositionYear >= input.yearFrom)) &&
      (input.yearTo === null ||
        (item.compositionYear !== null && item.compositionYear <= input.yearTo)) &&
      (instrumentMatches.length === 0 ||
        (input.instrumentMatch === 'ALL'
          ? instrumentMatches.every(Boolean)
          : instrumentMatches.some(Boolean)))
    )
  })
  return { items: matches, page: 1, pageSize: 25, total: matches.length, totalPages: 1 }
}

beforeEach(() => {
  mocks.searchCatalog.mockImplementation(async ({ data }) => matchingPage(data))
})

describe('RepertoireCatalogSearch', () => {
  it('searches composers and applies inclusive year bounds on the server', async () => {
    renderSearch()

    fireEvent.input(screen.getByLabelText('Composer'), { target: { value: 'mozart' } })
    await waitFor(() => expect(screen.queryByText('Inclusive Upper Bound')).toBeNull())
    expect(screen.getByText('Inclusive Lower Bound')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    fireEvent.input(screen.getByLabelText('From'), { target: { value: '1800' } })
    fireEvent.input(screen.getByLabelText('To'), { target: { value: '1900' } })

    expect(await screen.findByText('Inclusive Upper Bound')).toBeTruthy()
    expect(screen.queryByText('Outside Range')).toBeNull()
    expect(screen.getByText('Inclusive Lower Bound')).toBeTruthy()
    expect(mocks.searchCatalog).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ yearFrom: 1800, yearTo: 1900, page: 1 }),
    })
  })

  it('starts with the musician instruments selected and can clear them', async () => {
    const initialInput = {
      query: '',
      composer: '',
      instrumentIds: ['20'],
      instrumentMatch: 'ANY' as const,
      yearFrom: null,
      yearTo: null,
      page: 1,
    }
    renderSearch(matchingPage(initialInput), initialInput.instrumentIds)

    expect((screen.getByRole('checkbox', { name: /Piano/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Violin/ }) as HTMLInputElement).checked).toBe(
      false,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    await waitFor(() => expect(screen.getByText('3 matching works')).toBeTruthy())
  })

  it('supports matching any or all selected instruments', async () => {
    renderSearch()

    fireEvent.click(screen.getByRole('checkbox', { name: /Piano/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Violin/ }))
    await waitFor(() => expect(screen.getByText('3 matching works')).toBeTruthy())

    fireEvent.click(screen.getByRole('radio', { name: 'Match all' }))
    await waitFor(() => expect(screen.getByText('1 matching works')).toBeTruthy())
    expect(screen.getByText('Inclusive Lower Bound')).toBeTruthy()
    expect(screen.queryByText('Inclusive Upper Bound')).toBeNull()
  })

  it('adds a public work and disables its action', async () => {
    renderSearch()

    const addButtons = screen.getAllByRole('button', { name: '+ Add' })
    fireEvent.click(addButtons[0]!)

    await waitFor(() => {
      expect(mocks.addToLibrary).toHaveBeenCalledWith({ data: '1' })
      expect(screen.getAllByRole('button', { name: 'In My Library' })).toHaveLength(2)
    })
    expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true })
  })

  it('loads another page from the server', async () => {
    renderSearch({ items: [items[0]!], page: 1, pageSize: 25, total: 26, totalPages: 2 })
    mocks.searchCatalog.mockResolvedValueOnce({
      items: [items[1]!],
      page: 2,
      pageSize: 25,
      total: 26,
      totalPages: 2,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Inclusive Upper Bound')).toBeTruthy()
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    expect(mocks.searchCatalog).toHaveBeenCalledWith({
      data: expect.objectContaining({ page: 2 }),
    })
  })

  it('expands a top-level work to show its children', () => {
    const child = { ...items[1]!, id: '20', title: 'First movement' }
    const parent = { ...items[0]!, children: [child] }
    renderSearch({ items: [parent], page: 1, pageSize: 25, total: 1, totalPages: 1 })

    expect(screen.queryByText('First movement')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 child' }))

    expect(screen.getByText('First movement')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hide 1 child' })).toBeTruthy()
  })

  it('adds an individual child to My Library', async () => {
    const child = { ...items[1]!, id: '20', title: 'First concerto' }
    const parent = { ...items[0]!, children: [child] }
    renderSearch({ items: [parent], page: 1, pageSize: 25, total: 1, totalPages: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'Show 1 child' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add First concerto to My Library' }))

    await waitFor(() => {
      expect(mocks.addToLibrary).toHaveBeenCalledWith({ data: '20' })
      expect(screen.getByText('In My Library', { selector: '.catalog-child-action' })).toBeTruthy()
    })
  })
})

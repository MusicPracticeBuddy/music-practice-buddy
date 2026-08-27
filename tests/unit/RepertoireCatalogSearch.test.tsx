import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'

const mocks = vi.hoisted(() => ({
  addToLibrary: vi.fn(async () => ({ id: '1' })),
  invalidate: vi.fn(async () => undefined),
}))

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: JSX.Element }) => <a>{props.children}</a>,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

vi.mock('../../src/data/repertoire', () => ({
  addPublicRepertoireToLibrary: mocks.addToLibrary,
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

const items = [
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

function renderSearch() {
  return render(() => (
    <RepertoireCatalogSearch items={items} composers={composers} instruments={instruments} />
  ))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('RepertoireCatalogSearch', () => {
  it('searches composers and applies inclusive year bounds', () => {
    renderSearch()

    fireEvent.input(screen.getByLabelText('Composer'), { target: { value: 'mozart' } })
    expect(screen.getByText('Inclusive Lower Bound')).toBeTruthy()
    expect(screen.queryByText('Inclusive Upper Bound')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    fireEvent.input(screen.getByLabelText('From'), { target: { value: '1800' } })
    fireEvent.input(screen.getByLabelText('To'), { target: { value: '1900' } })

    expect(screen.getByText('Inclusive Lower Bound')).toBeTruthy()
    expect(screen.getByText('Inclusive Upper Bound')).toBeTruthy()
    expect(screen.queryByText('Outside Range')).toBeNull()
  })

  it('supports matching any or all selected instruments', () => {
    renderSearch()

    fireEvent.click(screen.getByRole('checkbox', { name: /Piano/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Violin/ }))
    expect(screen.getByText('3 matching works')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: 'Match all' }))
    expect(screen.getByText('1 matching works')).toBeTruthy()
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
})

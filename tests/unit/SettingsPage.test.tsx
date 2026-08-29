import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal, type Accessor, type JSX } from 'solid-js'

type LoaderData = {
  instruments: Array<{
    id: string
    name: string
    family: string
    isPreferred: boolean
  }>
  instrumentIds: string[]
}

let loaderData: Accessor<LoaderData>

vi.mock('@tanstack/solid-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => loaderData,
  }),
  useRouter: () => ({ invalidate: vi.fn(async () => undefined) }),
}))

vi.mock('../../src/data/preferences', () => ({
  getMusicianInstrumentIds: vi.fn(),
  updateMusicianInstrumentIds: vi.fn(),
}))

vi.mock('../../src/data/repertoire', () => ({
  getInstruments: vi.fn(),
}))

import { Route } from '@/routes/settings'

const Settings = (Route as unknown as { component: () => JSX.Element }).component

afterEach(cleanup)

describe('Settings page', () => {
  it('duplicates My Instruments in their families with shared checkbox state', () => {
    const [data] = createSignal<LoaderData>({
      instruments: [
        { id: '1', name: 'Violin', family: 'STRING', isPreferred: true },
        { id: '2', name: 'Trumpet', family: 'BRASS', isPreferred: false },
      ],
      instrumentIds: ['1'],
    })
    loaderData = data
    render(() => <Settings />)

    expect(screen.getAllByRole('checkbox', { name: /Violin/ })).toHaveLength(1)
    expect(screen.queryByRole('checkbox', { name: /Trumpet/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show all instruments' }))
    const violinCheckboxes = screen.getAllByRole('checkbox', { name: /Violin/ })
    expect(violinCheckboxes).toHaveLength(2)
    expect(violinCheckboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true)

    fireEvent.click(violinCheckboxes[1]!)
    const familyViolin = screen.getByRole('checkbox', { name: /Violin/ }) as HTMLInputElement
    expect(familyViolin.checked).toBe(false)

    fireEvent.click(familyViolin)
    expect(
      screen
        .getAllByRole('checkbox', { name: /Violin/ })
        .every((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toBe(true)
  })
})

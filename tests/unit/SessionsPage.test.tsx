import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal, type Accessor, type JSX } from 'solid-js'
import type { SessionPage } from '@/data/sessions'

type LoaderData = { page: SessionPage; instruments: [] }

let loaderData: Accessor<LoaderData>

vi.mock('@tanstack/solid-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => loaderData,
  }),
  Link: (props: { children: JSX.Element; class?: string }) => (
    <a class={props.class}>{props.children}</a>
  ),
}))

vi.mock('../../src/components/DeleteConfirmationDialog', () => ({
  DeleteConfirmationDialog: () => null,
}))

vi.mock('../../src/components/SwipeToDelete', () => ({
  SwipeToDelete: (props: { children: JSX.Element }) => <>{props.children}</>,
}))

vi.mock('../../src/components/InstrumentFields', () => ({
  InstrumentFilter: () => null,
}))

vi.mock('../../src/data/sessions', () => ({
  deletePlannedSession: vi.fn(),
  EMPTY_SESSION_SEARCH: { instrumentIds: [], page: 1 },
  getSessionsPage: vi.fn(),
}))

vi.mock('../../src/data/repertoire', () => ({
  getInstruments: vi.fn(),
}))

import { Route } from '@/routes/sessions/index'

const Sessions = (Route as unknown as { component: () => JSX.Element }).component

function page(id: string, name: string, total: number): SessionPage {
  return {
    items: [
      {
        id,
        templateName: name,
        status: 'PLANNED',
        assignedDate: null,
        assignedAt: null,
        startedAt: null,
        endedAt: null,
        durationMinutes: null,
        itemCount: 0,
        readyToFinalize: false,
        instrumentId: null,
        instrumentName: null,
      },
    ],
    page: 1,
    pageSize: 20,
    total,
    totalPages: 1,
  }
}

afterEach(cleanup)

describe('Sessions page', () => {
  it('updates the rendered list when loader data refreshes', async () => {
    const [data, setData] = createSignal<LoaderData>({
      page: page('1', 'Existing session', 1),
      instruments: [],
    })
    loaderData = data
    render(() => <Sessions />)

    expect(screen.getByText('Existing session')).toBeTruthy()
    expect(screen.getByText('1 sessions')).toBeTruthy()

    setData({
      page: {
        ...page('2', 'Duplicated session', 2),
        items: [
          ...page('2', 'Duplicated session', 2).items,
          ...page('1', 'Existing session', 2).items,
        ],
      },
      instruments: [],
    })

    await waitFor(() => {
      expect(screen.getByText('Duplicated session')).toBeTruthy()
      expect(screen.getByText('2 sessions')).toBeTruthy()
    })
  })
})

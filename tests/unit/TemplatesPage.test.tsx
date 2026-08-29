import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal, type Accessor, type JSX } from 'solid-js'
import type { SessionTemplatePage } from '@/data/sessionTemplates'

type LoaderData = { page: SessionTemplatePage; instruments: [] }

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

vi.mock('../../src/data/sessionTemplates', () => ({
  deleteSessionTemplate: vi.fn(),
  EMPTY_SESSION_TEMPLATE_SEARCH: { instrumentIds: [], page: 1 },
  getSessionTemplatesPage: vi.fn(),
}))

vi.mock('../../src/data/repertoire', () => ({
  getInstruments: vi.fn(),
}))

import { Route } from '@/routes/templates/index'

const Templates = (Route as unknown as { component: () => JSX.Element }).component

function page(id: string, name: string, total: number): SessionTemplatePage {
  return {
    items: [
      {
        id,
        name,
        visibility: 'PRIVATE',
        ownerId: 'musician-1',
        itemCount: 0,
        updatedAt: '2026-08-29T00:00:00.000Z',
        canEdit: true,
        canManage: true,
        canUse: true,
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

describe('Templates page', () => {
  it('updates the rendered list when loader data refreshes', async () => {
    const [data, setData] = createSignal<LoaderData>({
      page: page('1', 'Existing template', 1),
      instruments: [],
    })
    loaderData = data
    render(() => <Templates />)

    expect(screen.getByText('Existing template')).toBeTruthy()

    setData({
      page: {
        ...page('2', 'New template', 2),
        items: [...page('2', 'New template', 2).items, ...page('1', 'Existing template', 2).items],
      },
      instruments: [],
    })

    await waitFor(() => expect(screen.getByText('New template')).toBeTruthy())
  })
})

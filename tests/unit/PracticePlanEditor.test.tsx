import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import type { SortableEvent } from 'sortablejs'
import {
  updateSessionTemplate,
  type SessionTemplateDetail,
  type TemplateLibraryItem,
} from '@/data/sessionTemplates'

type SortableOptions = {
  onAdd?: (event: SortableEvent) => void
  onUpdate?: (event: SortableEvent) => void
}

const sortableMock = vi.hoisted(() => ({
  instances: [] as Array<{ element: HTMLElement; options: SortableOptions }>,
}))

vi.mock('sortablejs', () => ({
  default: class SortableMock {
    constructor(element: HTMLElement, options: SortableOptions) {
      sortableMock.instances.push({ element, options })
    }

    destroy() {}
  },
}))

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: JSX.Element; class?: string }) => (
    <a class={props.class}>{props.children}</a>
  ),
  useNavigate: () => async () => undefined,
  useRouter: () => ({ invalidate: async () => undefined }),
}))

vi.mock('../../src/data/sessionTemplates', () => ({
  createSessionTemplate: vi.fn(),
  updatePlannedSession: vi.fn(),
  updateSessionTemplate: vi.fn(),
}))

vi.mock('../../src/data/exercises', () => ({
  createExercise: vi.fn(),
}))

vi.mock('../../src/data/repertoire', () => ({
  EMPTY_CATALOG_SEARCH: {
    query: '',
    composer: '',
    instrumentIds: [],
    instrumentMatch: 'ANY',
    yearFrom: null,
    yearTo: null,
    page: 1,
  },
  createRepertoire: vi.fn(),
  getInstruments: vi
    .fn()
    .mockResolvedValue([
      { id: '1', name: 'Trumpet in B-flat', family: 'BRASS', isPreferred: true },
    ]),
  getPublicRepertoireCatalogPage: vi.fn().mockResolvedValue({
    items: [
      {
        id: '2',
        title: 'Public Repertoire Two',
        compositionYear: 1900,
        composers: [{ id: '2', name: 'Public Composer' }],
        instruments: [],
        inLibrary: false,
        children: [],
      },
    ],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
  }),
}))

import { PracticePlanEditor } from '@/components/PracticePlanEditor'

const library: TemplateLibraryItem[] = [
  { id: '1', type: 'EXERCISE', name: 'Exercise One', detail: 'Exercise' },
  { id: '1', type: 'REPERTOIRE', name: 'Repertoire One', detail: 'Repertoire' },
]

function template(items: SessionTemplateDetail['items']): SessionTemplateDetail {
  return {
    id: '10',
    name: 'Editor test',
    visibility: 'PRIVATE',
    ownerId: '1',
    canEdit: true,
    canManage: true,
    canUse: true,
    items,
  }
}

function section(
  clientId: string,
  name: string,
  position: number,
  parentClientId: string | null = null,
) {
  return {
    clientId,
    parentClientId,
    type: 'SECTION' as const,
    sourceId: null,
    name,
    instruction: '',
    position,
  }
}

function exercise(
  clientId: string,
  name: string,
  position: number,
  parentClientId: string,
  instruction = '',
) {
  return {
    clientId,
    parentClientId,
    type: 'EXERCISE' as const,
    sourceId: '1',
    name,
    instruction,
    position,
  }
}

function sortableFor(element: HTMLElement) {
  const instance = sortableMock.instances.find((candidate) => candidate.element === element)
  if (!instance) throw new Error('Sortable instance not found')
  return instance
}

function nodeNames(container: HTMLElement) {
  return Array.from(container.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => element.classList.contains('editor-node'))
    .map((element) => element.querySelector('.editor-node-copy strong')?.textContent)
}

function simulateLibraryDrop(item: HTMLElement, destination: HTMLElement, newIndex: number) {
  const source = item.parentElement
  if (!source) throw new Error('Library item has no source list')
  const clone = item.cloneNode(true) as HTMLElement
  source.insertBefore(clone, item)
  destination.insertBefore(item, destination.children.item(newIndex))
  sortableFor(destination).options.onAdd?.({
    from: source,
    to: destination,
    item,
    clone,
    oldIndex: 0,
    newIndex,
  } as SortableEvent)
}

function simulatePlanMove(item: HTMLElement, destination: HTMLElement, newIndex: number) {
  const source = item.parentElement
  if (!source) throw new Error('Plan item has no source list')
  destination.insertBefore(item, destination.children.item(newIndex))
  const callback = source === destination ? 'onUpdate' : 'onAdd'
  sortableFor(destination).options[callback]?.({
    from: source,
    to: destination,
    item,
    clone: item.cloneNode(true) as HTMLElement,
    oldIndex: 0,
    newIndex,
  } as SortableEvent)
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  sortableMock.instances.length = 0
})

describe('PracticePlanEditor', () => {
  it('only offers public template visibility to admins', () => {
    const { unmount } = render(() => <PracticePlanEditor library={library} />)

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE'])

    unmount()
    render(() => <PracticePlanEditor library={library} canCreatePublic />)

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE', 'PUBLIC'])
  })

  it('searches My Library first and only offers repertoire creation from public search', async () => {
    render(() => <PracticePlanEditor library={library} template={template([])} />)

    fireEvent.click(screen.getByRole('button', { name: /Create new exercise/ }))

    const name = await screen.findByLabelText('Name')
    expect(name.getAttribute('maxlength')).toBe('200')
    expect(screen.getByLabelText('Instructions or notation (optional)')).toBeTruthy()
    const notationFormat = screen.getByLabelText('Notation format')
    expect(notationFormat.tagName).toBe('SELECT')
    expect(
      Array.from((notationFormat as HTMLSelectElement).options, (option) => option.value),
    ).toEqual(['text', 'abc'])
    expect(
      screen.getByLabelText('Visibility', { selector: '#library-item-visibility' }),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Type')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    fireEvent.click(screen.getByRole('tab', { name: /Repertoire/ }))

    expect(screen.getByRole('button', { name: /Repertoire One/ })).toBeTruthy()
    expect(screen.queryByText('Public Repertoire Two')).toBeNull()
    expect(screen.queryByRole('button', { name: "Can't find what you're looking for?" })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Search public repertoire' }))

    expect(await screen.findByText('Public Repertoire Two')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Can't find what you're looking for?" }))

    expect((await screen.findByLabelText('Title')).getAttribute('maxlength')).toBe('300')
    expect(screen.queryByLabelText('Instructions or notation (optional)')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Credits' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Instrumentation' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Add credit/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add instrument/ }))
    fireEvent.click(screen.getByRole('button', { name: /Add resource/ }))

    expect(screen.getByLabelText('Credit 1 name')).toBeTruthy()
    expect(screen.getByLabelText('Credit 1 role')).toBeTruthy()
    expect(screen.getByLabelText('Instrument 1')).toBeTruthy()
    expect(screen.getByLabelText('Instrument 1 role')).toBeTruthy()
    expect(screen.getByLabelText('Instrument 1 part name')).toBeTruthy()
    expect(screen.getByLabelText('Resource 1 type')).toBeTruthy()
    expect(screen.getByLabelText('Resource 1 URL')).toBeTruthy()
  })

  it('adds a public repertoire search result to the plan', async () => {
    render(() => <PracticePlanEditor library={library} template={template([])} />)

    fireEvent.click(screen.getByRole('tab', { name: /Repertoire/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Search public repertoire' }))
    fireEvent.click(await screen.findByRole('button', { name: /Public Repertoire Two/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(() => {
      expect(updateSessionTemplate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          items: [
            expect.objectContaining({
              type: 'REPERTOIRE',
              sourceId: '2',
              name: 'Public Repertoire Two',
            }),
          ],
        }),
      })
    })
  })

  it('drops the correct library type at the requested position and keeps the library interactive', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('section', 'Main section', 1),
          exercise('first', 'First exercise', 1, 'section'),
          exercise('last', 'Last exercise', 2, 'section'),
        ])}
      />
    ))

    fireEvent.click(screen.getByRole('tab', { name: /Repertoire/ }))
    const repertoire = screen.getByRole('button', { name: /Repertoire One/ })
    const sectionElement = screen.getByDisplayValue('Main section').closest('.editor-node')
    const destination = sectionElement?.querySelector(':scope > .editor-node-children')
    if (!(destination instanceof HTMLElement)) throw new Error('Section drop list not found')

    simulateLibraryDrop(repertoire, destination, 1)

    await waitFor(() => {
      expect(nodeNames(destination)).toEqual(['First exercise', 'Repertoire One', 'Last exercise'])
    })
    expect(screen.getAllByRole('button', { name: /Repertoire One/ })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /Repertoire One/ }))
    await waitFor(() => {
      expect(nodeNames(destination)).toEqual([
        'First exercise',
        'Repertoire One',
        'Last exercise',
        'Repertoire One',
      ])
    })
  })

  it('reorders items within a section and moves them between sections', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('first-section', 'First section', 1),
          exercise('one', 'One', 1, 'first-section'),
          exercise('two', 'Two', 2, 'first-section'),
          section('second-section', 'Second section', 2),
        ])}
      />
    ))

    const firstSection = screen.getByDisplayValue('First section').closest('.editor-node')
    const secondSection = screen.getByDisplayValue('Second section').closest('.editor-node')
    const firstList = firstSection?.querySelector(':scope > .editor-node-children')
    const secondList = secondSection?.querySelector(':scope > .editor-node-children')
    const itemTwo = screen.getByText('Two').closest('.editor-node')
    if (
      !(firstList instanceof HTMLElement) ||
      !(secondList instanceof HTMLElement) ||
      !(itemTwo instanceof HTMLElement)
    ) {
      throw new Error('Expected editor nodes were not found')
    }

    simulatePlanMove(itemTwo, firstList, 0)
    await waitFor(() => expect(nodeNames(firstList)).toEqual(['Two', 'One']))

    const movedItem = screen.getByText('Two').closest('.editor-node')
    if (!(movedItem instanceof HTMLElement)) throw new Error('Moved item not found')
    simulatePlanMove(movedItem, secondList, 0)

    await waitFor(() => {
      expect(nodeNames(firstList)).toEqual(['One'])
      expect(nodeNames(secondList)).toEqual(['Two'])
    })
  })

  it('keeps the arrow controls for sibling reordering', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('section', 'Main section', 1),
          exercise('one', 'One', 1, 'section'),
          exercise('two', 'Two', 2, 'section'),
        ])}
      />
    ))

    const sectionElement = screen.getByDisplayValue('Main section').closest('.editor-node')
    const list = sectionElement?.querySelector(':scope > .editor-node-children')
    const itemTwo = screen.getByText('Two').closest('.editor-node')
    if (!(list instanceof HTMLElement) || !(itemTwo instanceof HTMLElement)) {
      throw new Error('Expected editor nodes were not found')
    }

    fireEvent.click(within(itemTwo).getByTitle('Move up'))
    await waitFor(() => expect(nodeNames(list)).toEqual(['Two', 'One']))
  })

  it('removes an individual item without removing its section', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('section', 'Main section', 1),
          exercise('one', 'Remove me', 1, 'section'),
          exercise('two', 'Keep me', 2, 'section'),
        ])}
      />
    ))

    const item = screen.getByText('Remove me').closest('.editor-node')
    if (!(item instanceof HTMLElement)) throw new Error('Practice item not found')
    fireEvent.click(within(item).getByTitle('Remove'))

    await waitFor(() => expect(screen.queryByText('Remove me')).toBeNull())
    expect(screen.getByDisplayValue('Main section')).toBeTruthy()
    expect(screen.getByText('Keep me')).toBeTruthy()
  })

  it('adds, edits, and removes instructions from items in the plan', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('section', 'Main section', 1),
          exercise('unnoted', 'Unnoted exercise', 1, 'section'),
          exercise('noted', 'Noted exercise', 2, 'section', 'Start slowly'),
        ])}
      />
    ))

    const unnotedItem = screen.getByText('Unnoted exercise').closest('.editor-node')
    const notedItem = screen.getByText('Noted exercise').closest('.editor-node')
    if (!(unnotedItem instanceof HTMLElement) || !(notedItem instanceof HTMLElement)) {
      throw new Error('Practice items not found')
    }

    expect(within(notedItem).getByText('Start slowly')).toBeTruthy()

    fireEvent.click(within(unnotedItem).getByTitle('Add instruction'))
    fireEvent.input(within(unnotedItem).getByLabelText('Instruction'), {
      target: { value: 'Use a metronome' },
    })
    fireEvent.click(within(unnotedItem).getByRole('button', { name: 'Done' }))
    expect(within(unnotedItem).getByText('Use a metronome')).toBeTruthy()

    fireEvent.click(within(notedItem).getByTitle('Edit instruction'))
    fireEvent.input(within(notedItem).getByLabelText('Instruction'), {
      target: { value: '' },
    })
    fireEvent.click(within(notedItem).getByRole('button', { name: 'Done' }))
    expect(within(notedItem).queryByText('Start slowly')).toBeNull()
    expect(within(notedItem).getByTitle('Add instruction')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))

    await waitFor(() => {
      expect(updateSessionTemplate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              clientId: 'unnoted',
              instruction: 'Use a metronome',
            }),
            expect.objectContaining({ clientId: 'noted', instruction: '' }),
          ]),
        }),
      })
    })
  })

  it('removes a section and all of its descendants', async () => {
    render(() => (
      <PracticePlanEditor
        library={library}
        template={template([
          section('outer', 'Remove section', 1),
          section('nested', 'Nested section', 1, 'outer'),
          exercise('child', 'Nested item', 1, 'nested'),
          section('keep', 'Keep section', 2),
        ])}
      />
    ))

    const sectionElement = screen.getByDisplayValue('Remove section').closest('.editor-node')
    if (!(sectionElement instanceof HTMLElement)) throw new Error('Section not found')
    fireEvent.click(within(sectionElement).getAllByTitle('Remove')[0]!)

    await waitFor(() => expect(screen.queryByDisplayValue('Remove section')).toBeNull())
    expect(screen.queryByDisplayValue('Nested section')).toBeNull()
    expect(screen.queryByText('Nested item')).toBeNull()
    expect(screen.getByDisplayValue('Keep section')).toBeTruthy()
  })
})

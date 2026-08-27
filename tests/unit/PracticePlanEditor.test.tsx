import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@solidjs/testing-library'
import type { JSX } from 'solid-js'
import type { SortableEvent } from 'sortablejs'
import type { SessionTemplateDetail, TemplateLibraryItem } from '@/data/sessionTemplates'

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
  createRepertoire: vi.fn(),
  getInstruments: vi
    .fn()
    .mockResolvedValue([{ id: '1', name: 'Trumpet in B-flat', family: 'BRASS' }]),
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
    notes: '',
    position,
  }
}

function exercise(clientId: string, name: string, position: number, parentClientId: string) {
  return {
    clientId,
    parentClientId,
    type: 'EXERCISE' as const,
    sourceId: '1',
    name,
    notes: '',
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
  sortableMock.instances.length = 0
})

describe('PracticePlanEditor', () => {
  it('uses the dedicated creation fields for exercises and repertoire', async () => {
    render(() => <PracticePlanEditor library={library} template={template([])} />)

    fireEvent.click(screen.getByRole('button', { name: /Create new exercise/ }))

    const name = await screen.findByLabelText('Name')
    expect(name.getAttribute('maxlength')).toBe('200')
    expect(screen.getByLabelText('Instructions or notation (optional)')).toBeTruthy()
    expect(screen.getByLabelText('Notation format')).toBeTruthy()
    expect(
      screen.getByLabelText('Visibility', { selector: '#library-item-visibility' }),
    ).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'REPERTOIRE' } })

    expect(screen.getByLabelText('Title').getAttribute('maxlength')).toBe('300')
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

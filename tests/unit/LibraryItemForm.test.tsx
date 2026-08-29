import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal, type JSX } from 'solid-js'

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  renderAbc: vi.fn(),
  updateExercise: vi.fn(async () => ({ id: '42' })),
}))

vi.mock('abcjs', () => ({
  default: { renderAbc: mocks.renderAbc },
}))

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: JSX.Element }) => <a>{props.children}</a>,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

vi.mock('../../src/data/exercises', () => ({
  createExercise: vi.fn(),
  updateExercise: mocks.updateExercise,
}))

vi.mock('../../src/data/repertoire', () => ({
  createRepertoire: vi.fn(),
  updateRepertoire: vi.fn(),
}))

import { LibraryItemForm } from '@/components/LibraryItemForm'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LibraryItemForm', () => {
  it('only offers public visibility to admins creating resources', () => {
    const { unmount } = render(() => <LibraryItemForm kind="exercise" />)

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE'])

    unmount()
    render(() => <LibraryItemForm kind="exercise" canCreatePublic />)

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE', 'PUBLIC'])
  })

  it('preserves public visibility while editing an existing public resource', () => {
    render(() => <LibraryItemForm kind="exercise" id="42" name="Scales" visibility="PUBLIC" />)

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE', 'PUBLIC'])
  })

  it('invalidates cached route data after updating an exercise', async () => {
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation="X:1\nK:C\nCDEF|"
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ))

    fireEvent.input(screen.getByLabelText('Instructions or notation (optional)'), {
      target: { value: 'X:1\nK:G\nGABc|' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save exercise' }).closest('form')!)

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/exercises/$exerciseId',
      params: { exerciseId: '42' },
    })
    expect(mocks.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigate.mock.invocationCallOrder[0]!,
    )
  })

  it('updates its textarea when refreshed loader data changes', async () => {
    const [notation, setNotation] = createSignal('X:1\nK:C\nCDEF|')
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation={notation()}
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ))

    const textarea = screen.getByLabelText('Instructions or notation (optional)')
    expect((textarea as HTMLTextAreaElement).value).toBe('X:1\nK:C\nCDEF|')

    setNotation('X:1\nK:G\nGABc|')

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('X:1\nK:G\nGABc|')
    })
  })

  it('updates the rendered preview while editing ABC notation', async () => {
    const initialNotation = 'X:1\nK:C\nCDEF|'
    const updatedNotation = 'X:1\nK:G\nGABc|'
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation={initialNotation}
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ))

    expect(screen.getByText('Preview')).toBeTruthy()
    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      expect(mocks.renderAbc).toHaveBeenCalledWith(score, initialNotation, {
        responsive: 'resize',
      })
    })

    fireEvent.input(screen.getByLabelText('Instructions or notation (optional)'), {
      target: { value: updatedNotation },
    })

    await waitFor(() => {
      expect(mocks.renderAbc).toHaveBeenLastCalledWith(score, updatedNotation, {
        responsive: 'resize',
      })
    })
  })
})

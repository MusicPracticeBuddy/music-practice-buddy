import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { ExerciseNotation } from '@/components/ExerciseNotation'

const renderAbc = vi.fn()

vi.mock('abcjs', () => ({
  default: { renderAbc },
}))

afterEach(() => {
  cleanup()
  renderAbc.mockClear()
})

describe('ExerciseNotation', () => {
  it('displays text notation without invoking abcjs', () => {
    render(() => <ExerciseNotation notation={'Play slowly\nStay relaxed'} format="text" />)

    expect(screen.getByText(/Play slowly/).textContent).toBe('Play slowly\nStay relaxed')
    expect(renderAbc).not.toHaveBeenCalled()
  })

  it('renders ABC notation into the score element', async () => {
    const notation = 'X:1\nK:C\nCDEF|'
    render(() => <ExerciseNotation notation={notation} format="abc" />)

    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      expect(renderAbc).toHaveBeenCalledWith(score, notation, { responsive: 'resize' })
    })
  })

  it('re-renders when the ABC notation changes', async () => {
    const initialNotation = 'X:1\nK:C\nCDEF|'
    const updatedNotation = 'X:1\nK:G\nGABc|'
    const [notation, setNotation] = createSignal(initialNotation)
    render(() => <ExerciseNotation notation={notation()} format="abc" />)

    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      expect(renderAbc).toHaveBeenCalledWith(score, initialNotation, { responsive: 'resize' })
    })

    setNotation(updatedNotation)

    await waitFor(() => {
      expect(renderAbc).toHaveBeenLastCalledWith(score, updatedNotation, {
        responsive: 'resize',
      })
    })
  })

  it('preserves the selected sharp enharmonic in the visual renderer', async () => {
    const notation = 'X:1\nK:C\nCDEF|'

    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 6, sourceMode: 'major', targetMode: 'major', targetTonic: 'F#' }}
      />
    ))

    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1]
      expect(renderedNotation).toContain('K:F#major')
    })
  })

  it('preserves the selected flat enharmonic in the visual renderer', async () => {
    const notation = 'X:1\nK:C\nCDEF|'
    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 6, sourceMode: 'major', targetMode: 'major', targetTonic: 'Gb' }}
      />
    ))

    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1]
      expect(renderedNotation).toContain('K:Gbmajor')
    })
  })

  it('renders a parallel minor key without changing the stored notation', async () => {
    const notation = 'X:1\nK:C\nCDEF|'
    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 0, sourceMode: 'major', targetMode: 'minor', targetTonic: 'C' }}
      />
    ))

    const score = screen.getByLabelText('Rendered music notation')
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1]
      expect(renderedNotation).toContain('K:Cminor')
    })
    expect(notation).toContain('K:C\n')
  })
})

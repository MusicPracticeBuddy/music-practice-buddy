import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
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
})

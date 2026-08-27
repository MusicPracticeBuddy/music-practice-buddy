import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'

vi.mock('../../src/components/ExerciseNotation', () => ({
  ExerciseNotation: (props: {
    transpose?: {
      steps: number
      sourceMode: string
      targetMode: string
      targetTonic: string
    }
  }) => <output aria-label="Transposition">{JSON.stringify(props.transpose)}</output>,
}))

import { SessionExerciseNotation } from '@/components/SessionExerciseNotation'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SessionExerciseNotation', () => {
  it('centers the current key and moves through same-mode circle-of-fifths keys', () => {
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    expect(
      screen.getByRole('button', { name: 'Display in C major' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Display in G major' }))

    expect(
      screen.getByRole('button', { name: 'Display in G major' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toBe(
      JSON.stringify({
        steps: -5,
        sourceMode: 'major',
        targetMode: 'major',
        targetTonic: 'G',
      }),
    )
  })

  it('switches to the parallel minor key', () => {
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    fireEvent.click(screen.getByRole('button', { name: 'Minor' }))

    expect(
      screen.getByRole('button', { name: 'Display in C minor' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toBe(
      JSON.stringify({
        steps: 0,
        sourceMode: 'major',
        targetMode: 'minor',
        targetTonic: 'C',
      }),
    )
  })

  it('can randomly choose another mode and applies that mode before transposing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(18.1 / 29)
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    fireEvent.click(screen.getByRole('button', { name: 'Random key' }))

    expect(screen.getByRole('button', { name: 'Minor' }).getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Display in C minor' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toBe(
      JSON.stringify({
        steps: 0,
        sourceMode: 'major',
        targetMode: 'minor',
        targetTonic: 'C',
      }),
    )
  })

  it('reports the exact selected key for the session note', () => {
    const recordKey = vi.fn()
    render(() => (
      <SessionExerciseNotation notation={'K:F#\nFGAB|'} format="abc" onRecordKey={recordKey} />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Add F♯ major to note' }))

    expect(recordKey).toHaveBeenCalledWith('F♯ major')
  })
})

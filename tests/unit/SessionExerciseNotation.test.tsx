import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'

vi.mock('../../src/components/ExerciseNotation', () => ({
  ExerciseNotation: (props: {
    clef?: string
    transpose?: {
      steps: number
      sourceMode: string
      targetMode: string
      targetTonic: string
    }
  }) => (
    <output aria-label="Transposition" data-clef={props.clef ?? ''}>
      {JSON.stringify(props.transpose)}
    </output>
  ),
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

  it('resets the display key without resetting other controls', () => {
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    fireEvent.click(screen.getByRole('button', { name: 'Up one octave' }))
    fireEvent.click(screen.getByRole('button', { name: 'Display in G major' }))
    const resetKey = screen.getByRole('button', { name: 'Reset key' })
    expect(resetKey.hasAttribute('disabled')).toBe(false)

    fireEvent.click(resetKey)

    expect(
      screen.getByRole('button', { name: 'Display in C major' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toContain('"steps":12')
    expect(resetKey.hasAttribute('disabled')).toBe(true)
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

  it('allows the current key on the first random roll, then avoids an immediate repeat', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(7.1 / 30)
      .mockReturnValueOnce(0)
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    const randomKey = screen.getByRole('button', { name: 'Random Key' })
    fireEvent.click(randomKey)

    expect(
      screen.getByRole('button', { name: 'Display in C major' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByLabelText('Transposition').textContent).toBe('')

    fireEvent.click(randomKey)

    expect(
      screen.getByRole('button', { name: 'Display in C♭ major' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('can randomly choose another mode and applies that mode before transposing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(19.1 / 30)
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    fireEvent.click(screen.getByRole('button', { name: 'Random Key' }))

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
  it('moves the displayed notation by multiple octaves and resets it', () => {
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    const up = screen.getByRole('button', { name: 'Up one octave' })
    fireEvent.click(up)
    fireEvent.click(up)

    expect(screen.getByText('2 octaves up')).toBeTruthy()
    expect(screen.getByLabelText('Transposition').textContent).toContain('"steps":24')

    fireEvent.click(screen.getByRole('button', { name: 'Down one octave' }))
    expect(screen.getByText('1 octave up')).toBeTruthy()
    expect(screen.getByLabelText('Transposition').textContent).toContain('"steps":12')

    fireEvent.click(screen.getByRole('button', { name: 'Reset octave' }))
    expect(screen.getByText('Original octave')).toBeTruthy()
    expect(screen.getByLabelText('Transposition').textContent).toBe('')
  })

  it('selects a display clef without changing the saved notation', () => {
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    fireEvent.change(screen.getByLabelText('Display clef'), { target: { value: 'bass' } })

    expect(screen.getByLabelText('Transposition').getAttribute('data-clef')).toBe('bass')
  })

  it('hides key controls when notation is read-only', () => {
    render(() => (
      <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" showKeyControls={false} />
    ))

    expect(screen.queryByText('Display key')).toBeNull()
    expect(screen.getByLabelText('Transposition')).toBeTruthy()
  })
  it('automatically shifts the octave when changing clefs', () => {
    render(() => <SessionExerciseNotation notation={'K:C clef=bass\nCDEF|'} format="abc" />)

    fireEvent.change(screen.getByLabelText('Display clef'), { target: { value: 'alto' } })

    expect(screen.getByText('1 octave up')).toBeTruthy()
    expect(screen.getByLabelText('Transposition').textContent).toContain('"steps":12')
  })
  it('randomizes within the mode selected by the Major/Minor toggle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(() => <SessionExerciseNotation notation={'K:C\nCDEF|'} format="abc" />)

    expect(screen.getByRole('button', { name: 'Random Major Key' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Minor' }))

    const randomMinorKey = screen.getByRole('button', { name: 'Random Minor Key' })
    fireEvent.click(randomMinorKey)

    expect(screen.getByRole('button', { name: 'Minor' }).getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Display in A♭ minor' }).getAttribute('aria-pressed'),
    ).toBe('true')
  })
})

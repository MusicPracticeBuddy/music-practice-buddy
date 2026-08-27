import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'

vi.mock('../../src/components/ExerciseNotation', () => ({
  ExerciseNotation: (props: { transpose?: { steps: number; targetTonic: string } }) => (
    <output aria-label="Transposition">{JSON.stringify(props.transpose)}</output>
  ),
}))

import { SessionExerciseNotation } from '@/components/SessionExerciseNotation'

afterEach(cleanup)

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
      JSON.stringify({ steps: -5, targetTonic: 'G' }),
    )
  })
})

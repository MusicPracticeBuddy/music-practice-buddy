import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { PracticePlanOutline } from '@/components/PracticePlanOutline'
import { PRACTICE_ITEM_TYPE } from '@/domain/session'

afterEach(cleanup)

describe('PracticePlanOutline', () => {
  it('collapses sections and expands practice items to show instructions and notation', () => {
    render(() => (
      <PracticePlanOutline
        items={[
          {
            id: 'section-1',
            parentId: null,
            type: PRACTICE_ITEM_TYPE.SECTION,
            name: 'Warm up',
            instruction: 'Stay relaxed.',
            notation: null,
            notationFormat: null,
          },
          {
            id: 'exercise-1',
            parentId: 'section-1',
            type: PRACTICE_ITEM_TYPE.EXERCISE,
            name: 'Long tones',
            instruction: 'Use a steady breath.',
            notation: 'C D E F',
            notationFormat: 'text',
          },
        ]}
      />
    ))

    const sectionButton = screen.getByRole('button', { name: 'Warm up' })
    const exerciseButton = screen.getByRole('button', { name: 'Long tones' })
    expect(sectionButton.getAttribute('aria-expanded')).toBe('true')
    expect(exerciseButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('C D E F')).toBeNull()

    fireEvent.click(exerciseButton)
    expect(screen.getByText('Use a steady breath.')).toBeTruthy()
    expect(screen.getByText('C D E F')).toBeTruthy()

    fireEvent.click(sectionButton)
    expect(sectionButton.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Long tones' })).toBeNull()
  })
})

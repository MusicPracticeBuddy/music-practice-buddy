import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { SessionRepertoireRandomizer } from '@/components/SessionRepertoireRandomizer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SessionRepertoireRandomizer', () => {
  it('selects a random child and reports it for the session note', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const recordChild = vi.fn()
    render(() => (
      <SessionRepertoireRandomizer
        children={[
          { id: '1', title: 'Etude No. 1' },
          { id: '2', title: 'Etude No. 2' },
        ]}
        onRecordChild={recordChild}
      />
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Random child' }))

    expect(screen.getByText('Etude No. 2', { selector: 'strong' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add Etude No. 2 to note' }))
    expect(recordChild).toHaveBeenCalledWith('Etude No. 2')
  })

  it('chooses a different child when randomized repeatedly', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    render(() => (
      <SessionRepertoireRandomizer
        children={[
          { id: '1', title: 'Etude No. 1' },
          { id: '2', title: 'Etude No. 2' },
        ]}
        onRecordChild={() => undefined}
      />
    ))

    const randomButton = screen.getByRole('button', { name: 'Random child' })
    fireEvent.click(randomButton)
    expect(screen.getByText('Etude No. 1', { selector: 'strong' })).toBeTruthy()
    fireEvent.click(randomButton)
    expect(screen.getByText('Etude No. 2', { selector: 'strong' })).toBeTruthy()
  })
})

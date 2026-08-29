import { describe, expect, it } from 'vitest'
import { groupInstrumentOptions, instrumentFamilyLabel } from '@/domain/instrument'

describe('instrument option grouping', () => {
  it('puts preferred instruments first and groups the rest by family', () => {
    const groups = groupInstrumentOptions([
      { id: '1', name: 'Piano', family: 'KEYBOARD', isPreferred: true },
      { id: '2', name: 'Flute', family: 'WOODWIND', isPreferred: false },
      { id: '3', name: 'Trumpet', family: 'BRASS', isPreferred: true },
      { id: '4', name: 'Clarinet', family: 'WOODWIND', isPreferred: false },
    ])

    expect(groups).toEqual([
      {
        label: 'My instruments',
        instruments: [
          { id: '1', name: 'Piano', family: 'KEYBOARD', isPreferred: true },
          { id: '3', name: 'Trumpet', family: 'BRASS', isPreferred: true },
        ],
      },
      {
        label: 'Woodwind',
        instruments: [
          { id: '2', name: 'Flute', family: 'WOODWIND', isPreferred: false },
          { id: '4', name: 'Clarinet', family: 'WOODWIND', isPreferred: false },
        ],
      },
    ])
  })

  it('formats multi-word family names', () => {
    expect(instrumentFamilyLabel('FRETTED_STRING')).toBe('Fretted String')
  })
})

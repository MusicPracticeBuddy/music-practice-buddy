import { describe, expect, it } from 'vitest'
import { appendKeyToSessionNote } from '@/domain/session'

describe('session notes', () => {
  it('adds the first selected key without a leading newline', () => {
    expect(appendKeyToSessionNote('', 'C major')).toBe('In C major: ')
  })

  it('adds subsequent selected keys on new lines', () => {
    expect(appendKeyToSessionNote('In C major: Even tone', 'F♯ minor')).toBe(
      'In C major: Even tone\nIn F♯ minor: ',
    )
    expect(appendKeyToSessionNote('Existing note\n', 'G♭ major')).toBe(
      'Existing note\nIn G♭ major: ',
    )
  })
})

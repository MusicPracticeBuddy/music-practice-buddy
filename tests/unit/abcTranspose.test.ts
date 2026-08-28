import { describe, expect, it } from 'vitest'
import {
  abcClefOctaveShift,
  abcKeyOptions,
  abcTransposeSteps,
  changeAbcClef,
  changeAbcMode,
  parseAbcClef,
  parseAbcKey,
} from '@/domain/abcTranspose'

describe('ABC transposition', () => {
  it('recognizes major and minor key fields but excludes other modes', () => {
    expect(parseAbcKey('X:1\nK:D\nDEFG|')).toEqual(
      expect.objectContaining({ tonic: 'D', mode: 'major', pitchClass: 2, fifths: 2 }),
    )
    expect(parseAbcKey('X:1\nK:F#m clef=treble\nF2 A2|')).toEqual(
      expect.objectContaining({ tonic: 'F#', mode: 'minor', pitchClass: 6, fifths: 3 }),
    )
    expect(parseAbcKey('X:1\nK:D dor\nDEFG|')).toBeNull()
  })

  it('offers destination keys in the same mode', () => {
    const major = parseAbcKey('K:C\nCDEF|')!
    const minor = parseAbcKey('K:Am\nABcd|')!

    expect(abcKeyOptions(major)).toHaveLength(15)
    expect(abcKeyOptions(major).every((key) => key.label.endsWith('major'))).toBe(true)
    expect(abcKeyOptions(major).map((key) => key.tonic)).toEqual(
      expect.arrayContaining(['Gb', 'F#', 'Db', 'C#', 'Cb', 'B']),
    )
    expect(abcKeyOptions(minor)).toHaveLength(15)
    expect(abcKeyOptions(minor).every((key) => key.label.endsWith('minor'))).toBe(true)
  })

  it('uses the shortest interval with centered ranking for tritone ties', () => {
    const cMajor = parseAbcKey('K:C\nCDEF|')!
    const gMajor = parseAbcKey('K:G\nGABc|')!
    const fSharpMajor = parseAbcKey('K:F#\nFGA B|')!
    const gFlatMajor = parseAbcKey('K:Gb\nGAB c|')!

    expect(abcTransposeSteps(cMajor, gMajor)).toBe(-5)
    expect(abcTransposeSteps(gMajor, cMajor)).toBe(5)
    expect(abcTransposeSteps(cMajor, fSharpMajor)).toBe(6)
    expect(abcTransposeSteps(cMajor, gFlatMajor)).toBe(6)
    expect(fSharpMajor.id).not.toBe(gFlatMajor.id)
    expect(abcTransposeSteps(fSharpMajor, cMajor)).toBe(-6)
  })

  it('changes the display clef while preserving the key and comments', () => {
    expect(changeAbcClef('X:1\nK:C clef=treble % exercise\nCDEF|', 'bass')).toBe(
      'X:1\nK:C clef=bass % exercise\nCDEF|',
    )
    expect(changeAbcClef('X:1\nK:Dm\nDEFG|', 'tenor')).toContain('K:Dm clef=tenor')
  })

  it('changes the displayed mode without modifying the source tonic or other key fields', () => {
    expect(changeAbcMode('X:1\nK:C major clef=bass\nCDEF|', 'minor')).toBe(
      'X:1\nK:Cm clef=bass\nCDEF|',
    )
    expect(changeAbcMode('X:1\nK:Cm clef=bass\nCDEF|', 'major')).toBe('X:1\nK:C clef=bass\nCDEF|')
  })
  it('parses clefs and maps ledger-line-saving octave shifts', () => {
    expect(parseAbcClef('K:C clef=bass\nCDEF|')).toBe('bass')
    expect(parseAbcClef('K:C tenor\nCDEF|')).toBe('tenor')
    expect(parseAbcClef('K:C\nCDEF|')).toBeNull()

    expect([
      abcClefOctaveShift('bass', 'alto'),
      abcClefOctaveShift('bass', 'treble'),
      abcClefOctaveShift('tenor', 'treble'),
      abcClefOctaveShift('alto', 'bass'),
      abcClefOctaveShift('treble', 'tenor'),
      abcClefOctaveShift('treble', 'bass'),
    ]).toEqual([1, 1, 1, -1, -1, -1])
    expect(abcClefOctaveShift('alto', 'treble')).toBe(0)
  })
})

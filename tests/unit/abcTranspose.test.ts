import { describe, expect, it } from 'vitest'
import { abcKeyOptions, abcTransposeSteps, parseAbcKey } from '@/domain/abcTranspose'

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
})

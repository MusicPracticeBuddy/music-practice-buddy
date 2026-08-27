export type AbcKeyMode = 'major' | 'minor'

export type AbcKey = {
  id: string
  tonic: string
  label: string
  mode: AbcKeyMode
  pitchClass: number
  fifths: number
}

const MAJOR_KEYS = createKeys('major', [
  ['Cb', 11],
  ['Gb', 6],
  ['Db', 1],
  ['Ab', 8],
  ['Eb', 3],
  ['Bb', 10],
  ['F', 5],
  ['C', 0],
  ['G', 7],
  ['D', 2],
  ['A', 9],
  ['E', 4],
  ['B', 11],
  ['F#', 6],
  ['C#', 1],
])

const MINOR_KEYS = createKeys('minor', [
  ['Ab', 8],
  ['Eb', 3],
  ['Bb', 10],
  ['F', 5],
  ['C', 0],
  ['G', 7],
  ['D', 2],
  ['A', 9],
  ['E', 4],
  ['B', 11],
  ['F#', 6],
  ['C#', 1],
  ['G#', 8],
  ['D#', 3],
  ['A#', 10],
])

const MAJOR_MODES = new Set(['', 'maj', 'major'])
const MINOR_MODES = new Set(['m', 'min', 'minor'])
const OTHER_MODES = new Set([
  'dor',
  'dorian',
  'phr',
  'phrygian',
  'lyd',
  'lydian',
  'mix',
  'mixolydian',
  'loc',
  'locrian',
])

function createKeys(mode: AbcKeyMode, definitions: Array<[string, number]>): AbcKey[] {
  return definitions.map(([tonic, pitchClass], index) => ({
    id: `${tonic}:${mode}`,
    tonic,
    label: `${tonic.replace('b', '♭').replace('#', '♯')} ${mode}`,
    mode,
    pitchClass,
    fifths: index - 7,
  }))
}

export function parseAbcKey(notation: string): AbcKey | null {
  const keyLine = notation.match(/^K:\s*([^%\r\n]+)/m)?.[1]?.trim()
  if (!keyLine) return null

  const [keyToken, followingToken = ''] = keyLine.split(/\s+/)
  const match = keyToken?.match(/^([A-Ga-g])([#b]?)(major|maj|minor|min|m)?$/i)
  if (!match) return null

  const tonic = `${match[1]?.toUpperCase()}${match[2] ?? ''}`
  let modeToken = (match[3] ?? '').toLowerCase()
  const normalizedFollowingToken = followingToken.toLowerCase()
  if (
    !modeToken &&
    (MAJOR_MODES.has(normalizedFollowingToken) || MINOR_MODES.has(normalizedFollowingToken))
  ) {
    modeToken = normalizedFollowingToken
  } else if (!modeToken && OTHER_MODES.has(normalizedFollowingToken)) {
    return null
  }

  const mode = MINOR_MODES.has(modeToken) ? 'minor' : MAJOR_MODES.has(modeToken) ? 'major' : null
  if (!mode) return null

  return (mode === 'major' ? MAJOR_KEYS : MINOR_KEYS).find((key) => key.tonic === tonic) ?? null
}

export function abcKeyOptions(source: AbcKey): AbcKey[] {
  return source.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS
}

function centeredRank(pitchClass: number, mode: AbcKeyMode) {
  const center = mode === 'major' ? 0 : 9
  const rank = (pitchClass - center + 12) % 12
  return rank > 6 ? rank - 12 : rank
}

export function abcTransposeSteps(source: AbcKey, target: AbcKey) {
  let steps = (target.pitchClass - source.pitchClass + 12) % 12
  if (steps > 6) steps -= 12
  if (
    steps === 6 &&
    centeredRank(target.pitchClass, source.mode) < centeredRank(source.pitchClass, source.mode)
  ) {
    steps = -6
  }
  return steps
}

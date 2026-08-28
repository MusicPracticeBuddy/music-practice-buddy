import { For, Show, createEffect, createSignal, createUniqueId } from 'solid-js'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import {
  abcClefOctaveShift,
  abcKeyOptionsForMode,
  abcTransposeSteps,
  parseAbcClef,
  parseAbcKey,
  type AbcClef,
  type AbcKeyMode,
} from '@/domain/abcTranspose'
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise'

type SessionExerciseNotationProps = {
  notation: string
  format: string | null
  onRecordKey?: (keyLabel: string) => void
  showKeyControls?: boolean
}

const ABC_CLEF_OPTIONS: Array<{ value: AbcClef; label: string }> = [
  { value: 'treble', label: 'Treble' },
  { value: 'alto', label: 'Alto' },
  { value: 'tenor', label: 'Tenor' },
  { value: 'bass', label: 'Bass' },
]

export function SessionExerciseNotation(props: SessionExerciseNotationProps) {
  const labelId = `session-notation-key-${createUniqueId()}`
  const sourceKey = () =>
    props.format === EXERCISE_NOTATION_FORMAT.ABC ? parseAbcKey(props.notation) : null
  const sourceClef = () => parseAbcClef(props.notation) ?? 'treble'
  const [targetKeyId, setTargetKeyId] = createSignal<string | null>(null)
  const [displayMode, setDisplayMode] = createSignal<AbcKeyMode>('major')
  const [octaveShift, setOctaveShift] = createSignal(0)
  const [displayClef, setDisplayClef] = createSignal<AbcClef | null>(null)
  const [hasRandomizedKey, setHasRandomizedKey] = createSignal(false)
  let previousSource = ''

  createEffect(() => {
    const sourceSignature = `${props.format}\u0000${props.notation}\u0000${props.showKeyControls}`
    if (sourceSignature === previousSource) return
    previousSource = sourceSignature
    const source = sourceKey()
    setDisplayMode(source?.mode ?? 'major')
    setTargetKeyId(source?.id ?? null)
    setOctaveShift(0)
    setDisplayClef(null)
    setHasRandomizedKey(false)
  })

  const options = () => (sourceKey() ? abcKeyOptionsForMode(displayMode()) : [])
  const targetKey = () => {
    const source = sourceKey()
    return (
      options().find((key) => key.id === targetKeyId()) ??
      options().find((key) => key.pitchClass === source?.pitchClass) ??
      options()[7]
    )
  }
  const selectedIndex = () => options().findIndex((key) => key.id === targetKey()?.id)
  const visibleKeys = () => {
    const index = selectedIndex()
    return [-2, -1, 0, 1, 2].map((offset) => options()[index + offset] ?? null)
  }
  const octaveLabel = () => {
    const shift = octaveShift()
    if (shift === 0) return 'Original octave'
    const distance = Math.abs(shift)
    return distance + ' octave' + (distance === 1 ? '' : 's') + (shift > 0 ? ' up' : ' down')
  }
  const transpose = () => {
    const source = sourceKey()
    const target = targetKey()
    const keySteps = source && target ? abcTransposeSteps(source, target) : 0
    return source && target && (source.id !== target.id || octaveShift() !== 0)
      ? {
          steps: keySteps + octaveShift() * 12,
          sourceMode: source.mode,
          targetMode: target.mode,
          targetTonic: target.tonic,
        }
      : undefined
  }

  function selectClef(clef: AbcClef | null) {
    const from = displayClef() ?? sourceClef()
    const to = clef ?? sourceClef()
    setDisplayClef(clef)
    setOctaveShift((value) => value + abcClefOctaveShift(from, to))
  }

  function selectMode(mode: AbcKeyMode) {
    if (mode === displayMode()) return
    const current = targetKey()
    const nextOptions = abcKeyOptionsForMode(mode)
    const parallelKey = nextOptions.find((key) => key.tonic === current?.tonic)
    const enharmonicKey = nextOptions.find((key) => key.pitchClass === current?.pitchClass)
    const nextKey = parallelKey ?? enharmonicKey ?? nextOptions[7]
    setDisplayMode(mode)
    setTargetKeyId(nextKey?.id ?? null)
  }

  function resetKey() {
    const source = sourceKey()
    if (!source) return
    setDisplayMode(source.mode)
    setTargetKeyId(source.id)
  }

  function moveSelection(offset: number) {
    const target = options()[selectedIndex() + offset]
    if (target) setTargetKeyId(target.id)
  }

  function selectRandomKey() {
    const current = targetKey()
    const allKeys = [...abcKeyOptionsForMode('major'), ...abcKeyOptionsForMode('minor')]
    const candidates = hasRandomizedKey()
      ? allKeys.filter((key) => key.id !== current?.id)
      : allKeys
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    if (!target) return
    setHasRandomizedKey(true)
    setDisplayMode(target.mode)
    setTargetKeyId(target.id)
  }

  return (
    <div>
      <Show when={sourceKey() && (props.showKeyControls ?? true)}>
        <div class="session-notation-transpose">
          <div class="session-notation-transpose-header">
            <span class="field-label" id={labelId}>
              Display key
            </span>
            <small>Display only · the saved ABC notation is unchanged</small>
          </div>
          <div class="key-mode-actions">
            <div class="key-mode-switch" role="group" aria-label="Key mode">
              <button
                type="button"
                aria-pressed={displayMode() === 'major'}
                onClick={() => selectMode('major')}
              >
                Major
              </button>
              <button
                type="button"
                aria-pressed={displayMode() === 'minor'}
                onClick={() => selectMode('minor')}
              >
                Minor
              </button>
            </div>
            <div class="key-utility-actions">
              <button
                class="secondary-button random-key-button"
                type="button"
                onClick={selectRandomKey}
              >
                Random key
              </button>
              <button
                class="secondary-button"
                type="button"
                disabled={sourceKey()?.id === targetKey()?.id}
                onClick={resetKey}
              >
                Reset key
              </button>
              <Show when={props.onRecordKey && targetKey()}>
                <button
                  class="secondary-button record-key-button"
                  type="button"
                  onClick={() => {
                    const target = targetKey()
                    if (target) props.onRecordKey?.(target.label)
                  }}
                >
                  Add {targetKey()?.label} to note
                </button>
              </Show>
            </div>
          </div>
          <div class="key-carousel" role="group" aria-labelledby={labelId}>
            <button
              class="key-carousel-arrow"
              type="button"
              aria-label="Previous key on the circle of fifths"
              disabled={selectedIndex() <= 0}
              onClick={() => moveSelection(-1)}
            >
              ‹
            </button>
            <div class="key-carousel-window">
              <For each={visibleKeys()}>
                {(key) => (
                  <Show when={key} fallback={<span class="key-carousel-placeholder" />}>
                    {(option) => (
                      <button
                        classList={{
                          'key-carousel-key': true,
                          'key-carousel-key-selected': option().id === targetKey()?.id,
                        }}
                        type="button"
                        aria-label={`Display in ${option().label}`}
                        aria-pressed={option().id === targetKey()?.id}
                        onClick={() => setTargetKeyId(option().id)}
                      >
                        <strong>{option().tonic.replace('b', '♭').replace('#', '♯')}</strong>
                        <small>{option().mode}</small>
                      </button>
                    )}
                  </Show>
                )}
              </For>
            </div>
            <button
              class="key-carousel-arrow"
              type="button"
              aria-label="Next key on the circle of fifths"
              disabled={selectedIndex() >= options().length - 1}
              onClick={() => moveSelection(1)}
            >
              ›
            </button>
          </div>
          <div class="notation-display-adjustments">
            <fieldset class="notation-octave-control">
              <legend class="field-label">Display octave</legend>
              <div class="notation-octave-stepper" role="group" aria-label="Display octave">
                <button
                  class="key-carousel-arrow"
                  type="button"
                  aria-label="Down one octave"
                  onClick={() => setOctaveShift((value) => value - 1)}
                >
                  ↓
                </button>
                <output class="octave-shift-value" aria-live="polite">
                  {octaveLabel()}
                </output>
                <button
                  class="key-carousel-arrow"
                  type="button"
                  aria-label="Up one octave"
                  onClick={() => setOctaveShift((value) => value + 1)}
                >
                  ↑
                </button>
                <button
                  class="text-button octave-reset-button"
                  type="button"
                  disabled={octaveShift() === 0}
                  onClick={() => setOctaveShift(0)}
                >
                  Reset octave
                </button>
              </div>
            </fieldset>
            <label class="notation-clef-control">
              <span class="field-label">Display clef</span>
              <select
                class="text-input"
                value={displayClef() ?? ''}
                onChange={(event) =>
                  selectClef((event.currentTarget.value || null) as AbcClef | null)
                }
              >
                <option value="">Original clef</option>
                <For each={ABC_CLEF_OPTIONS}>
                  {(clef) => <option value={clef.value}>{clef.label}</option>}
                </For>
              </select>
            </label>
          </div>
        </div>
      </Show>
      <ExerciseNotation
        notation={props.notation}
        format={props.format}
        transpose={transpose()}
        clef={displayClef()}
      />
    </div>
  )
}

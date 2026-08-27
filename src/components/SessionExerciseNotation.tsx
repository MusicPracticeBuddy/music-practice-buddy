import { For, Show, createEffect, createSignal, createUniqueId } from 'solid-js'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import {
  abcKeyOptionsForMode,
  abcTransposeSteps,
  parseAbcKey,
  type AbcKeyMode,
} from '@/domain/abcTranspose'
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise'

type SessionExerciseNotationProps = {
  notation: string
  format: string | null
}

export function SessionExerciseNotation(props: SessionExerciseNotationProps) {
  const labelId = `session-notation-key-${createUniqueId()}`
  const sourceKey = () =>
    props.format === EXERCISE_NOTATION_FORMAT.ABC ? parseAbcKey(props.notation) : null
  const [targetKeyId, setTargetKeyId] = createSignal<string | null>(null)
  const [displayMode, setDisplayMode] = createSignal<AbcKeyMode>('major')
  let previousSource = ''

  createEffect(() => {
    const sourceSignature = `${props.format}\u0000${props.notation}`
    if (sourceSignature === previousSource) return
    previousSource = sourceSignature
    const source = sourceKey()
    setDisplayMode(source?.mode ?? 'major')
    setTargetKeyId(source?.id ?? null)
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
  const transpose = () => {
    const source = sourceKey()
    const target = targetKey()
    return source && target && source.id !== target.id
      ? {
          steps: abcTransposeSteps(source, target),
          sourceMode: source.mode,
          targetMode: target.mode,
          targetTonic: target.tonic,
        }
      : undefined
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

  function moveSelection(offset: number) {
    const target = options()[selectedIndex() + offset]
    if (target) setTargetKeyId(target.id)
  }

  function selectRandomKey() {
    const current = targetKey()
    const candidates = [...abcKeyOptionsForMode('major'), ...abcKeyOptionsForMode('minor')].filter(
      (key) => key.id !== current?.id,
    )
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    if (!target) return
    setDisplayMode(target.mode)
    setTargetKeyId(target.id)
  }

  return (
    <div>
      <Show when={sourceKey()}>
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
            <button
              class="secondary-button random-key-button"
              type="button"
              onClick={selectRandomKey}
            >
              Random key
            </button>
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
        </div>
      </Show>
      <ExerciseNotation notation={props.notation} format={props.format} transpose={transpose()} />
    </div>
  )
}

import { For, Show, createEffect, createSignal, createUniqueId } from 'solid-js'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import { abcKeyOptions, abcTransposeSteps, parseAbcKey } from '@/domain/abcTranspose'
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
  let previousSource = ''

  createEffect(() => {
    const sourceSignature = `${props.format}\u0000${props.notation}`
    if (sourceSignature === previousSource) return
    previousSource = sourceSignature
    setTargetKeyId(sourceKey()?.id ?? null)
  })

  const options = () => {
    const source = sourceKey()
    return source ? abcKeyOptions(source) : []
  }
  const targetKey = () => {
    const source = sourceKey()
    return options().find((key) => key.id === targetKeyId()) ?? source
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
      ? { steps: abcTransposeSteps(source, target), targetTonic: target.tonic }
      : undefined
  }

  function moveSelection(offset: number) {
    const target = options()[selectedIndex() + offset]
    if (target) setTargetKeyId(target.id)
  }

  return (
    <div>
      <Show when={sourceKey()}>
        {(source) => (
          <div class="session-notation-transpose">
            <div class="session-notation-transpose-header">
              <span class="field-label" id={labelId}>
                Display key
              </span>
              <small>Display only · the saved ABC notation is unchanged</small>
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
                          <small>{source().mode}</small>
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
        )}
      </Show>
      <ExerciseNotation notation={props.notation} format={props.format} transpose={transpose()} />
    </div>
  )
}

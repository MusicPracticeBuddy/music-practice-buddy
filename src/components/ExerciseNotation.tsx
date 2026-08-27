import { createEffect, onCleanup, onMount } from 'solid-js'
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise'

type ExerciseNotationProps = {
  notation: string
  format: string | null
  transpose?: {
    steps: number
    targetTonic: string
  }
}

function notationForTransposition(notation: string) {
  return /^X:/m.test(notation)
    ? { notation, addedReference: false }
    : { notation: `X:1\n${notation}`, addedReference: true }
}

export function ExerciseNotation(props: ExerciseNotationProps) {
  let scoreElement: HTMLDivElement | undefined

  onMount(() => {
    let active = true
    let renderVersion = 0

    createEffect(() => {
      const format = props.format
      const notation = props.notation
      const transpose = props.transpose
      const target = scoreElement
      const version = ++renderVersion

      if (!target) return
      if (format !== EXERCISE_NOTATION_FORMAT.ABC) {
        target.replaceChildren()
        return
      }

      const transposer = transpose ? import('abc-notation-transposition') : Promise.resolve(null)
      void Promise.all([import('abcjs'), transposer]).then(
        ([{ default: abcjs }, transposeModule]) => {
          if (!active || version !== renderVersion) return
          let renderedNotation = notation
          if (transpose && transposeModule) {
            try {
              const source = notationForTransposition(notation)
              const prefersFlats = transpose.targetTonic.includes('b')
              const prefersSharps = transpose.targetTonic.includes('#')
              renderedNotation = transposeModule.transposeABC(source.notation, transpose.steps, {
                accidentalNumberPreference:
                  prefersFlats || prefersSharps
                    ? transposeModule.ACCIDENTAL_NUMBER_PREFERENCES.NO_PREFERENCE
                    : transposeModule.ACCIDENTAL_NUMBER_PREFERENCES.PREFER_FEWER,
                preferSharpsOrFlats: prefersFlats
                  ? transposeModule.SHARPS_OR_FLATS_PREFERENCES.PREFER_FLATS
                  : prefersSharps
                    ? transposeModule.SHARPS_OR_FLATS_PREFERENCES.PREFER_SHARPS
                    : transposeModule.SHARPS_OR_FLATS_PREFERENCES.PRESERVE_ORIGINAL,
              })
              if (source.addedReference) {
                renderedNotation = renderedNotation.replace(/^X:1\r?\n/, '')
              }
            } catch {
              renderedNotation = notation
            }
          }
          abcjs.renderAbc(target, renderedNotation, { responsive: 'resize' })
        },
      )
    })

    onCleanup(() => {
      active = false
    })
  })

  return (
    <div class="notation-block">
      <span>{props.format === EXERCISE_NOTATION_FORMAT.ABC ? 'ABC notation' : 'Text'}</span>
      <p hidden={props.format === EXERCISE_NOTATION_FORMAT.ABC}>{props.notation}</p>
      <div
        class="abc-notation"
        aria-label="Rendered music notation"
        hidden={props.format !== EXERCISE_NOTATION_FORMAT.ABC}
        ref={(element) => {
          scoreElement = element
        }}
      />
    </div>
  )
}

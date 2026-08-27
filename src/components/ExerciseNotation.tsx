import { createEffect, onCleanup, onMount } from 'solid-js'
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise'

type ExerciseNotationProps = {
  notation: string
  format: string | null
}

export function ExerciseNotation(props: ExerciseNotationProps) {
  let scoreElement: HTMLDivElement | undefined

  onMount(() => {
    let active = true
    let renderVersion = 0

    createEffect(() => {
      const format = props.format
      const notation = props.notation
      const target = scoreElement
      const version = ++renderVersion

      if (!target) return
      if (format !== EXERCISE_NOTATION_FORMAT.ABC) {
        target.replaceChildren()
        return
      }

      void import('abcjs').then(({ default: abcjs }) => {
        if (!active || version !== renderVersion) return
        abcjs.renderAbc(target, notation, { responsive: 'resize' })
      })
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

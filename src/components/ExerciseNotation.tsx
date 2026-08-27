import { Show, onCleanup, onMount } from 'solid-js'
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise'

type ExerciseNotationProps = {
  notation: string
  format: string | null
}

export function ExerciseNotation(props: ExerciseNotationProps) {
  let scoreElement: HTMLDivElement | undefined

  onMount(() => {
    if (props.format !== EXERCISE_NOTATION_FORMAT.ABC || !scoreElement) return

    let active = true
    const target = scoreElement

    void import('abcjs').then(({ default: abcjs }) => {
      if (!active) return
      abcjs.renderAbc(target, props.notation, { responsive: 'resize' })
    })

    onCleanup(() => {
      active = false
    })
  })

  return (
    <div class="notation-block">
      <span>{props.format === EXERCISE_NOTATION_FORMAT.ABC ? 'ABC notation' : 'Text'}</span>
      <Show when={props.format === EXERCISE_NOTATION_FORMAT.ABC} fallback={<p>{props.notation}</p>}>
        <div
          class="abc-notation"
          aria-label="Rendered music notation"
          ref={(element) => {
            scoreElement = element
          }}
        />
      </Show>
    </div>
  )
}

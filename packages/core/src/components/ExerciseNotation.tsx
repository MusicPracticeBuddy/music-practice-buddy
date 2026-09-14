import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { changeAbcClef, changeAbcMode, type AbcClef, type AbcKeyMode } from '@/domain/abcTranspose';
import { EXERCISE_NOTATION_FORMAT } from '@/domain/exercise';

type ExerciseNotationProps = {
  notation: string;
  format: string | null;
  clef?: AbcClef | null;
  transpose?: {
    steps: number;
    sourceMode: AbcKeyMode;
    targetMode: AbcKeyMode;
    targetTonic: string;
  };
};

function notationForTransposition(notation: string) {
  return /^X:/m.test(notation)
    ? { notation, addedReference: false }
    : { notation: `X:1\n${notation}`, addedReference: true };
}

export function ExerciseNotation(props: ExerciseNotationProps) {
  let scoreElement: HTMLDivElement | undefined;
  const [renderedSource, setRenderedSource] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  async function copyRenderedSource() {
    const source = renderedSource();
    if (source === null) return;
    await navigator.clipboard.writeText(source);
    setCopied(true);
  }

  onMount(() => {
    let active = true;
    let renderVersion = 0;

    createEffect(() => {
      const format = props.format;
      const notation = props.notation;
      const transpose = props.transpose;
      const clef = props.clef;
      const target = scoreElement;
      const version = ++renderVersion;

      if (!target) return;
      if (format !== EXERCISE_NOTATION_FORMAT.ABC) {
        setRenderedSource(null);
        target.replaceChildren();
        return;
      }

      const transposer = transpose ? import('abc-notation-transposition') : Promise.resolve(null);
      void Promise.all([import('abcjs'), transposer]).then(
        ([{ default: abcjs }, transposeModule]) => {
          if (!active || version !== renderVersion) return;
          let renderedNotation = notation;
          if (transpose && transposeModule) {
            try {
              const notationInTargetMode =
                transpose.sourceMode === transpose.targetMode
                  ? notation
                  : changeAbcMode(notation, transpose.targetMode);
              const source = notationForTransposition(notationInTargetMode);
              const prefersFlats = transpose.targetTonic.includes('b');
              const prefersSharps = transpose.targetTonic.includes('#');
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
              });
              if (source.addedReference) {
                renderedNotation = renderedNotation.replace(/^X:1\r?\n/, '');
              }
            } catch {
              renderedNotation = notation;
            }
          }
          if (clef) renderedNotation = changeAbcClef(renderedNotation, clef);
          setRenderedSource(renderedNotation);
          setCopied(false);
          abcjs.renderAbc(target, renderedNotation, { responsive: 'resize' });
        },
      );
    });

    onCleanup(() => {
      active = false;
    });
  });

  return (
    <div class="notation-block">
      <p hidden={props.format === EXERCISE_NOTATION_FORMAT.ABC}>{props.notation}</p>
      <Show when={props.format === EXERCISE_NOTATION_FORMAT.ABC && renderedSource() !== null}>
        <div class="abc-copy-control">
          <Show when={copied()}>
            <span class="abc-copy-status" role="status">
              Copied!
            </span>
          </Show>
          <button
            class="abc-copy-button"
            type="button"
            aria-label={copied() ? 'ABC notation copied' : 'Copy ABC notation to clipboard'}
            title={copied() ? 'Copied' : 'Copy ABC notation'}
            onClick={() => void copyRenderedSource()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 7V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              <rect x="3" y="8" width="13" height="13" rx="2" />
            </svg>
          </button>
        </div>
      </Show>
      <div
        class="abc-notation"
        aria-label="Rendered music notation"
        hidden={props.format !== EXERCISE_NOTATION_FORMAT.ABC}
        ref={(element) => {
          scoreElement = element;
        }}
      />
    </div>
  );
}

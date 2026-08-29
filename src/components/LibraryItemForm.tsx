import { For, Show, createEffect, createSignal, type JSX } from 'solid-js'
import { Link, useNavigate, useRouter } from '@tanstack/solid-router'
import { ExerciseNotation } from '@/components/ExerciseNotation'
import { InstrumentSelect } from '@/components/InstrumentFields'
import { createExercise, updateExercise, type ExerciseInput } from '@/data/exercises'
import { EXERCISE_NOTATION_FORMAT, type ExerciseNotationFormat } from '@/domain/exercise'
import { groupInstrumentOptions } from '@/domain/instrument'
import {
  createRepertoire,
  updateRepertoire,
  type InstrumentOption,
  type RepertoireCreditInput,
  type RepertoireInput,
  type RepertoireInstrumentInput,
  type RepertoireResourceInput,
} from '@/data/repertoire'

type LibraryItemFormProps = {
  kind: 'exercise' | 'repertoire'
  id?: string
  name?: string
  compositionYear?: number | null
  notation?: string | null
  notationFormat?: ExerciseNotationFormat
  instrumentId?: string | null
  visibility?: 'PRIVATE' | 'PUBLIC'
  credits?: RepertoireCreditInput[]
  instruments?: RepertoireInstrumentInput[]
  resources?: RepertoireResourceInput[]
  instrumentOptions?: InstrumentOption[]
  embedded?: boolean
  beforeFields?: JSX.Element
  afterFields?: JSX.Element
  cancelAction?: JSX.Element
  submitLabel?: string
  onSaved?: (item: {
    id: string
    type: 'EXERCISE' | 'REPERTOIRE'
    name: string
    detail: string
  }) => void | Promise<void>
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'The library item could not be saved.'
}

export function LibraryItemForm(props: LibraryItemFormProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const editing = () => props.id !== undefined
  const label = () => (props.kind === 'exercise' ? 'exercise' : 'repertoire')
  const [name, setName] = createSignal(props.name ?? '')
  const [compositionYear, setCompositionYear] = createSignal(
    props.compositionYear?.toString() ?? '',
  )
  const [notation, setNotation] = createSignal(props.notation ?? '')
  const [notationFormat, setNotationFormat] = createSignal<ExerciseNotationFormat>(
    props.notationFormat ?? EXERCISE_NOTATION_FORMAT.TEXT,
  )
  const [visibility, setVisibility] = createSignal<'PRIVATE' | 'PUBLIC'>(
    props.visibility ?? 'PRIVATE',
  )
  const [instrumentId, setInstrumentId] = createSignal(props.instrumentId ?? '')
  const [credits, setCredits] = createSignal<RepertoireCreditInput[]>(props.credits ?? [])
  const [instruments, setInstruments] = createSignal<RepertoireInstrumentInput[]>(
    props.instruments ?? [],
  )
  const [resources, setResources] = createSignal<RepertoireResourceInput[]>(props.resources ?? [])
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')

  createEffect(() => {
    setName(props.name ?? '')
    setCompositionYear(props.compositionYear?.toString() ?? '')
    setNotation(props.notation ?? '')
    setNotationFormat(props.notationFormat ?? EXERCISE_NOTATION_FORMAT.TEXT)
    setVisibility(props.visibility ?? 'PRIVATE')
    setInstrumentId(props.instrumentId ?? '')
    setCredits(props.credits ?? [])
    setInstruments(props.instruments ?? [])
    setResources(props.resources ?? [])
  })

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (props.kind === 'exercise') {
        const data: ExerciseInput = {
          name: name(),
          notation: notation(),
          notationFormat: notationFormat(),
          visibility: visibility(),
          instrumentId: instrumentId() || null,
        }
        const result = props.id
          ? await updateExercise({ data: { id: props.id, ...data } })
          : await createExercise({ data })
        if (props.onSaved) {
          await props.onSaved({
            id: result.id,
            type: 'EXERCISE',
            name: data.name.trim(),
            detail: data.notation.trim() ? 'Exercise · with notation' : 'Exercise',
          })
          return
        }
        await router.invalidate({ sync: true })
        await navigate({ to: '/exercises/$exerciseId', params: { exerciseId: result.id } })
      } else {
        const data: RepertoireInput = {
          title: name(),
          compositionYear: compositionYear() ? Number(compositionYear()) : null,
          visibility: visibility(),
          credits: credits(),
          instruments: instruments(),
          resources: resources(),
        }
        const result = props.id
          ? await updateRepertoire({ data: { id: props.id, ...data } })
          : await createRepertoire({ data })
        if (props.onSaved) {
          await props.onSaved({
            id: result.id,
            type: 'REPERTOIRE',
            name: data.title.trim(),
            detail: 'Repertoire',
          })
          return
        }
        await router.invalidate({ sync: true })
        await navigate({
          to: '/repertoire/$repertoireId',
          params: { repertoireId: result.id },
        })
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const form = (
    <form classList={{ 'creation-form': !props.embedded }} onSubmit={submit}>
      {props.beforeFields}
      <label class="field-label" for="library-item-name">
        {props.kind === 'exercise' ? 'Name' : 'Title'}
      </label>
      <input
        id="library-item-name"
        class="text-input"
        value={name()}
        onInput={(event) => setName(event.currentTarget.value)}
        maxlength={props.kind === 'exercise' ? 200 : 300}
        required
      />

      <Show when={props.kind === 'repertoire'}>
        <label class="field-label" for="repertoire-composition-year">
          Composition or publication year (optional)
        </label>
        <input
          id="repertoire-composition-year"
          class="text-input"
          type="number"
          min="-9999"
          max="9999"
          step="1"
          value={compositionYear()}
          onInput={(event) => setCompositionYear(event.currentTarget.value)}
        />
      </Show>

      <Show when={props.kind === 'exercise'}>
        <InstrumentSelect
          id="exercise-instrument"
          instruments={props.instrumentOptions ?? []}
          value={instrumentId()}
          onChange={setInstrumentId}
        />

        <label class="field-label" for="exercise-instructions">
          Instructions or notation (optional)
        </label>
        <textarea
          id="exercise-instructions"
          class="text-input"
          rows="7"
          value={notation()}
          onInput={(event) => setNotation(event.currentTarget.value)}
        />

        <label class="field-label" for="exercise-notation-format">
          Notation format
        </label>
        <select
          id="exercise-notation-format"
          class="text-input"
          value={notationFormat()}
          onChange={(event) =>
            setNotationFormat(event.currentTarget.value as ExerciseNotationFormat)
          }
        >
          <option value={EXERCISE_NOTATION_FORMAT.TEXT}>Text</option>
          <option value={EXERCISE_NOTATION_FORMAT.ABC}>ABC notation</option>
        </select>

        <Show when={notationFormat() === EXERCISE_NOTATION_FORMAT.ABC}>
          <section class="exercise-notation-preview" aria-labelledby="exercise-preview-heading">
            <p class="eyebrow" id="exercise-preview-heading">
              Preview
            </p>
            <Show
              when={notation().trim()}
              fallback={<p class="muted">Enter ABC notation above to preview the score.</p>}
            >
              <ExerciseNotation notation={notation()} format={EXERCISE_NOTATION_FORMAT.ABC} />
            </Show>
          </section>
        </Show>
      </Show>

      <Show when={props.kind === 'repertoire'}>
        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Credits</h2>
              <p>Composers, arrangers, editors, and other contributors.</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              onClick={() => setCredits((items) => [...items, { person: '', role: 'COMPOSER' }])}
            >
              + Add credit
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <For each={credits()}>
              {(credit, index) => (
                <div class="repertoire-editor-row credit-row">
                  <input
                    class="text-input"
                    value={credit.person}
                    aria-label={`Credit ${index() + 1} name`}
                    placeholder="Person name"
                    maxlength="200"
                    required
                    onInput={(event) =>
                      setCredits((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, person: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <select
                    class="text-input"
                    value={credit.role}
                    aria-label={`Credit ${index() + 1} role`}
                    onChange={(event) =>
                      setCredits((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? {
                                ...item,
                                role: event.currentTarget.value as RepertoireCreditInput['role'],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="COMPOSER">Composer</option>
                    <option value="ARRANGER">Arranger</option>
                    <option value="EDITOR">Editor</option>
                    <option value="TRANSCRIBER">Transcriber</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove credit ${index() + 1}`}
                    onClick={() =>
                      setCredits((items) => items.filter((_, itemIndex) => itemIndex !== index()))
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Instrumentation</h2>
              <p>Instruments, their roles, and optional part names.</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              disabled={(props.instrumentOptions?.length ?? 0) === 0}
              onClick={() => {
                const firstInstrument = props.instrumentOptions?.[0]
                if (!firstInstrument) return
                setInstruments((items) => [
                  ...items,
                  { instrumentId: firstInstrument.id, role: 'SOLO', partName: null },
                ])
              }}
            >
              + Add instrument
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <For each={instruments()}>
              {(instrument, index) => (
                <div class="repertoire-editor-row instrument-row">
                  <select
                    class="text-input"
                    value={instrument.instrumentId}
                    aria-label={`Instrument ${index() + 1}`}
                    onChange={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, instrumentId: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <For each={groupInstrumentOptions(props.instrumentOptions ?? [])}>
                      {(group) => (
                        <optgroup label={group.label}>
                          <For each={group.instruments}>
                            {(option) => <option value={option.id}>{option.name}</option>}
                          </For>
                        </optgroup>
                      )}
                    </For>
                  </select>
                  <select
                    class="text-input"
                    value={instrument.role}
                    aria-label={`Instrument ${index() + 1} role`}
                    onChange={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? {
                                ...item,
                                role: event.currentTarget
                                  .value as RepertoireInstrumentInput['role'],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="SOLO">Solo</option>
                    <option value="ACCOMPANIMENT">Accompaniment</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    class="text-input"
                    value={instrument.partName ?? ''}
                    aria-label={`Instrument ${index() + 1} part name`}
                    placeholder="Part name (optional)"
                    maxlength="200"
                    onInput={(event) =>
                      setInstruments((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, partName: event.currentTarget.value || null }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove instrument ${index() + 1}`}
                    onClick={() =>
                      setInstruments((items) =>
                        items.filter((_, itemIndex) => itemIndex !== index()),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>

        <section class="repertoire-editor-section">
          <div class="repertoire-editor-section-header">
            <div>
              <h2>Resources</h2>
              <p>Scores, recordings, videos, and related links.</p>
            </div>
            <button
              class="secondary-button"
              type="button"
              onClick={() => setResources((items) => [...items, { type: 'LINK', url: '' }])}
            >
              + Add resource
            </button>
          </div>
          <div class="repertoire-editor-rows">
            <For each={resources()}>
              {(resource, index) => (
                <div class="repertoire-editor-row resource-row">
                  <select
                    class="text-input"
                    value={resource.type}
                    aria-label={`Resource ${index() + 1} type`}
                    onChange={(event) =>
                      setResources((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? {
                                ...item,
                                type: event.currentTarget.value as RepertoireResourceInput['type'],
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="SCORE">Score</option>
                    <option value="RECORDING">Recording</option>
                    <option value="VIDEO">Video</option>
                    <option value="AUDIO">Audio</option>
                    <option value="LINK">Link</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input
                    class="text-input"
                    type="url"
                    value={resource.url}
                    aria-label={`Resource ${index() + 1} URL`}
                    placeholder="https://…"
                    required
                    onInput={(event) =>
                      setResources((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index()
                            ? { ...item, url: event.currentTarget.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <button
                    class="row-remove-button"
                    type="button"
                    aria-label={`Remove resource ${index() + 1}`}
                    onClick={() =>
                      setResources((items) => items.filter((_, itemIndex) => itemIndex !== index()))
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>

      <label class="field-label" for="library-item-visibility">
        Visibility
      </label>
      <select
        id="library-item-visibility"
        class="text-input"
        value={visibility()}
        onChange={(event) => setVisibility(event.currentTarget.value as 'PRIVATE' | 'PUBLIC')}
      >
        <option value="PRIVATE">Private</option>
        <option value="PUBLIC">Public</option>
      </select>
      <p class="field-help">Public items can be viewed and used by other musicians.</p>

      {props.afterFields}

      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>
      <div class="form-actions">
        {props.cancelAction}
        <button class="primary-button" type="submit" disabled={saving()}>
          {saving()
            ? 'Saving…'
            : (props.submitLabel ?? (editing() ? `Save ${label()}` : `Create ${label()}`))}
        </button>
      </div>
    </form>
  )

  if (props.embedded) return form

  return (
    <main class={`page form-page ${props.kind === 'repertoire' ? 'repertoire-form-page' : ''}`}>
      <header class="page-header">
        <div>
          <p class="eyebrow">My Library</p>
          <h1>
            {editing() ? 'Edit' : 'Create'} {label()}
          </h1>
        </div>
        <Link class="secondary-button" to="/library">
          Cancel
        </Link>
      </header>
      {form}
    </main>
  )
}

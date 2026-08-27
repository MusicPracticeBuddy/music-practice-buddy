import { Show, createSignal } from 'solid-js'
import { Link, useNavigate } from '@tanstack/solid-router'
import { createExercise, updateExercise, type ExerciseInput } from '@/data/exercises'
import { createRepertoire, updateRepertoire, type RepertoireInput } from '@/data/repertoire'

type LibraryItemFormProps = {
  kind: 'exercise' | 'repertoire'
  id?: string
  name?: string
  notation?: string | null
  notationFormat?: string
  libraryNotes?: string | null
  visibility?: 'PRIVATE' | 'PUBLIC'
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : 'The library item could not be saved.'
}

export function LibraryItemForm(props: LibraryItemFormProps) {
  const navigate = useNavigate()
  const editing = () => props.id !== undefined
  const label = () => (props.kind === 'exercise' ? 'exercise' : 'repertoire')
  const [name, setName] = createSignal(props.name ?? '')
  const [notation, setNotation] = createSignal(props.notation ?? '')
  const [notationFormat, setNotationFormat] = createSignal(props.notationFormat ?? 'text')
  const [libraryNotes, setLibraryNotes] = createSignal(props.libraryNotes ?? '')
  const [visibility, setVisibility] = createSignal<'PRIVATE' | 'PUBLIC'>(
    props.visibility ?? 'PRIVATE',
  )
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')

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
        }
        const result = props.id
          ? await updateExercise({ data: { id: props.id, ...data } })
          : await createExercise({ data })
        await navigate({ to: '/exercises/$exerciseId', params: { exerciseId: result.id } })
      } else {
        const data: RepertoireInput = {
          title: name(),
          libraryNotes: libraryNotes(),
          visibility: visibility(),
        }
        const result = props.id
          ? await updateRepertoire({ data: { id: props.id, ...data } })
          : await createRepertoire({ data })
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

  return (
    <main class="page form-page">
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

      <form class="creation-form" onSubmit={submit}>
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

        <Show when={props.kind === 'exercise'}>
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
          <input
            id="exercise-notation-format"
            class="text-input"
            value={notationFormat()}
            onInput={(event) => setNotationFormat(event.currentTarget.value)}
            maxlength="100"
            required
          />
        </Show>

        <Show when={props.kind === 'repertoire'}>
          <label class="field-label" for="repertoire-notes">
            Library notes (optional)
          </label>
          <textarea
            id="repertoire-notes"
            class="text-input"
            rows="5"
            value={libraryNotes()}
            onInput={(event) => setLibraryNotes(event.currentTarget.value)}
          />
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

        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
        <div class="form-actions">
          <button class="primary-button" type="submit" disabled={saving()}>
            {saving() ? 'Saving…' : editing() ? `Save ${label()}` : `Create ${label()}`}
          </button>
        </div>
      </form>
    </main>
  )
}

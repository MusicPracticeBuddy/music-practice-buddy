import { Show, createSignal } from 'solid-js'
import { updateRepertoireLibraryNote } from '@/data/repertoire'

export function RepertoireLibraryNote(props: {
  repertoireId: string
  repertoireTitle: string
  initialNote: string | null
}) {
  const [note, setNote] = createSignal(props.initialNote)
  const [draft, setDraft] = createSignal(props.initialNote ?? '')
  const [editing, setEditing] = createSignal(false)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')

  function beginEditing() {
    setDraft(note() ?? '')
    setError('')
    setEditing(true)
  }

  async function save(event: SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await updateRepertoireLibraryNote({
        data: { id: props.repertoireId, note: draft() },
      })
      setNote(result.note)
      setDraft(result.note ?? '')
      setEditing(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Show
        when={editing()}
        fallback={
          <div classList={{ 'library-note': Boolean(note()), 'library-note-empty': !note() }}>
            <Show when={note()}>{(value) => <p>{value()}</p>}</Show>
            <button
              class="note-icon-button"
              type="button"
              aria-label={
                note()
                  ? `Edit note for ${props.repertoireTitle}`
                  : `Add note to ${props.repertoireTitle}`
              }
              title={note() ? 'Edit note' : 'Add note'}
              onClick={beginEditing}
            >
              <span aria-hidden="true">{note() ? '✎' : '＋'}</span>
            </button>
          </div>
        }
      >
        <form class="library-note-editor" onSubmit={save}>
          <textarea
            class="text-input"
            rows="3"
            value={draft()}
            maxlength="5000"
            aria-label={`Library note for ${props.repertoireTitle}`}
            placeholder="Add a personal note…"
            onInput={(event) => setDraft(event.currentTarget.value)}
          />
          <button
            class="note-icon-button save-note-button"
            type="submit"
            disabled={saving()}
            aria-label={`Save note for ${props.repertoireTitle}`}
            title="Save note"
          >
            <span aria-hidden="true">✓</span>
          </button>
        </form>
      </Show>
      <Show when={error()}>
        <p class="form-error" role="alert">
          {error()}
        </p>
      </Show>
    </>
  )
}

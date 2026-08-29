import { For, Show, createSignal } from 'solid-js'
import { Link, createFileRoute, useNavigate } from '@tanstack/solid-router'
import { InstrumentSelect } from '@/components/InstrumentFields'
import { createPracticeSession, getSessionTemplates } from '@/data/sessionTemplates'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/sessions/new')({
  validateSearch: (search: Record<string, unknown>): { template?: string } =>
    typeof search.template === 'string' ? { template: search.template } : {},
  loader: async () => {
    const [templates, instruments] = await Promise.all([getSessionTemplates(), getInstruments()])
    return { templates, instruments }
  },
  component: NewSession,
})

function NewSession() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [templateId, setTemplateId] = createSignal(search().template ?? '')
  const selectedTemplate = () => data().templates.find((template) => template.id === templateId())
  const [instrumentId, setInstrumentId] = createSignal(selectedTemplate()?.instrumentId ?? '')
  const [assignedDate, setAssignedDate] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const session = await createPracticeSession({
        data: {
          templateId: templateId() || null,
          assignedDate: assignedDate() || null,
          instrumentId: instrumentId() || null,
        },
      })
      await navigate({ to: '/sessions/$sessionId', params: { sessionId: session.id } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The session could not be created.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main class="page form-page">
      <header class="page-header">
        <div>
          <h1>Create session</h1>
        </div>
        <Link class="secondary-button" to="/sessions">
          Cancel
        </Link>
      </header>

      <form class="creation-form" onSubmit={submit}>
        <label class="field-label" for="session-template">
          Template
        </label>
        <select
          id="session-template"
          class="text-input"
          value={templateId()}
          onChange={(event) => {
            const nextTemplateId = event.currentTarget.value
            setTemplateId(nextTemplateId)
            setInstrumentId(
              data().templates.find((template) => template.id === nextTemplateId)?.instrumentId ??
                '',
            )
          }}
        >
          <option value="">Open practice (no template)</option>
          <For each={data().templates}>
            {(template) => (
              <option value={template.id}>
                {template.name} · {template.itemCount} items
              </option>
            )}
          </For>
        </select>
        <p class="field-help">
          Template items are copied into the session and can change independently.
        </p>

        <InstrumentSelect
          id="session-instrument"
          instruments={data().instruments}
          value={instrumentId()}
          onChange={setInstrumentId}
        />

        <label class="field-label" for="assigned-date">
          Schedule date (optional)
        </label>
        <input
          id="assigned-date"
          class="text-input"
          type="date"
          value={assignedDate()}
          onInput={(event) => setAssignedDate(event.currentTarget.value)}
        />

        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
        <div class="form-actions">
          <button class="primary-button" type="submit" disabled={saving()}>
            {saving() ? 'Creating…' : 'Create session'}
          </button>
        </div>
      </form>
    </main>
  )
}

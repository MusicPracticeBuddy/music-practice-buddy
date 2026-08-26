import { createFileRoute, notFound } from '@tanstack/solid-router'
import { PracticePlanEditor } from '@/components/PracticePlanEditor'
import { getPlannedSessionForEdit, getTemplateLibrary } from '@/data/sessionTemplates'

export const Route = createFileRoute('/sessions/$sessionId_/edit')({
  loader: async ({ params }) => {
    const [session, library] = await Promise.all([
      getPlannedSessionForEdit({ data: params.sessionId }),
      getTemplateLibrary(),
    ])
    if (!session) throw notFound()
    return { session, library }
  },
  component: EditPlannedSession,
  notFoundComponent: () => (
    <main class="page empty-state">
      <h1>Session cannot be edited</h1>
      <p>Only planned sessions can be changed.</p>
    </main>
  ),
})

function EditPlannedSession() {
  const data = Route.useLoaderData()
  return <PracticePlanEditor session={data().session} library={data().library} />
}

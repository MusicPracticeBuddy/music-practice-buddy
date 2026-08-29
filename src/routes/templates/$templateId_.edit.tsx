import { createFileRoute, notFound } from '@tanstack/solid-router'
import { PracticePlanEditor } from '@/components/PracticePlanEditor'
import { getSessionTemplate, getTemplateLibrary } from '@/data/sessionTemplates'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/templates/$templateId_/edit')({
  loader: async ({ params }) => {
    const [template, instruments] = await Promise.all([
      getSessionTemplate({ data: params.templateId }),
      getInstruments(),
    ])
    if (!template?.canEdit) throw notFound()
    const library = await getTemplateLibrary({
      data: {
        instrumentId: template.instrumentId ?? null,
        exerciseAnyInstrument: false,
        repertoireAnyInstrument: false,
      },
    })
    return { template, library, instruments }
  },
  component: EditTemplate,
  notFoundComponent: () => (
    <main class="page empty-state">
      <h1>Template not found</h1>
      <p>The requested session template does not exist.</p>
    </main>
  ),
})

function EditTemplate() {
  const data = Route.useLoaderData()
  const context = Route.useRouteContext()
  return (
    <PracticePlanEditor
      template={data().template}
      library={data().library}
      instruments={data().instruments}
      canCreatePublic={context().user?.isAdmin}
    />
  )
}

import { createFileRoute, notFound } from '@tanstack/solid-router'
import { PracticePlanEditor } from '@/components/PracticePlanEditor'
import { getSessionTemplate, getTemplateLibrary } from '@/data/sessionTemplates'

export const Route = createFileRoute('/templates/$templateId_/edit')({
  loader: async ({ params }) => {
    const [template, library] = await Promise.all([
      getSessionTemplate({ data: params.templateId }),
      getTemplateLibrary(),
    ])
    if (!template?.canEdit) throw notFound()
    return { template, library }
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
  return <PracticePlanEditor template={data().template} library={data().library} />
}

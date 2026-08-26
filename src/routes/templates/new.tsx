import { createFileRoute } from '@tanstack/solid-router'
import { PracticePlanEditor } from '../../components/PracticePlanEditor'
import { getTemplateLibrary } from '../../data/sessionTemplates'

export const Route = createFileRoute('/templates/new')({
  loader: () => getTemplateLibrary(),
  component: NewTemplate,
})

function NewTemplate() {
  const library = Route.useLoaderData()
  return <PracticePlanEditor library={library()} />
}

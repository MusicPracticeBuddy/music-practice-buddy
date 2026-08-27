import { createFileRoute, notFound } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getRepertoireDetail } from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/$repertoireId_/edit')({
  loader: async ({ params }) => {
    const repertoire = await getRepertoireDetail({ data: params.repertoireId })
    if (!repertoire?.canManage || repertoire.parent) throw notFound()
    return repertoire
  },
  component: EditRepertoire,
})

function EditRepertoire() {
  const repertoire = Route.useLoaderData()
  return (
    <LibraryItemForm
      kind="repertoire"
      id={repertoire().id}
      name={repertoire().title}
      libraryNotes={repertoire().libraryEntries[0]?.notes}
      visibility={repertoire().visibility}
    />
  )
}

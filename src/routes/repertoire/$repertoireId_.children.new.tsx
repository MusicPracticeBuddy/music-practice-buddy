import { createFileRoute, notFound } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getInstruments, getRepertoireDetail } from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/$repertoireId_/children/new')({
  loader: async ({ params }) => {
    const [parent, instruments] = await Promise.all([
      getRepertoireDetail({ data: params.repertoireId }),
      getInstruments(),
    ])
    if (!parent?.canUse || parent.parent) throw notFound()
    return { parent, instruments }
  },
  component: NewChildRepertoire,
})

function NewChildRepertoire() {
  const data = Route.useLoaderData()
  const parent = () => data().parent
  return (
    <LibraryItemForm
      kind="repertoire"
      parentId={parent().id}
      parentName={parent().title}
      visibility="PRIVATE"
      compositionYear={parent().compositionYear}
      credits={parent().credits.map((credit) => ({
        person: credit.person,
        role: credit.role,
      }))}
      instruments={parent().instruments.map((instrument) => ({
        instrumentId: instrument.instrumentId,
        role: instrument.role,
        partName: instrument.partName,
      }))}
      resources={[]}
      instrumentOptions={data().instruments}
      submitLabel="Add movement or piece"
    />
  )
}

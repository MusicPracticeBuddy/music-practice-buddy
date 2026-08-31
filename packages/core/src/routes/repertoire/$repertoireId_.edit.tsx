import { createFileRoute, notFound } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getInstruments, getRepertoireDetail } from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/$repertoireId_/edit')({
  loader: async ({ params }) => {
    const [repertoire, instruments] = await Promise.all([
      getRepertoireDetail({ data: params.repertoireId }),
      getInstruments(),
    ])
    if (!repertoire?.canManage) throw notFound()
    return { repertoire, instruments }
  },
  component: EditRepertoire,
})

function EditRepertoire() {
  const data = Route.useLoaderData()
  const context = Route.useRouteContext()
  const repertoire = () => data().repertoire
  return (
    <LibraryItemForm
      kind="repertoire"
      id={repertoire().id}
      parentId={repertoire().parent?.id}
      parentName={repertoire().parent?.title}
      isExcerpt={
        repertoire().parent !== null &&
        (repertoire().startMeasure !== null || repertoire().endMeasure !== null)
      }
      startMeasure={repertoire().startMeasure}
      endMeasure={repertoire().endMeasure}
      name={repertoire().title}
      compositionYear={repertoire().compositionYear}
      visibility={repertoire().visibility}
      credits={repertoire().credits.map((credit) => ({
        person: credit.person,
        role: credit.role,
      }))}
      instruments={repertoire().instruments.map((instrument) => ({
        instrumentId: instrument.instrumentId,
        role: instrument.role,
        partName: instrument.partName,
      }))}
      resources={repertoire().resources.map((resource) => ({
        type: resource.type,
        url: resource.url,
      }))}
      instrumentOptions={data().instruments}
      canCreatePublic={context().user?.isAdmin}
    />
  )
}

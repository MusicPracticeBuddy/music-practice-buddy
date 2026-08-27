import { createFileRoute } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/repertoire/new')({
  loader: () => getInstruments(),
  component: NewRepertoire,
})

function NewRepertoire() {
  const instruments = Route.useLoaderData()
  return <LibraryItemForm kind="repertoire" instrumentOptions={instruments()} />
}

import { createFileRoute } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/exercises/new')({
  loader: () => getInstruments(),
  component: NewExercise,
})

function NewExercise() {
  const instruments = Route.useLoaderData()
  return <LibraryItemForm kind="exercise" instrumentOptions={instruments()} />
}

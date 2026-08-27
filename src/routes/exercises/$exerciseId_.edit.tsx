import { createFileRoute, notFound } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'
import { getExerciseDetail } from '@/data/exercises'

export const Route = createFileRoute('/exercises/$exerciseId_/edit')({
  loader: async ({ params }) => {
    const exercise = await getExerciseDetail({ data: params.exerciseId })
    if (!exercise?.canManage) throw notFound()
    return exercise
  },
  component: EditExercise,
})

function EditExercise() {
  const exercise = Route.useLoaderData()
  return (
    <LibraryItemForm
      kind="exercise"
      id={exercise().id}
      name={exercise().name}
      notation={exercise().notation}
      notationFormat={exercise().notationFormat}
      visibility={exercise().visibility as 'PRIVATE' | 'PUBLIC'}
    />
  )
}

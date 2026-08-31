import { createFileRoute, notFound } from '@tanstack/solid-router';
import { LibraryItemForm } from '@/components/LibraryItemForm';
import { getExerciseDetail } from '@/data/exercises';
import { getInstruments } from '@/data/repertoire';

export const Route = createFileRoute('/exercises/$exerciseId_/edit')({
  loader: async ({ params }) => {
    const [exercise, instruments] = await Promise.all([
      getExerciseDetail({ data: params.exerciseId }),
      getInstruments(),
    ]);
    if (!exercise?.canManage) throw notFound();
    return { exercise, instruments };
  },
  component: EditExercise,
});

function EditExercise() {
  const exercise = Route.useLoaderData();
  const context = Route.useRouteContext();
  return (
    <LibraryItemForm
      kind="exercise"
      id={exercise().exercise.id}
      name={exercise().exercise.name}
      notation={exercise().exercise.notation}
      notationFormat={exercise().exercise.notationFormat}
      visibility={exercise().exercise.visibility as 'PRIVATE' | 'PUBLIC'}
      instrumentId={exercise().exercise.instrumentId}
      instrumentOptions={exercise().instruments}
      canCreatePublic={context().user?.isAdmin}
    />
  );
}

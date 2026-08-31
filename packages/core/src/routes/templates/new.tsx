import { createFileRoute } from '@tanstack/solid-router';
import { PracticePlanEditor } from '@/components/PracticePlanEditor';
import { getTemplateLibrary } from '@/data/sessionTemplates';
import { getInstruments } from '@/data/repertoire';

export const Route = createFileRoute('/templates/new')({
  loader: async () => {
    const [library, instruments] = await Promise.all([getTemplateLibrary(), getInstruments()]);
    return { library, instruments };
  },
  component: NewTemplate,
});

function NewTemplate() {
  const data = Route.useLoaderData();
  const context = Route.useRouteContext();
  return (
    <PracticePlanEditor
      library={data().library}
      instruments={data().instruments}
      canCreatePublic={context().user?.isAdmin}
    />
  );
}

import { For, Show, createSignal } from 'solid-js';
import { Link, createFileRoute, notFound, useNavigate, useRouter } from '@tanstack/solid-router';
import { DeleteConfirmationDialog } from '@/components/DeleteConfirmationDialog';
import { RepertoireLibraryNote } from '@/components/RepertoireLibraryNote';
import {
  addRepertoireToLibrary,
  deleteRepertoire,
  getRepertoireDetail,
  removeRepertoireFromLibrary,
} from '@/data/repertoire';

export const Route = createFileRoute('/repertoire/$repertoireId')({
  loader: async ({ params }) => {
    const repertoire = await getRepertoireDetail({ data: params.repertoireId });
    if (!repertoire) throw notFound();
    return repertoire;
  },
  component: RepertoireDetail,
  notFoundComponent: RepertoireNotFound,
});

function formatDate(value: string | null) {
  if (!value) return 'Not started';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function RepertoireDetail() {
  const repertoire = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const [updatingLibrary, setUpdatingLibrary] = createSignal(false);
  const [libraryError, setLibraryError] = createSignal('');

  async function updateLibrary(action: 'add' | 'remove') {
    setUpdatingLibrary(true);
    setLibraryError('');
    try {
      if (action === 'add') await addRepertoireToLibrary({ data: repertoire().id });
      else await removeRepertoireFromLibrary({ data: repertoire().id });
      await router.invalidate({ sync: true });
    } catch (caught) {
      setLibraryError(
        caught instanceof Error ? caught.message : 'My Library could not be updated.',
      );
      if (action === 'remove') throw caught;
    } finally {
      setUpdatingLibrary(false);
    }
  }

  return (
    <main class="page detail-page">
      <Link class="back-link" to="/library">
        ← My Library
      </Link>

      <header class="record-header">
        <div>
          <h1>{repertoire().title}</h1>
          <Show when={repertoire().startMeasure !== null || repertoire().endMeasure !== null}>
            Measures {repertoire().startMeasure ?? 1}–{repertoire().endMeasure ?? 'end'}
          </Show>
          <p class="lede">
            {repertoire()
              .credits.map((credit) => credit.person)
              .join(', ') || 'Unknown composer'}
            <Show when={repertoire().compositionYear !== null}>
              {' '}
              · {repertoire().compositionYear}
            </Show>
          </p>
        </div>
        <div class="record-statuses">
          <Show when={repertoire().systemOwned}>
            <span class="tag">system catalog</span>
          </Show>
          <span class="tag">{repertoire().visibility.toLowerCase()}</span>
          <Show when={repertoire().visibility === 'PUBLIC' && repertoire().canManage}>
            <span class="tag">{repertoire().status.toLowerCase()}</span>
          </Show>
          <Show
            when={repertoire().libraryEntries.length > 0}
            fallback={
              <button
                class="primary-button"
                type="button"
                disabled={updatingLibrary()}
                onClick={() => void updateLibrary('add')}
              >
                {updatingLibrary() ? 'Adding…' : '+ Add'}
              </button>
            }
          >
            <DeleteConfirmationDialog
              triggerLabel="- Remove"
              title="Remove from My Library?"
              itemName={repertoire().title}
              description="This removes the library entry and its note. The repertoire and your practice history remain available."
              confirmLabel="Remove from My Library"
              pendingLabel="Removing…"
              onConfirm={() => updateLibrary('remove')}
            />
          </Show>
          <Show when={repertoire().canManage}>
            <Link
              class="secondary-button"
              to="/repertoire/$repertoireId/edit"
              params={{ repertoireId: repertoire().id }}
            >
              Edit
            </Link>
            <DeleteConfirmationDialog
              triggerLabel="Delete"
              title="Delete this repertoire?"
              itemName={repertoire().title}
              description="This also removes it from your library. Historical session entries will remain."
              confirmLabel="Delete"
              onConfirm={async () => {
                await deleteRepertoire({ data: repertoire().id });
                await router.invalidate({ sync: true });
                const parent = repertoire().parent;
                if (parent) {
                  await navigate({
                    to: '/repertoire/$repertoireId',
                    params: { repertoireId: parent.id },
                  });
                } else {
                  await navigate({ to: '/library' });
                }
              }}
            />
          </Show>
        </div>
      </header>

      <Show when={libraryError()}>
        <p class="form-error" role="alert">
          {libraryError()}
        </p>
      </Show>

      <Show when={repertoire().parent}>
        {(parent) => (
          <p class="parent-record">
            From{' '}
            <Link to="/repertoire/$repertoireId" params={{ repertoireId: parent().id }}>
              {parent().title}
            </Link>
          </p>
        )}
      </Show>

      <section class="detail-grid">
        <article class="detail-card">
          <p class="eyebrow">Credits</p>
          <Show
            when={repertoire().credits.length > 0}
            fallback={<p class="muted">No credits recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().credits}>
                {(credit) => (
                  <li>
                    <Show when={credit.biographyLink} fallback={<strong>{credit.person}</strong>}>
                      {(url) => (
                        <a href={url()} target="_blank" rel="noreferrer">
                          <strong>{credit.person}</strong>
                        </a>
                      )}
                    </Show>
                    <span>{credit.role.toLowerCase()}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <article class="detail-card">
          <p class="eyebrow">Instrumentation</p>
          <Show
            when={repertoire().instruments.length > 0}
            fallback={<p class="muted">No instruments recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().instruments}>
                {(instrument) => (
                  <li>
                    <strong>{instrument.partName ?? instrument.name}</strong>
                    <span>
                      {instrument.name} · {instrument.role.toLowerCase()}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <Show when={repertoire().libraryEntries.length > 0}>
          <article class="detail-card detail-card-wide">
            <p class="eyebrow">Your library</p>
            <For each={repertoire().libraryEntries}>
              {(entry) => (
                <div>
                  <Show when={entry.acquiredOn}>
                    <small>Acquired {entry.acquiredOn}</small>
                  </Show>
                  <RepertoireLibraryNote
                    repertoireId={repertoire().id}
                    repertoireTitle={repertoire().title}
                    initialNote={entry.notes}
                  />
                </div>
              )}
            </For>
          </article>
        </Show>

        <Show when={repertoire().startMeasure === null}>
          <article class="detail-card detail-card-wide">
            <div class="child-repertoire-header">
              <div>
                <p class="eyebrow">Excerpts</p>
                <p class="muted">Excerpts, movements, and individual pieces in this work.</p>
              </div>
              <Show when={repertoire().canUse}>
                <div class="child-repertoire-actions">
                  <Link
                    class="secondary-button"
                    to="/repertoire/$repertoireId/excerpts/new"
                    params={{ repertoireId: repertoire().id }}
                  >
                    Add excerpt
                  </Link>
                  <Link
                    class="secondary-button"
                    to="/repertoire/$repertoireId/children/new"
                    params={{ repertoireId: repertoire().id }}
                  >
                    Add movement or piece
                  </Link>
                </div>
              </Show>
            </div>
            <Show
              when={repertoire().children.length > 0}
              fallback={<p class="muted">No excerpts or other child items yet.</p>}
            >
              <ul class="detail-list">
                <For each={repertoire().children}>
                  {(child) => (
                    <li>
                      <Link to="/repertoire/$repertoireId" params={{ repertoireId: child.id }}>
                        <strong>{child.title}</strong>
                        <Show when={child.startMeasure !== null && child.endMeasure !== null}>
                          <span>
                            Measures {child.startMeasure}–{child.endMeasure}
                          </span>
                        </Show>
                      </Link>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </article>
        </Show>

        <article class="detail-card">
          <p class="eyebrow">Resources</p>
          <Show
            when={repertoire().resources.length > 0}
            fallback={<p class="muted">No resources recorded.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().resources}>
                {(resource) => (
                  <li>
                    <a href={resource.url} target="_blank" rel="noreferrer">
                      <strong>{resource.type.toLowerCase()} ↗</strong>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>

        <article class="detail-card detail-card-wide">
          <p class="eyebrow">Practice history</p>
          <Show
            when={repertoire().sessions.length > 0}
            fallback={<p class="muted">This repertoire has not appeared in a session.</p>}
          >
            <ul class="detail-list">
              <For each={repertoire().sessions}>
                {(session) => (
                  <li>
                    <Link to="/sessions/$sessionId" params={{ sessionId: session.id }}>
                      <strong>{session.templateName}</strong>
                      <span>
                        {formatDate(session.startedAt)} · {session.status.replace('_', ' ')}
                      </span>
                    </Link>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>
      </section>
    </main>
  );
}

function RepertoireNotFound() {
  return (
    <main class="page empty-state">
      <h1>Repertoire not found</h1>
      <p>The requested repertoire entry does not exist.</p>
      <Link class="text-link" to="/library">
        Return to My Library
      </Link>
    </main>
  );
}

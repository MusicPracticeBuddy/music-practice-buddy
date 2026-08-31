import { For, Show, createMemo, createSignal } from 'solid-js';
import { createFileRoute, useRouter } from '@tanstack/solid-router';
import { getMusicianInstrumentIds, updateMusicianInstrumentIds } from '@/data/preferences';
import { getInstruments } from '@/data/repertoire';
import { groupExpandedInstrumentOptions, groupInstrumentOptions } from '@/domain/instrument';

export const Route = createFileRoute('/settings')({
  loader: async () => {
    const [instruments, instrumentIds] = await Promise.all([
      getInstruments(),
      getMusicianInstrumentIds(),
    ]);
    return { instruments, instrumentIds };
  },
  component: Settings,
});

function Settings() {
  const router = useRouter();
  const data = Route.useLoaderData();
  const [instrumentIds, setInstrumentIds] = createSignal<string[]>(data().instrumentIds);
  const [showAllInstruments, setShowAllInstruments] = createSignal(false);
  const instrumentsWithPreferences = createMemo(() =>
    data().instruments.map((instrument) => ({
      ...instrument,
      isPreferred: instrumentIds().includes(instrument.id),
    })),
  );
  const instrumentGroups = createMemo(() =>
    showAllInstruments()
      ? groupExpandedInstrumentOptions(instrumentsWithPreferences())
      : groupInstrumentOptions(
          instrumentsWithPreferences().filter((instrument) => instrument.isPreferred),
        ),
  );
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [saved, setSaved] = createSignal(false);

  function toggleInstrument(id: string, checked: boolean) {
    setInstrumentIds((ids) =>
      checked ? [...ids, id] : ids.filter((candidate) => candidate !== id),
    );
    setSaved(false);
  }

  async function saveInstruments() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateMusicianInstrumentIds({ data: instrumentIds() });
      await router.invalidate({ sync: true });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your instruments could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="page form-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Preferences</p>
          <h1>Settings</h1>
          <p class="lede">
            Choose the instruments you play. Instrument filters will start with these selected.
          </p>
        </div>
      </header>

      <form
        class="creation-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveInstruments();
        }}
      >
        <fieldset class="settings-instrument-fieldset">
          <legend>Instrument preferences</legend>
          <p class="field-help">
            Leave all instruments unchecked if you do not want a default instrument filter.
          </p>
          <button
            class="instrument-list-toggle settings-instrument-toggle"
            type="button"
            aria-expanded={showAllInstruments()}
            aria-controls="settings-instrument-groups"
            onClick={() => setShowAllInstruments((expanded) => !expanded)}
          >
            {showAllInstruments() ? 'Show only My Instruments' : 'Show all instruments'}
          </button>
          <p class="instrument-list-scope">
            {showAllInstruments() ? 'All instruments' : 'My Instruments'}
          </p>
          <div id="settings-instrument-groups" class="settings-instrument-groups">
            <For
              each={instrumentGroups()}
              fallback={
                <p class="muted">
                  {showAllInstruments()
                    ? 'No instruments are available.'
                    : 'No instruments selected in My Instruments.'}
                </p>
              }
            >
              {(group) => (
                <section class="settings-instrument-group">
                  <h2>{group.label}</h2>
                  <div class="settings-instrument-options">
                    <For each={group.instruments}>
                      {(instrument) => (
                        <label>
                          <input
                            type="checkbox"
                            checked={instrumentIds().includes(instrument.id)}
                            onChange={(event) =>
                              toggleInstrument(instrument.id, event.currentTarget.checked)
                            }
                          />
                          <span>
                            <strong>{instrument.name}</strong>
                            <small>{instrument.family.toLocaleLowerCase()}</small>
                          </span>
                        </label>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </div>
        </fieldset>

        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
        <Show when={saved()}>
          <p class="form-success" role="status">
            Instrument preferences saved.
          </p>
        </Show>

        <div class="form-actions">
          <button class="primary-button" type="submit" disabled={saving()}>
            {saving() ? 'Saving…' : 'Save instruments'}
          </button>
        </div>
      </form>
    </main>
  );
}

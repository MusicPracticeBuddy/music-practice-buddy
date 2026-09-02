import { Show, createSignal } from 'solid-js';
import { createFileRoute, useRouter } from '@tanstack/solid-router';
import { InstrumentFilter } from '@/components/InstrumentFields';
import { getMusicianInstrumentIds, updateMusicianInstrumentIds } from '@/data/preferences';
import { getInstruments } from '@/data/repertoire';

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
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');
  const [saved, setSaved] = createSignal(false);

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
        <div class="settings-instrument-fieldset">
          <h2>Instrument preferences</h2>
          <p class="field-help">
            Leave all instruments unchecked if you do not want a default instrument filter.
          </p>
          <InstrumentFilter
            presentation="inline"
            instruments={data().instruments}
            selectedIds={instrumentIds()}
            onChange={(ids) => {
              setInstrumentIds(ids);
              setSaved(false);
            }}
          />
        </div>

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

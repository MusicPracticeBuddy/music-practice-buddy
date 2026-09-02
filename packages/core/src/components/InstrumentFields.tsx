import { For, Show, createMemo, createSignal } from 'solid-js';
import * as Dialog from '@kobalte/core/dialog';
import type { InstrumentOption } from '@/data/repertoire';
import { groupExpandedInstrumentOptions, groupInstrumentOptions } from '@/domain/instrument';

export function InstrumentSelect(props: {
  id: string;
  instruments: InstrumentOption[];
  value: string;
  onChange: (instrumentId: string) => void;
  label?: string;
}) {
  return (
    <>
      <label class="field-label" for={props.id}>
        {props.label ?? 'Instrument (optional)'}
      </label>
      <select
        id={props.id}
        class="text-input"
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <option value="">No instrument</option>
        <For each={groupInstrumentOptions(props.instruments)}>
          {(group) => (
            <optgroup label={group.label}>
              <For each={group.instruments}>
                {(instrument) => <option value={instrument.id}>{instrument.name}</option>}
              </For>
            </optgroup>
          )}
        </For>
      </select>
    </>
  );
}

export function InstrumentFilter(props: {
  instruments: InstrumentOption[];
  selectedIds: string[];
  onChange: (instrumentIds: string[]) => void;
  legend?: string;
  presentation?: 'inline' | 'modal';
}) {
  const [query, setQuery] = createSignal('');
  const [draftIds, setDraftIds] = createSignal<string[]>([]);
  const selectionIds = () => (props.presentation === 'inline' ? props.selectedIds : draftIds());
  const selectedInstruments = createMemo(() =>
    props.instruments.filter((instrument) => props.selectedIds.includes(instrument.id)),
  );
  const visibleGroups = createMemo(() => {
    const search = query().trim().toLocaleLowerCase();
    const instruments = search
      ? props.instruments.filter((instrument) =>
          `${instrument.name} ${instrument.family}`.toLocaleLowerCase().includes(search),
        )
      : props.instruments;
    return groupExpandedInstrumentOptions(instruments);
  });

  function toggleInstrument(id: string, checked: boolean) {
    updateSelection(
      checked ? [...selectionIds(), id] : selectionIds().filter((candidate) => candidate !== id),
    );
  }

  function toggleGroup(instrumentIds: string[], checked: boolean) {
    const groupIds = new Set(instrumentIds);
    updateSelection(
      checked
        ? [...new Set([...selectionIds(), ...instrumentIds])]
        : selectionIds().filter((id) => !groupIds.has(id)),
    );
  }

  function updateSelection(ids: string[]) {
    if (props.presentation === 'inline') props.onChange(ids);
    else setDraftIds(ids);
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      setDraftIds([...props.selectedIds]);
      return;
    }

    setQuery('');
    const selected = new Set(props.selectedIds);
    if (draftIds().length !== selected.size || draftIds().some((id) => !selected.has(id))) {
      props.onChange(draftIds());
    }
  }

  const InstrumentOptions = () => (
    <>
      <input
        class="text-input instrument-list-search"
        type="search"
        value={query()}
        aria-label="Search instruments"
        placeholder="Search instruments…"
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <div class="instrument-modal-options">
        <For
          each={visibleGroups()}
          fallback={<p class="instrument-list-empty">No instruments match your search.</p>}
        >
          {(group) => (
            <section class="instrument-option-group">
              <label class="instrument-option-group-toggle">
                <input
                  type="checkbox"
                  checked={group.instruments.every((instrument) =>
                    selectionIds().includes(instrument.id),
                  )}
                  onChange={(event) =>
                    toggleGroup(
                      group.instruments.map((instrument) => instrument.id),
                      event.currentTarget.checked,
                    )
                  }
                />
                <span>{group.label}</span>
              </label>
              <div class="instrument-option-grid">
                <For each={group.instruments}>
                  {(instrument) => (
                    <label>
                      <input
                        type="checkbox"
                        checked={selectionIds().includes(instrument.id)}
                        onChange={(event) =>
                          toggleInstrument(instrument.id, event.currentTarget.checked)
                        }
                      />
                      <span>{instrument.name}</span>
                    </label>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>
      </div>
    </>
  );

  return (
    <div class="library-instrument-filter" role="group" aria-label={props.legend ?? 'Instruments'}>
      <p class="instrument-filter-label">{props.legend ?? 'Instruments'}</p>
      <Show
        when={props.presentation === 'inline'}
        fallback={
          <>
            <Dialog.Root onOpenChange={handleOpenChange}>
              <Dialog.Trigger class="secondary-button instrument-filter-trigger">
                Select instruments
                <Show when={props.selectedIds.length > 0}> ({props.selectedIds.length})</Show>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay class="modal-backdrop" />
                <Dialog.Content class="editor-modal instrument-filter-modal">
                  <Dialog.Title>Select instruments</Dialog.Title>
                  <Dialog.Description class="muted">
                    Choose one or more instruments, or leave everything unchecked to include all.
                  </Dialog.Description>
                  <InstrumentOptions />
                  <div class="modal-actions">
                    <button
                      class="text-button instrument-filter-clear"
                      type="button"
                      onClick={() => updateSelection([])}
                    >
                      Clear selection
                    </button>
                    <Dialog.CloseButton class="primary-button" aria-label="Done">
                      Done
                    </Dialog.CloseButton>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <p class="instrument-filter-summary">
              {selectedInstruments().length > 0
                ? selectedInstruments()
                    .map((instrument) => instrument.name)
                    .join(', ')
                : 'All instruments'}
            </p>
          </>
        }
      >
        <div class="instrument-filter-inline">
          <InstrumentOptions />
          <Show when={props.selectedIds.length > 0}>
            <div class="instrument-inline-actions">
              <button
                class="text-button instrument-filter-clear"
                type="button"
                onClick={() => updateSelection([])}
              >
                Clear selection
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

import { For, Show, createMemo, createSignal, createUniqueId } from 'solid-js'
import type { InstrumentOption } from '@/data/repertoire'
import { groupExpandedInstrumentOptions, groupInstrumentOptions } from '@/domain/instrument'

export function InstrumentSelect(props: {
  id: string
  instruments: InstrumentOption[]
  value: string
  onChange: (instrumentId: string) => void
  label?: string
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
  )
}

export function InstrumentFilter(props: {
  instruments: InstrumentOption[]
  selectedIds: string[]
  onChange: (instrumentIds: string[]) => void
}) {
  const [showAll, setShowAll] = createSignal(false)
  const optionsId = `instrument-filter-options-${createUniqueId()}`
  const preferredInstruments = createMemo(() =>
    props.instruments.filter((instrument) => instrument.isPreferred),
  )
  const visibleInstruments = createMemo(() =>
    showAll() ? props.instruments : preferredInstruments(),
  )
  const visibleGroups = createMemo(() =>
    showAll()
      ? groupExpandedInstrumentOptions(visibleInstruments())
      : groupInstrumentOptions(visibleInstruments()),
  )

  return (
    <fieldset class="library-instrument-filter">
      <legend>Instruments</legend>
      <button
        class="instrument-list-toggle"
        type="button"
        aria-expanded={showAll()}
        aria-controls={optionsId}
        onClick={() => setShowAll((expanded) => !expanded)}
      >
        {showAll() ? 'Show only My Instruments' : 'Show all instruments'}
      </button>
      <div id={optionsId} class="library-instrument-options">
        <p class="instrument-list-scope">{showAll() ? 'All instruments' : 'My Instruments'}</p>
        <Show
          when={visibleInstruments().length > 0}
          fallback={
            <p class="instrument-list-empty">
              {showAll()
                ? 'No instruments are available.'
                : 'No instruments selected in My Instruments.'}
            </p>
          }
        >
          <For each={visibleGroups()}>
            {(group) => (
              <div class="instrument-option-group">
                <p>{group.label}</p>
                <For each={group.instruments}>
                  {(instrument) => (
                    <label>
                      <input
                        type="checkbox"
                        ref={(element) => {
                          element.checked = props.selectedIds.includes(instrument.id)
                        }}
                        checked={props.selectedIds.includes(instrument.id)}
                        onChange={(event) =>
                          props.onChange(
                            event.currentTarget.checked
                              ? [...props.selectedIds, instrument.id]
                              : props.selectedIds.filter((id) => id !== instrument.id),
                          )
                        }
                      />
                      <span>{instrument.name}</span>
                    </label>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </fieldset>
  )
}

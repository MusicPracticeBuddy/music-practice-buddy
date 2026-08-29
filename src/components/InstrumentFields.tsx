import { For } from 'solid-js'
import type { InstrumentOption } from '@/data/repertoire'
import { groupInstrumentOptions } from '@/domain/instrument'

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
  return (
    <fieldset class="library-instrument-filter">
      <legend>Instruments</legend>
      <div class="library-instrument-options">
        <For each={groupInstrumentOptions(props.instruments)}>
          {(group) => (
            <div class="instrument-option-group">
              <p>{group.label}</p>
              <For each={group.instruments}>
                {(instrument) => (
                  <label>
                    <input
                      type="checkbox"
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
      </div>
    </fieldset>
  )
}

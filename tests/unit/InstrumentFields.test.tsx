import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { InstrumentFilter } from '@/components/InstrumentFields';

const instruments = [
  { id: '1', name: 'Trumpet', family: 'BRASS', isPreferred: true },
  { id: '2', name: 'Piano', family: 'KEYBOARD', isPreferred: false },
  { id: '3', name: 'Trombone', family: 'BRASS', isPreferred: false },
];

afterEach(cleanup);

describe('InstrumentFilter', () => {
  it('opens the complete instrument list in a searchable modal', () => {
    const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
    const onChange = vi.fn(setSelectedIds);
    render(() => (
      <InstrumentFilter instruments={instruments} selectedIds={selectedIds()} onChange={onChange} />
    ));

    expect(screen.queryByRole('checkbox')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Select instruments' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Select instruments' })).toBeTruthy();
    const groupLabels = screen.getAllByText(/My instruments|Brass|Keyboard/);
    expect(groupLabels.map((label) => label.textContent)).toEqual([
      'My instruments',
      'Brass',
      'Keyboard',
    ]);
    expect(screen.getAllByRole('checkbox', { name: 'Trumpet' })).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Piano' })).toBeTruthy();
    fireEvent.input(screen.getByRole('searchbox', { name: 'Search instruments' }), {
      target: { value: 'piano' },
    });
    expect(screen.queryByRole('checkbox', { name: 'Trumpet' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Piano' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onChange).toHaveBeenCalledWith(['2']);
    expect(screen.getByText('Piano')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select instruments (1)' })).toBeTruthy();
  });

  it('keeps My Instruments and family checkboxes synchronized', () => {
    const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
    render(() => (
      <InstrumentFilter
        instruments={instruments}
        selectedIds={selectedIds()}
        onChange={setSelectedIds}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Select instruments' }));
    const trumpetCheckboxes = screen.getAllByRole('checkbox', { name: 'Trumpet' });
    fireEvent.click(trumpetCheckboxes[0]!);
    expect(trumpetCheckboxes.every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(
      true,
    );

    fireEvent.click(trumpetCheckboxes[1]!);
    expect(trumpetCheckboxes.every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(
      true,
    );
  });

  it('toggles complete groups and treats partial groups as off', () => {
    const [selectedIds, setSelectedIds] = createSignal<string[]>(['1']);
    render(() => (
      <InstrumentFilter
        instruments={instruments}
        selectedIds={selectedIds()}
        onChange={setSelectedIds}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Select instruments (1)' }));
    const myInstrumentsToggle = screen.getByRole('checkbox', {
      name: 'My instruments',
    }) as HTMLInputElement;
    expect(myInstrumentsToggle.checked).toBe(true);
    fireEvent.click(myInstrumentsToggle);
    expect(
      screen
        .getAllByRole('checkbox', { name: 'Trumpet' })
        .every((checkbox) => !(checkbox as HTMLInputElement).checked),
    ).toBe(true);
    fireEvent.click(myInstrumentsToggle);

    const brassToggle = screen.getByRole('checkbox', { name: 'Brass' }) as HTMLInputElement;
    expect(brassToggle.checked).toBe(false);

    fireEvent.click(brassToggle);
    expect(brassToggle.checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Trombone' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(
      screen
        .getAllByRole('checkbox', { name: 'Trumpet' })
        .every((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toBe(true);

    fireEvent.click(brassToggle);
    expect(brassToggle.checked).toBe(false);
    expect(myInstrumentsToggle.checked).toBe(false);
  });

  it('can clear the selection from the modal', () => {
    const [selectedIds, setSelectedIds] = createSignal(['1']);
    render(() => (
      <InstrumentFilter
        instruments={instruments}
        selectedIds={selectedIds()}
        onChange={setSelectedIds}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Select instruments (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('All instruments')).toBeTruthy();
  });
});

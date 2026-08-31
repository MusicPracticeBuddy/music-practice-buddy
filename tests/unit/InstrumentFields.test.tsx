import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { InstrumentFilter } from '@/components/InstrumentFields';

const instruments = [
  { id: '1', name: 'Trumpet', family: 'BRASS', isPreferred: true },
  { id: '2', name: 'Piano', family: 'KEYBOARD', isPreferred: false },
];

afterEach(cleanup);

describe('InstrumentFilter', () => {
  it('shows only My Instruments until the user expands the complete list', () => {
    const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
    render(() => (
      <InstrumentFilter
        instruments={instruments}
        selectedIds={selectedIds()}
        onChange={setSelectedIds}
      />
    ));

    expect(screen.getByRole('checkbox', { name: 'Trumpet' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Piano' })).toBeNull();

    const expand = screen.getByRole('button', { name: 'Show all instruments' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expand);

    expect(screen.getByRole('checkbox', { name: 'Piano' })).toBeTruthy();
    const trumpetCheckboxes = screen.getAllByRole('checkbox', { name: 'Trumpet' });
    expect(trumpetCheckboxes).toHaveLength(2);
    fireEvent.click(trumpetCheckboxes[0]!);
    expect(
      screen
        .getAllByRole('checkbox', { name: 'Trumpet' })
        .every((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toBe(true);
    fireEvent.click(trumpetCheckboxes[1]!);
    expect(
      screen
        .getAllByRole('checkbox', { name: 'Trumpet' })
        .every((checkbox) => !(checkbox as HTMLInputElement).checked),
    ).toBe(true);
    const collapse = screen.getByRole('button', { name: 'Show only My Instruments' });
    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(collapse);
    expect(screen.queryByRole('checkbox', { name: 'Piano' })).toBeNull();
  });

  it('provides an empty My Instruments message while keeping the full list available', () => {
    render(() => (
      <InstrumentFilter
        instruments={instruments.map((instrument) => ({ ...instrument, isPreferred: false }))}
        selectedIds={[]}
        onChange={() => undefined}
      />
    ));

    expect(screen.getByText('No instruments selected in My Instruments.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show all instruments' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
});

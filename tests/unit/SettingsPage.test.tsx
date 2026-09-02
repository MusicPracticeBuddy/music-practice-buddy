import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, type Accessor, type JSX } from 'solid-js';

type LoaderData = {
  instruments: Array<{
    id: string;
    name: string;
    family: string;
    isPreferred: boolean;
  }>;
  instrumentIds: string[];
};

let loaderData: Accessor<LoaderData>;

vi.mock('@tanstack/solid-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => loaderData,
  }),
  useRouter: () => ({ invalidate: vi.fn(async () => undefined) }),
}));

vi.mock('../../packages/core/src/data/preferences', () => ({
  getMusicianInstrumentIds: vi.fn(),
  updateMusicianInstrumentIds: vi.fn(),
}));

vi.mock('../../packages/core/src/data/repertoire', () => ({
  getInstruments: vi.fn(),
}));

import { Route } from '@/routes/settings';

const Settings = (Route as unknown as { component: () => JSX.Element }).component;

afterEach(cleanup);

describe('Settings page', () => {
  it('uses the shared instrument selector inline', () => {
    const [data] = createSignal<LoaderData>({
      instruments: [
        { id: '1', name: 'Violin', family: 'STRING', isPreferred: true },
        { id: '2', name: 'Trumpet', family: 'BRASS', isPreferred: false },
      ],
      instrumentIds: ['1'],
    });
    loaderData = data;
    render(() => <Settings />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: /Select instruments/ })).toBeNull();
    const violins = screen.getAllByRole('checkbox', { name: /Violin/ }) as HTMLInputElement[];
    expect(violins).toHaveLength(2);
    expect(violins.every((violin) => violin.checked)).toBe(true);
    expect(screen.getByRole('checkbox', { name: /Trumpet/ })).toBeTruthy();
    fireEvent.click(violins[1]!);
    expect(violins.every((violin) => !violin.checked)).toBe(true);
  });
});

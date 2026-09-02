import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type Accessor, type JSX } from 'solid-js';

type LibraryLoaderData = {
  instruments: [];
};

let loaderData: Accessor<LibraryLoaderData>;

vi.mock('@tanstack/solid-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => loaderData,
  }),
  Link: (props: { children: JSX.Element; class?: string }) => (
    <a class={props.class}>{props.children}</a>
  ),
}));

vi.mock('../../packages/core/src/components/DeleteConfirmationDialog', () => ({
  DeleteConfirmationDialog: () => null,
}));

vi.mock('../../packages/core/src/components/ExerciseNotation', () => ({
  ExerciseNotation: () => null,
}));

vi.mock('../../packages/core/src/components/InstrumentFields', () => ({
  InstrumentFilter: () => null,
}));

vi.mock('../../packages/core/src/components/RepertoireLibraryNote', () => ({
  RepertoireLibraryNote: () => null,
}));

vi.mock('../../packages/core/src/data/exercises', () => ({
  EMPTY_EXERCISE_LIBRARY_SEARCH: {
    query: '',
    visibility: 'ALL',
    hasNotation: false,
    instrumentIds: [],
    page: 1,
  },
  getExerciseLibraryPage: vi.fn(),
  removeExerciseFromLibrary: vi.fn(),
}));

vi.mock('../../packages/core/src/data/repertoire', () => ({
  EMPTY_REPERTOIRE_LIBRARY_SEARCH: {
    query: '',
    composer: '',
    instrumentIds: [],
    visibility: 'ALL',
    page: 1,
  },
  getInstruments: vi.fn(),
  getRepertoireLibraryPage: vi.fn(),
  removeRepertoireFromLibrary: vi.fn(),
}));

import { Route } from '@/routes/library';
import { getExerciseLibraryPage } from '@/data/exercises';
import { getRepertoireLibraryPage } from '@/data/repertoire';

const Library = (Route as unknown as { component: () => JSX.Element }).component;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Library page', () => {
  it('lazy-loads each collapsed section only when first expanded', async () => {
    vi.mocked(getRepertoireLibraryPage).mockResolvedValue({
      items: [
        {
          id: 'repertoire-1',
          title: 'Loaded repertoire',
          instrument: null,
          visibility: 'PRIVATE',
          composer: 'Composer',
          parentTitle: null,
          measureRange: null,
          libraryNotes: null,
          status: 'ACTIVE',
          owner: 'Musician',
          ownerId: '1',
          resourceType: null,
          resourceUrl: null,
          systemOwned: false,
          canEdit: true,
          canManage: true,
          canUse: true,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    vi.mocked(getExerciseLibraryPage).mockResolvedValue({
      items: [
        {
          id: 'exercise-1',
          name: 'Loaded exercise',
          visibility: 'PRIVATE',
          notation: null,
          notationFormat: 'text',
          instrumentName: null,
          instrumentId: null,
          copiedFrom: null,
          owner: 'Musician',
          ownerId: '1',
          canEdit: true,
          canManage: true,
          canUse: true,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const [data] = createSignal<LibraryLoaderData>({ instruments: [] });
    loaderData = data;
    render(() => <Library />);

    expect(getRepertoireLibraryPage).not.toHaveBeenCalled();
    expect(getExerciseLibraryPage).not.toHaveBeenCalled();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByText('Owned repertoire')).toBeNull();
    expect(screen.queryByText('Find repertoire')).toBeNull();
    expect(screen.queryByText('Owned exercises')).toBeNull();
    expect(screen.queryByText('+ Create exercise')).toBeNull();
    expect(screen.queryByText('Find exercises')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Expand repertoire' }));
    expect(screen.getByText('Owned repertoire')).toBeTruthy();
    expect(screen.getByText('Find repertoire')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Loaded repertoire')).toBeTruthy());
    expect(getExerciseLibraryPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse repertoire' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand repertoire' }));
    expect(getRepertoireLibraryPage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Expand exercises' }));
    expect(screen.getByText('Owned exercises')).toBeTruthy();
    expect(screen.getByText('+ Create exercise')).toBeTruthy();
    expect(screen.getByText('Find exercises')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Loaded exercise')).toBeTruthy());
    expect(getExerciseLibraryPage).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type Accessor, type JSX } from 'solid-js';

type LibraryLoaderData = {
  repertoire: {
    items: Array<{
      id: string;
      title: string;
      instrument: string | null;
      visibility: 'PRIVATE';
      composer: string;
      parentTitle: string | null;
      measureRange: string | null;
      libraryNotes: string | null;
    }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  exercises: {
    items: Array<{
      id: string;
      name: string;
      visibility: 'PRIVATE';
      notation: string | null;
      notationFormat: 'text';
      instrumentName: string | null;
      copiedFrom: null;
    }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  instruments: [];
  instrumentIds: [];
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

const Library = (Route as unknown as { component: () => JSX.Element }).component;

function libraryData(repertoireTitle: string, exerciseName: string): LibraryLoaderData {
  return {
    repertoire: {
      items: [
        {
          id: 'repertoire-1',
          title: repertoireTitle,
          instrument: null,
          visibility: 'PRIVATE',
          composer: 'Composer',
          parentTitle: null,
          measureRange: null,
          libraryNotes: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    },
    exercises: {
      items: [
        {
          id: 'exercise-1',
          name: exerciseName,
          visibility: 'PRIVATE',
          notation: null,
          notationFormat: 'text',
          instrumentName: null,
          copiedFrom: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    },
    instruments: [],
    instrumentIds: [],
  };
}

afterEach(cleanup);

describe('Library page', () => {
  it('updates both rendered lists when loader data refreshes', async () => {
    const [data, setData] = createSignal(libraryData('Existing repertoire', 'Existing exercise'));
    loaderData = data;
    render(() => <Library />);

    expect(screen.getByText('Existing repertoire')).toBeTruthy();
    expect(screen.getByText('Existing exercise')).toBeTruthy();

    setData(libraryData('Refreshed repertoire', 'Created exercise'));

    await waitFor(() => {
      expect(screen.getByText('Refreshed repertoire')).toBeTruthy();
      expect(screen.getByText('Created exercise')).toBeTruthy();
    });
  });
});

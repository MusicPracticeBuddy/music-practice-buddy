import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type JSX } from 'solid-js';

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
  navigate: vi.fn(async () => undefined),
  renderAbc: vi.fn(),
  updateExercise: vi.fn(async () => ({ id: '42' })),
  createChildRepertoire: vi.fn(async () => ({ id: '84' })),
  searchComposerNames: vi.fn(async () => [{ id: '9', name: 'Ludwig van Beethoven' }]),
}));

vi.mock('abcjs', () => ({
  default: { renderAbc: mocks.renderAbc },
}));

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: JSX.Element }) => <a>{props.children}</a>,
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

vi.mock('../../packages/core/src/data/exercises', () => ({
  createExercise: vi.fn(),
  updateExercise: mocks.updateExercise,
}));

vi.mock('../../packages/core/src/data/repertoire', () => ({
  createChildRepertoire: mocks.createChildRepertoire,
  createRepertoire: vi.fn(),
  searchComposerNames: mocks.searchComposerNames,
  updateRepertoire: vi.fn(),
}));

import { LibraryItemForm } from '@/components/LibraryItemForm';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LibraryItemForm', () => {
  it('only offers public visibility to admins creating resources', () => {
    const { unmount } = render(() => <LibraryItemForm kind="exercise" />);

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE']);

    unmount();
    render(() => <LibraryItemForm kind="exercise" canCreatePublic />);

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE', 'PUBLIC']);
  });

  it('preserves public visibility while editing an existing public resource', () => {
    render(() => <LibraryItemForm kind="exercise" id="42" name="Scales" visibility="PUBLIC" />);

    expect(
      Array.from(
        (screen.getByLabelText('Visibility') as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(['PRIVATE', 'PUBLIC']);
  });

  it('invalidates cached route data after updating an exercise', async () => {
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation="X:1\nK:C\nCDEF|"
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ));

    fireEvent.input(screen.getByLabelText('Instructions or notation (optional)'), {
      target: { value: 'X:1\nK:G\nGABc|' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Save exercise' }).closest('form')!);

    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith({ sync: true }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/exercises/$exerciseId',
      params: { exerciseId: '42' },
    });
    expect(mocks.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.navigate.mock.invocationCallOrder[0]!,
    );
  });

  it('updates its textarea when refreshed loader data changes', async () => {
    const [notation, setNotation] = createSignal('X:1\nK:C\nCDEF|');
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation={notation()}
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ));

    const textarea = screen.getByLabelText('Instructions or notation (optional)');
    expect((textarea as HTMLTextAreaElement).value).toBe('X:1\nK:C\nCDEF|');

    setNotation('X:1\nK:G\nGABc|');

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('X:1\nK:G\nGABc|');
    });
  });

  it('updates the rendered preview while editing ABC notation', async () => {
    const initialNotation = 'X:1\nK:C\nCDEF|';
    const updatedNotation = 'X:1\nK:G\nGABc|';
    render(() => (
      <LibraryItemForm
        kind="exercise"
        id="42"
        name="Scales"
        notation={initialNotation}
        notationFormat="abc"
        visibility="PRIVATE"
      />
    ));

    expect(screen.getByText('Preview')).toBeTruthy();
    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      expect(mocks.renderAbc).toHaveBeenCalledWith(score, initialNotation, {
        responsive: 'resize',
      });
    });

    fireEvent.input(screen.getByLabelText('Instructions or notation (optional)'), {
      target: { value: updatedNotation },
    });

    await waitFor(() => {
      expect(mocks.renderAbc).toHaveBeenLastCalledWith(score, updatedNotation, {
        responsive: 'resize',
      });
    });
  });

  it('shows measure fields only for excerpts and pre-fills parent instrumentation', () => {
    const sharedProps = {
      kind: 'repertoire' as const,
      parentId: '12',
      parentName: 'Orchestral work',
      visibility: 'PRIVATE' as const,
      compositionYear: 1913,
      credits: [{ person: 'Igor Stravinsky', role: 'COMPOSER' as const }],
      instruments: [{ instrumentId: '7', role: 'OTHER' as const, partName: 'Orchestra' }],
      instrumentOptions: [{ id: '7', name: 'Orchestra', family: 'OTHER', isPreferred: false }],
    };
    const { unmount } = render(() => <LibraryItemForm {...sharedProps} isExcerpt />);

    expect(screen.getByLabelText('Starting measure')).toBeTruthy();
    expect(screen.getByLabelText('Ending measure')).toBeTruthy();
    expect(
      (screen.getByLabelText('Composition or publication year (optional)') as HTMLInputElement)
        .value,
    ).toBe('1913');
    expect((screen.getByLabelText('Credit 1 name') as HTMLInputElement).value).toBe(
      'Igor Stravinsky',
    );
    expect((screen.getByLabelText('Instrument 1') as HTMLSelectElement).value).toBe('7');
    expect(screen.queryByLabelText('Resource 1 URL')).toBeNull();
    expect(screen.queryByLabelText('Visibility')).toBeNull();

    unmount();
    render(() => <LibraryItemForm {...sharedProps} />);
    expect(screen.queryByLabelText('Starting measure')).toBeNull();
    expect(screen.queryByLabelText('Ending measure')).toBeNull();
  });

  it('creates an excerpt with its parent, range, and separately editable instruments', async () => {
    render(() => (
      <LibraryItemForm
        kind="repertoire"
        parentId="12"
        parentName="Orchestral work"
        isExcerpt
        visibility="PRIVATE"
        compositionYear={1913}
        credits={[{ person: 'Igor Stravinsky', role: 'COMPOSER' }]}
        instruments={[{ instrumentId: '7', role: 'OTHER', partName: 'Orchestra' }]}
        resources={[]}
        instrumentOptions={[
          { id: '7', name: 'Orchestra', family: 'OTHER', isPreferred: false },
          { id: '8', name: 'Horn', family: 'BRASS', isPreferred: true },
        ]}
      />
    ));

    fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Horn excerpt' } });
    fireEvent.input(screen.getByLabelText('Starting measure'), { target: { value: '12' } });
    fireEvent.input(screen.getByLabelText('Ending measure'), { target: { value: '24' } });
    fireEvent.change(screen.getByLabelText('Instrument 1'), { target: { value: '8' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create repertoire' }).closest('form')!);

    await waitFor(() =>
      expect(mocks.createChildRepertoire).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentId: '12',
          title: 'Horn excerpt',
          compositionYear: 1913,
          credits: [{ person: 'Igor Stravinsky', role: 'COMPOSER' }],
          startMeasure: 12,
          endMeasure: 24,
          instruments: [{ instrumentId: '8', role: 'OTHER', partName: 'Orchestra' }],
          resources: [],
        }),
      }),
    );
  });

  it('searches and suggests existing full composer names while typing', async () => {
    render(() => (
      <LibraryItemForm kind="repertoire" credits={[{ person: '', role: 'COMPOSER' }]} />
    ));

    fireEvent.input(screen.getByLabelText('Credit 1 name'), {
      target: { value: 'Beethven' },
    });

    await waitFor(() =>
      expect(mocks.searchComposerNames).toHaveBeenCalledWith({ data: 'Beethven' }),
    );
    await waitFor(() =>
      expect(document.querySelector('option[value="Ludwig van Beethoven"]')).not.toBeNull(),
    );

    mocks.searchComposerNames.mockClear();
    fireEvent.input(screen.getByLabelText('Credit 1 name'), {
      target: { value: 'Ludwig van Beethoven' },
    });

    expect(document.querySelector('option[value="Ludwig van Beethoven"]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(mocks.searchComposerNames).not.toHaveBeenCalled();

    const acceptedInput = screen.getByLabelText('Credit 1 name') as HTMLInputElement;
    acceptedInput.blur();
    acceptedInput.focus();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(mocks.searchComposerNames).not.toHaveBeenCalled();
  });

  it('keeps focus in a composer field as its value changes', async () => {
    render(() => (
      <LibraryItemForm kind="repertoire" credits={[{ person: '', role: 'COMPOSER' }]} />
    ));
    const input = screen.getByLabelText('Credit 1 name') as HTMLInputElement;
    input.focus();

    fireEvent.input(input, { target: { value: 'B' } });
    await waitFor(() => expect(screen.getByLabelText('Credit 1 name')).toBe(input));
    expect(document.activeElement).toBe(input);

    fireEvent.input(input, { target: { value: 'Be' } });
    await waitFor(() => expect(screen.getByLabelText('Credit 1 name')).toBe(input));
    expect(document.activeElement).toBe(input);
  });
});

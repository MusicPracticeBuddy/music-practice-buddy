import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { ExerciseNotation } from '@/components/ExerciseNotation';

const renderAbc = vi.fn();

vi.mock('abcjs', () => ({
  default: { renderAbc },
}));

afterEach(() => {
  cleanup();
  renderAbc.mockClear();
});

describe('ExerciseNotation', () => {
  it('displays text notation without invoking abcjs', () => {
    render(() => <ExerciseNotation notation={'Play slowly\nStay relaxed'} format="text" />);

    expect(screen.getByText(/Play slowly/).textContent).toBe('Play slowly\nStay relaxed');
    expect(screen.queryByText('Text')).toBeNull();
    expect(renderAbc).not.toHaveBeenCalled();
  });

  it('renders ABC notation into the score element', async () => {
    const notation = 'X:1\nK:C\nCDEF|';
    render(() => <ExerciseNotation notation={notation} format="abc" />);

    const score = screen.getByLabelText('Rendered music notation');
    expect(screen.queryByText('ABC notation')).toBeNull();
    await waitFor(() => {
      expect(renderAbc).toHaveBeenCalledWith(score, notation, { responsive: 'resize' });
    });
  });

  it('copies the exact ABC source used to render the score', async () => {
    const notation = 'X:1\nK:C\nCDEF|';
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(() => <ExerciseNotation notation={notation} format="abc" clef="bass" />);

    const copyButton = await screen.findByRole('button', {
      name: 'Copy ABC notation to clipboard',
    });
    fireEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('X:1\nK:C clef=bass\nCDEF|'));
    expect(screen.getByRole('button', { name: 'ABC notation copied' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Copied!');
  });

  it('re-renders when the ABC notation changes', async () => {
    const initialNotation = 'X:1\nK:C\nCDEF|';
    const updatedNotation = 'X:1\nK:G\nGABc|';
    const [notation, setNotation] = createSignal(initialNotation);
    render(() => <ExerciseNotation notation={notation()} format="abc" />);

    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      expect(renderAbc).toHaveBeenCalledWith(score, initialNotation, { responsive: 'resize' });
    });

    setNotation(updatedNotation);

    await waitFor(() => {
      expect(renderAbc).toHaveBeenLastCalledWith(score, updatedNotation, {
        responsive: 'resize',
      });
    });
  });

  it('preserves the selected sharp enharmonic in the visual renderer', async () => {
    const notation = 'X:1\nK:C\nCDEF|';

    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 6, sourceMode: 'major', targetMode: 'major', targetTonic: 'F#' }}
      />
    ));

    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1];
      expect(renderedNotation).toContain('K:F#major');
    });
  });

  it('preserves the selected flat enharmonic in the visual renderer', async () => {
    const notation = 'X:1\nK:C\nCDEF|';
    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 6, sourceMode: 'major', targetMode: 'major', targetTonic: 'Gb' }}
      />
    ));

    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1];
      expect(renderedNotation).toContain('K:Gbmajor');
    });
  });

  it('applies a display clef without modifying the source notation', async () => {
    const notation = 'X:1\nK:C clef=treble\nCDEF|';
    render(() => <ExerciseNotation notation={notation} format="abc" clef="bass" />);

    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1];
      expect(renderedNotation).toContain('K:C clef=bass');
    });
    expect(notation).toContain('clef=treble');
  });

  it('renders a parallel minor key without changing the stored notation', async () => {
    const notation = 'X:1\nK:C\nCDEF|';
    render(() => (
      <ExerciseNotation
        notation={notation}
        format="abc"
        transpose={{ steps: 0, sourceMode: 'major', targetMode: 'minor', targetTonic: 'C' }}
      />
    ));

    const score = screen.getByLabelText('Rendered music notation');
    await waitFor(() => {
      const renderedNotation = renderAbc.mock.calls.find(([target]) => target === score)?.[1];
      expect(renderedNotation).toContain('K:Cminor');
    });
    expect(notation).toContain('K:C\n');
  });
});

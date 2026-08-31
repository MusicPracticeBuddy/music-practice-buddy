import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { PracticeLibraryPanel } from '@/components/PracticeLibraryPanel';
import type { TemplateLibraryItem } from '@/data/sessionTemplates';

const parent: TemplateLibraryItem = {
  id: '10',
  type: 'REPERTOIRE',
  name: 'Etude Collection',
  detail: 'Repertoire',
  children: [
    {
      id: '11',
      type: 'REPERTOIRE',
      name: 'Etude No. 1',
      detail: 'Etude Collection',
      children: [],
    },
  ],
};

afterEach(cleanup);

describe('PracticeLibraryPanel repertoire hierarchy', () => {
  it('lets the user add the parent or expand and select a child', () => {
    const onSelect = vi.fn();
    render(() => (
      <PracticeLibraryPanel
        items={[parent]}
        type="REPERTOIRE"
        onTypeChange={() => undefined}
        onSelect={onSelect}
      />
    ));

    expect(screen.queryByRole('button', { name: /Etude No. 1/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Etude Collection.*\+ Add/ }));
    expect(onSelect).toHaveBeenLastCalledWith(parent);

    fireEvent.click(screen.getByRole('button', { name: 'Expand children of Etude Collection' }));
    fireEvent.click(screen.getByRole('button', { name: /Etude No. 1.*\+ Add/ }));
    expect(onSelect).toHaveBeenLastCalledWith(parent.children![0]);
  });

  it('reveals a matching child and its parent while searching', () => {
    render(() => (
      <PracticeLibraryPanel
        items={[parent]}
        type="REPERTOIRE"
        onTypeChange={() => undefined}
        onSelect={() => undefined}
      />
    ));

    fireEvent.input(screen.getByRole('searchbox', { name: 'Search repertoire' }), {
      target: { value: 'No. 1' },
    });

    expect(screen.getByText('Etude Collection', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Etude No. 1', { selector: 'strong' })).toBeTruthy();
  });

  it('paginates picker results', () => {
    const items = Array.from({ length: 21 }, (_, index): TemplateLibraryItem => ({
      id: String(index + 1),
      type: 'EXERCISE',
      name: `Exercise ${String(index + 1).padStart(2, '0')}`,
      detail: 'Exercise',
    }));
    render(() => (
      <PracticeLibraryPanel
        items={items}
        type="EXERCISE"
        onTypeChange={() => undefined}
        onSelect={() => undefined}
      />
    ));

    expect(screen.getByText('Exercise 01')).toBeTruthy();
    expect(screen.queryByText('Exercise 21')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByText('Exercise 01')).toBeNull();
    expect(screen.getByText('Exercise 21')).toBeTruthy();
    expect(screen.getByText('2 / 2')).toBeTruthy();
  });

  it('requests public repertoire pages from the server', () => {
    const onPageChange = vi.fn();
    render(() => (
      <PracticeLibraryPanel
        items={[]}
        publicRepertoireItems={[parent]}
        searchPublicRepertoire
        type="REPERTOIRE"
        onTypeChange={() => undefined}
        onSelect={() => undefined}
        publicRepertoirePagination={{
          page: 1,
          total: 25,
          totalPages: 2,
          onPageChange,
          onSearchChange: () => undefined,
        }}
      />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});

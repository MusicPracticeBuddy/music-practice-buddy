import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

vi.mock('@tanstack/solid-router', () => ({
  Link: (props: { children: unknown }) => props.children,
}));

afterEach(cleanup);

describe('DashboardPage edition contributions', () => {
  it('renders a panel supplied by the application edition', () => {
    render(() => (
      <DashboardPage
        data={{
          counts: { repertoire: 0, exercises: 0, sessions: 0, completedSessions: 0 },
          minutesPracticed: 0,
          nextSession: null,
        }}
        panels={[{ id: 'proof', component: () => <p>Expanded dashboard panel</p> }]}
      />
    ));

    expect(screen.getByText('Expanded dashboard panel')).toBeTruthy();
  });
});

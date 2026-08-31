import { Outlet, createFileRoute } from '@tanstack/solid-router';

export const Route = createFileRoute('/exercises')({
  component: () => <Outlet />,
});

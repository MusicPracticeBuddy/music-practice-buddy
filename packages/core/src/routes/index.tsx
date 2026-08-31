import { createFileRoute } from '@tanstack/solid-router'
import { getDashboard } from '@/data/dashboard'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

export const Route = createFileRoute('/')({
  loader: () => getDashboard(),
  component: DashboardRoute,
})

function DashboardRoute() {
  const data = Route.useLoaderData()
  const context = Route.useRouteContext()
  return <DashboardPage data={data()} panels={context().edition.dashboardPanels} />
}

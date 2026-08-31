import { createFileRoute } from '@tanstack/solid-router'
import { getPracticeInsights } from '../features/insights/data'

export const Route = createFileRoute('/insights')({
  loader: () => getPracticeInsights(),
  component: PracticeInsightsPage,
})

function PracticeInsightsPage() {
  const insights = Route.useLoaderData()
  return (
    <main class="page">
      <section class="hero">
        <p class="eyebrow">Pro proof feature</p>
        <h1>Practice insights</h1>
        <p class="lede">
          This authenticated route is owned by the Pro application and composed with every public
          core route at build time.
        </p>
      </section>
      <section class="stat-grid" aria-label="Practice insights">
        <article class="stat-card">
          <span>Completed sessions</span>
          <strong>{insights().completedSessions}</strong>
        </article>
        <article class="stat-card">
          <span>Practice time</span>
          <strong>{insights().minutesPracticed}</strong>
          <small>minutes</small>
        </article>
        <article class="stat-card">
          <span>Active days</span>
          <strong>{insights().activeDays}</strong>
        </article>
      </section>
    </main>
  )
}

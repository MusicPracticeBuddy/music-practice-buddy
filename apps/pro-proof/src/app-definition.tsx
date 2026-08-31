import { Link } from '@tanstack/solid-router'
import type { MpbEdition } from '@music-practice-buddy/core/contracts'

function InsightsNavigation() {
  return (
    <Link to="/insights" activeProps={{ class: 'active' }}>
      Insights
    </Link>
  )
}

function PracticeInsightsPanel() {
  return (
    <section class="feature-card" aria-label="Pro practice insights">
      <div>
        <p class="eyebrow">Pro extension</p>
        <h2>Practice insights</h2>
        <p>
          This panel is contributed by the Pro edition without changing the core dashboard route.
        </p>
      </div>
      <Link class="secondary-button" to="/insights">
        View insights
      </Link>
    </section>
  )
}

export const proProofEdition: MpbEdition = {
  id: 'pro-proof',
  displayName: 'Music Practice Buddy Pro',
  primaryNavigation: [{ id: 'insights', component: InsightsNavigation }],
  dashboardPanels: [{ id: 'practice-insights', component: PracticeInsightsPanel }],
}

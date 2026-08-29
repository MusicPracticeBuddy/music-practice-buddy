import { Link, createFileRoute } from '@tanstack/solid-router'
import { ExerciseCatalogSearch } from '@/components/ExerciseCatalogSearch'
import { EMPTY_EXERCISE_CATALOG_SEARCH, getPublicExerciseCatalogPage } from '@/data/exercises'
import { getMusicianInstrumentIds } from '@/data/preferences'
import { getInstruments } from '@/data/repertoire'

export const Route = createFileRoute('/exercises/search')({
  loader: async () => {
    const instrumentIds = await getMusicianInstrumentIds()
    const [catalog, instruments] = await Promise.all([
      getPublicExerciseCatalogPage({
        data: { ...EMPTY_EXERCISE_CATALOG_SEARCH, instrumentIds },
      }),
      getInstruments(),
    ])
    return { catalog, instruments, instrumentIds }
  },
  component: SearchExercises,
})

function SearchExercises() {
  const data = Route.useLoaderData()

  return (
    <main class="page">
      <header class="page-header catalog-page-header">
        <div>
          <p class="eyebrow">My Library</p>
          <h1>Find exercises</h1>
          <p class="lede">Search public exercises shared by other musicians.</p>
        </div>
        <div class="library-section-actions">
          <Link class="secondary-button" to="/library">
            Cancel
          </Link>
          <Link class="primary-button" to="/exercises/new">
            + Create exercise
          </Link>
        </div>
      </header>

      <ExerciseCatalogSearch
        initialPage={data().catalog}
        instruments={data().instruments}
        initialInstrumentIds={data().instrumentIds}
      />
    </main>
  )
}

import { Link, createFileRoute } from '@tanstack/solid-router'
import { ExerciseCatalogSearch } from '@/components/ExerciseCatalogSearch'
import { EMPTY_EXERCISE_CATALOG_SEARCH, getPublicExerciseCatalogPage } from '@/data/exercises'

export const Route = createFileRoute('/exercises/search')({
  loader: () => getPublicExerciseCatalogPage({ data: EMPTY_EXERCISE_CATALOG_SEARCH }),
  component: SearchExercises,
})

function SearchExercises() {
  const catalog = Route.useLoaderData()

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

      <ExerciseCatalogSearch initialPage={catalog()} />
    </main>
  )
}

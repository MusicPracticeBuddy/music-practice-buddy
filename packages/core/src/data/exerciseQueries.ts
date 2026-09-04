import { queryOptions } from '@tanstack/solid-query';
import {
  getExerciseLibraryPage,
  getPublicExerciseCatalogPage,
  type ExerciseCatalogSearchInput,
  type ExerciseLibrarySearchInput,
} from '@/data/exercises';

export const exerciseKeys = {
  all: ['exercises'] as const,
  catalogs: () => [...exerciseKeys.all, 'catalog'] as const,
  catalog: (search: ExerciseCatalogSearchInput) => [...exerciseKeys.catalogs(), search] as const,
  libraries: () => [...exerciseKeys.all, 'library'] as const,
  library: (search: ExerciseLibrarySearchInput) => [...exerciseKeys.libraries(), search] as const,
};

export function exerciseCatalogQueryOptions(search: ExerciseCatalogSearchInput) {
  return queryOptions({
    queryKey: exerciseKeys.catalog(search),
    queryFn: () => getPublicExerciseCatalogPage({ data: search }),
    staleTime: 30_000,
  });
}

export function exerciseLibraryQueryOptions(search: ExerciseLibrarySearchInput) {
  return queryOptions({
    queryKey: exerciseKeys.library(search),
    queryFn: () => getExerciseLibraryPage({ data: search }),
    staleTime: 30_000,
  });
}

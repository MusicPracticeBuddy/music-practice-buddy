import { queryOptions } from '@tanstack/solid-query';
import {
  getPublicRepertoireCatalogPage,
  getRepertoireLibraryPage,
  type CatalogSearchInput,
  type RepertoireLibrarySearchInput,
} from '@/data/repertoire';

export const repertoireKeys = {
  all: ['repertoire'] as const,
  catalogs: () => [...repertoireKeys.all, 'catalog'] as const,
  catalog: (search: CatalogSearchInput) => [...repertoireKeys.catalogs(), search] as const,
  libraries: () => [...repertoireKeys.all, 'library'] as const,
  library: (search: RepertoireLibrarySearchInput) =>
    [...repertoireKeys.libraries(), search] as const,
};

export function repertoireCatalogQueryOptions(search: CatalogSearchInput) {
  return queryOptions({
    queryKey: repertoireKeys.catalog(search),
    queryFn: () => getPublicRepertoireCatalogPage({ data: search }),
    staleTime: 30_000,
  });
}

export function repertoireLibraryQueryOptions(search: RepertoireLibrarySearchInput) {
  return queryOptions({
    queryKey: repertoireKeys.library(search),
    queryFn: async () => {
      const result = await getRepertoireLibraryPage({ data: search });
      const lastPage = Math.max(1, result.totalPages);
      return result.page > lastPage
        ? getRepertoireLibraryPage({ data: { ...search, page: lastPage } })
        : result;
    },
    staleTime: 30_000,
  });
}

import { createFileRoute } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'

export const Route = createFileRoute('/repertoire/new')({
  component: () => <LibraryItemForm kind="repertoire" />,
})

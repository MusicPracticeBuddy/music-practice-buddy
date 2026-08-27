import { createFileRoute } from '@tanstack/solid-router'
import { LibraryItemForm } from '@/components/LibraryItemForm'

export const Route = createFileRoute('/exercises/new')({
  component: () => <LibraryItemForm kind="exercise" />,
})

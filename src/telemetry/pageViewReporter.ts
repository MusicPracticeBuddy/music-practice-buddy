import { createServerFn } from '@tanstack/solid-start'
import { recordPageView } from '@/telemetry/provider.server'
import type { PageView } from '@/telemetry/telemetry'

function validatePageView(input: PageView): PageView {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.path !== 'string' ||
    !input.path.startsWith('/') ||
    input.path.length > 2048 ||
    typeof input.routeId !== 'string' ||
    input.routeId.length === 0 ||
    input.routeId.length > 256
  ) {
    throw new Error('Invalid page view')
  }
  return input
}

export const reportPageView = createServerFn({ method: 'POST' })
  .validator(validatePageView)
  .handler(async ({ data }) => recordPageView(data))

import { createServerFn } from '@tanstack/solid-start'
import { recordPageView } from '@/telemetry/provider.server'
import type { PageViewData } from '@/telemetry/telemetry'
import { isTraceId } from '@/telemetry/trace'

function validatePageView(input: PageViewData): PageViewData {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.path !== 'string' ||
    !input.path.startsWith('/') ||
    input.path.length > 2048 ||
    typeof input.routeId !== 'string' ||
    input.routeId.length === 0 ||
    input.routeId.length > 256 ||
    !isTraceId(input.traceId)
  ) {
    throw new Error('Invalid page view')
  }
  return input
}

export const reportPageView = createServerFn({ method: 'POST' })
  .validator(validatePageView)
  .handler(async ({ data }) => recordPageView(data))

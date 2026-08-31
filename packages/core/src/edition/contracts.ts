import type { Component } from 'solid-js'

export type EditionContribution = Readonly<{
  id: string
  component: Component
}>

export type MpbEdition = Readonly<{
  id: string
  displayName: string
  primaryNavigation: readonly EditionContribution[]
  dashboardPanels: readonly EditionContribution[]
}>

export type MpbRouterContext = Readonly<{
  edition: MpbEdition
}>

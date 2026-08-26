import * as Solid from 'solid-js'
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import '@/styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Music Practice Buddy',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: Solid.JSX.Element }>) {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <div class="app-shell">
          <header class="site-header">
            <Link class="brand" to="/">
              <span class="brand-mark" aria-hidden="true">
                ♩
              </span>
              <span>
                <strong>Practice Buddy</strong>
                <small>Music, made daily</small>
              </span>
            </Link>
            <nav aria-label="Primary navigation">
              <Link to="/" activeOptions={{ exact: true }} activeProps={{ class: 'active' }}>
                Overview
              </Link>
              <Link to="/repertoire" activeProps={{ class: 'active' }}>
                Repertoire
              </Link>
              <Link to="/exercises" activeProps={{ class: 'active' }}>
                Exercises
              </Link>
              <Link to="/sessions" activeProps={{ class: 'active' }}>
                Sessions
              </Link>
              <Link to="/templates" activeProps={{ class: 'active' }}>
                Templates
              </Link>
            </nav>
          </header>
          <Solid.Suspense>{children}</Solid.Suspense>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

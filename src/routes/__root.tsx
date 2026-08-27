import * as Solid from 'solid-js'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  redirect,
  useRouter,
} from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { AuthenticatedUser } from '@/auth/types'
import { getCurrentUser, logout } from '@/data/auth'
import '@/styles.css'

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser()
    const isLogin = location.pathname === '/login'
    if (!user && !isLogin) {
      throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
    }
    if (user && isLogin) throw redirect({ to: '/', replace: true })
    return { user }
  },
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
  const context = Route.useRouteContext()
  return (
    <RootDocument>
      <Solid.Show when={context().user} fallback={<Outlet />}>
        {(user) => <AuthenticatedShell user={user()} />}
      </Solid.Show>
    </RootDocument>
  )
}

function AuthenticatedShell({ user }: Readonly<{ user: AuthenticatedUser }>) {
  const router = useRouter()

  async function signOut() {
    await logout()
    await router.invalidate()
  }

  async function switchUser() {
    await logout()
    router.history.push('/login')
    await router.invalidate()
  }

  return (
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
          <Link to="/library" activeProps={{ class: 'active' }}>
            My Library
          </Link>
          <Link to="/sessions" activeProps={{ class: 'active' }}>
            Sessions
          </Link>
          <Link to="/templates" activeProps={{ class: 'active' }}>
            Templates
          </Link>
        </nav>
        <div class="user-menu">
          <span>{user.displayName}</span>
          <button type="button" onClick={switchUser}>
            Switch user
          </button>
          <button type="button" onClick={signOut}>
            Log out
          </button>
        </div>
      </header>
      <Solid.Suspense>
        <Outlet />
      </Solid.Suspense>
    </div>
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
        {children}
        <Scripts />
      </body>
    </html>
  )
}

import * as Solid from 'solid-js';
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouter,
} from '@tanstack/solid-router';
import { Dynamic, HydrationScript } from 'solid-js/web';
import type { AuthenticatedUser } from '@/auth/types';
import { getCurrentUser, getDevelopmentLoginEnabled, logout } from '@/data/auth';
import type { MpbRouterContext } from '@/edition/contracts';
import '@/styles.css';

export const Route = createRootRouteWithContext<MpbRouterContext>()({
  beforeLoad: async ({ context, location }) => {
    const [user, developmentLoginEnabled] = await Promise.all([
      getCurrentUser(),
      getDevelopmentLoginEnabled(),
    ]);
    const isLogin = location.pathname === '/login';
    const isPublicRoute =
      isLogin || context.edition.publicRoutes?.includes(location.pathname) === true;
    if (!user && !isPublicRoute) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href, authError: undefined },
        replace: true,
      });
    }
    if (user && isLogin) throw redirect({ to: '/', replace: true });
    return { developmentLoginEnabled, user };
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
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <main class="page not-found-page">
      <section class="hero">
        <p class="eyebrow">404 · Page not found</p>
        <h1>That page missed the beat.</h1>
        <p class="lede">The page you’re looking for doesn’t exist or may have moved.</p>
        <Link class="primary-button" to="/">
          Back to overview
        </Link>
      </section>
    </main>
  );
}

function RootComponent() {
  const context = Route.useRouteContext();
  return (
    <RootDocument>
      <Solid.Show when={context().user} fallback={<Outlet />}>
        {(user) => (
          <AuthenticatedShell
            developmentLoginEnabled={context().developmentLoginEnabled}
            edition={context().edition}
            user={user()}
          />
        )}
      </Solid.Show>
    </RootDocument>
  );
}

function AuthenticatedShell({
  developmentLoginEnabled,
  edition,
  user,
}: Readonly<{
  developmentLoginEnabled: boolean;
  edition: MpbRouterContext['edition'];
  user: AuthenticatedUser;
}>) {
  const router = useRouter();

  async function signOut() {
    await logout();
    router.clearCache();
    await router.invalidate({ sync: true });
  }

  async function switchUser() {
    await logout();
    router.clearCache();
    router.history.push('/login');
    await router.invalidate({ sync: true });
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
          <Solid.For each={edition.primaryNavigation}>
            {(contribution) => <Dynamic component={contribution.component} />}
          </Solid.For>
        </nav>
        <div class="user-menu">
          <span>{user.displayName}</span>
          <Link to="/settings" activeProps={{ class: 'active' }}>
            Settings
          </Link>
          <Solid.Show when={developmentLoginEnabled}>
            <button type="button" onClick={switchUser}>
              Switch user
            </button>
          </Solid.Show>
          <button type="button" onClick={signOut}>
            Log out
          </button>
        </div>
      </header>
      <Solid.Suspense>
        <Outlet />
      </Solid.Suspense>
    </div>
  );
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
  );
}

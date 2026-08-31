import { Dynamic } from 'solid-js/web';
import { For, Show, createSignal } from 'solid-js';
import { createFileRoute, useRouter } from '@tanstack/solid-router';
import { createDevelopmentUser, developmentLogin, getLoginConfiguration } from '@/data/auth';

function safeRedirect(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
    authError: typeof search.authError === 'string' ? search.authError : undefined,
  }),
  loader: () => getLoginConfiguration(),
  component: LoginPage,
});

function LoginPage() {
  const configuration = Route.useLoaderData();
  const context = Route.useRouteContext();
  const search = Route.useSearch();
  const router = useRouter();
  const [submitting, setSubmitting] = createSignal<string | null>(null);
  const [newUsername, setNewUsername] = createSignal('');
  const [error, setError] = createSignal('');

  function authenticationError() {
    const errorKey = search().authError;
    if (!errorKey) return undefined;
    return context()
      .edition.loginProviders.map((provider) => provider.authenticationErrors[errorKey])
      .find((message) => message !== undefined);
  }

  async function login(username: string) {
    setSubmitting(username);
    setError('');
    try {
      await developmentLogin({ data: username });
      router.clearCache();
      router.history.push(search().redirect);
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.');
      setSubmitting(null);
    }
  }

  async function createUser(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting('new-user');
    setError('');
    try {
      await createDevelopmentUser({ data: newUsername() });
      router.clearCache();
      router.history.push(search().redirect);
      await router.invalidate({ sync: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'User creation failed.');
      setSubmitting(null);
    }
  }

  return (
    <main class="login-page">
      <section class="login-card">
        <div class="brand login-brand">
          <span class="brand-mark" aria-hidden="true">
            ♩
          </span>
          <span>
            <strong>Practice Buddy</strong>
            <small>Music, made daily</small>
          </span>
        </div>
        <p class="eyebrow">Welcome back</p>
        <h1>Who’s practicing?</h1>
        <Show when={authenticationError()}>
          {(message) => (
            <p class="form-error" role="alert">
              {message()}
            </p>
          )}
        </Show>
        <Show when={context().edition.loginProviders.length > 0}>
          <div class="login-provider-list">
            <For each={context().edition.loginProviders}>
              {(provider) => (
                <Dynamic component={provider.component} redirect={search().redirect} />
              )}
            </For>
          </div>
        </Show>
        <Show
          when={configuration().developmentEnabled}
          fallback={
            <Show when={context().edition.loginProviders.length === 0}>
              <p class="muted">Production sign-in providers have not been configured yet.</p>
            </Show>
          }
        >
          <Show when={context().edition.loginProviders.length > 0}>
            <div class="login-divider">
              <span>or use a local test user</span>
            </div>
          </Show>
          <p class="muted">Choose a local test musician to continue.</p>
          <div class="development-user-list">
            <For each={configuration().users}>
              {(user) => (
                <button
                  type="button"
                  disabled={submitting() !== null}
                  onClick={() => login(user.username)}
                >
                  <strong>{user.displayName}</strong>
                  <small>@{user.username}</small>
                </button>
              )}
            </For>
          </div>
          <div class="login-divider">
            <span>or create a test user</span>
          </div>
          <form class="development-user-form" onSubmit={createUser}>
            <label class="field-label" for="new-development-username">
              Username
            </label>
            <div>
              <input
                id="new-development-username"
                class="text-input"
                value={newUsername()}
                onInput={(event) => setNewUsername(event.currentTarget.value)}
                placeholder="new-musician"
                maxlength="50"
                autocomplete="username"
                required
              />
              <button class="primary-button" type="submit" disabled={submitting() !== null}>
                {submitting() === 'new-user' ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </form>
        </Show>
        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
      </section>
    </main>
  );
}

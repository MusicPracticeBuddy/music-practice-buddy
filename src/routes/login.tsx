import { For, Show, createSignal } from 'solid-js'
import { createFileRoute, useRouter } from '@tanstack/solid-router'
import { developmentLogin, getLoginConfiguration } from '@/data/auth'

function safeRedirect(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  loader: () => getLoginConfiguration(),
  component: LoginPage,
})

function LoginPage() {
  const configuration = Route.useLoaderData()
  const search = Route.useSearch()
  const router = useRouter()
  const [submitting, setSubmitting] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')

  async function login(username: string) {
    setSubmitting(username)
    setError('')
    try {
      await developmentLogin({ data: username })
      router.history.push(search().redirect)
      await router.invalidate()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in failed.')
      setSubmitting(null)
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
        <Show
          when={configuration().developmentEnabled}
          fallback={<p class="muted">Production sign-in providers have not been configured yet.</p>}
        >
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
        </Show>
        <Show when={error()}>
          <p class="form-error" role="alert">
            {error()}
          </p>
        </Show>
      </section>
    </main>
  )
}

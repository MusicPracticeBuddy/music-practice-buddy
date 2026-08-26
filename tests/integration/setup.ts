import { inject, vi } from 'vitest'

const databaseUrl = new URL(inject('testDatabaseUri'))
process.env.PGHOST = databaseUrl.hostname
process.env.PGPORT = databaseUrl.port
process.env.POSTGRES_DB = databaseUrl.pathname.slice(1)
process.env.POSTGRES_USER = decodeURIComponent(databaseUrl.username)
process.env.POSTGRES_PASSWORD = decodeURIComponent(databaseUrl.password)

type ServerContext = { data: unknown }
type Validator = (input: unknown) => unknown
type Handler = (context: ServerContext) => unknown

function identityValidator(input: unknown) {
  return input
}

vi.mock('@tanstack/solid-start', () => ({
  createServerFn: () => {
    let validate: Validator = identityValidator
    const builder = {
      validator(nextValidator: Validator) {
        validate = nextValidator
        return builder
      },
      handler(nextHandler: Handler) {
        return (context: ServerContext) => nextHandler({ data: validate(context?.data) })
      },
    }
    return builder
  },
}))

import { inject, vi } from 'vitest';

const databaseUrl = new URL(inject('testDatabaseUri'));
process.env.PGHOST = databaseUrl.hostname;
process.env.PGPORT = databaseUrl.port;
process.env.POSTGRES_DB = databaseUrl.pathname.slice(1);
process.env.POSTGRES_USER = decodeURIComponent(databaseUrl.username);
process.env.POSTGRES_PASSWORD = decodeURIComponent(databaseUrl.password);

type ServerContext = {
  data: unknown;
  context?: {
    user: {
      musicianId: string;
      displayName: string;
      isAdmin: boolean;
    };
  };
};
type Validator = (input: unknown) => unknown;
type Handler = (context: ServerContext) => unknown;

function identityValidator(input: unknown) {
  return input;
}

vi.mock('@tanstack/solid-start/server', () => ({
  getCookie: () => undefined,
  setCookie: () => undefined,
  deleteCookie: () => undefined,
}));

vi.mock('@tanstack/solid-start', () => ({
  createMiddleware: () => ({
    server: () => ({}),
  }),
  createServerFn: () => {
    let validate: Validator = identityValidator;
    const builder = {
      middleware() {
        return builder;
      },
      validator(nextValidator: Validator) {
        validate = nextValidator;
        return builder;
      },
      handler(nextHandler: Handler) {
        return (context: ServerContext) =>
          nextHandler({
            data: validate(context?.data),
            context: {
              user: {
                musicianId: process.env.TEST_AUTH_MUSICIAN_ID ?? '1',
                displayName: 'Integration test musician',
                isAdmin: process.env.TEST_AUTH_IS_ADMIN !== 'false',
              },
            },
          });
      },
    };
    return builder;
  },
}));

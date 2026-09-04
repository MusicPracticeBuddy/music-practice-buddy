import type { Component } from 'solid-js';

export type EditionContribution = Readonly<{
  id: string;
  component: Component;
}>;

export type LoginProviderProps = Readonly<{
  redirect: string;
}>;

export type LoginProviderContribution = Readonly<{
  id: string;
  component: Component<LoginProviderProps>;
  authenticationErrors: Readonly<Record<string, string>>;
}>;

export type MpbEdition = Readonly<{
  id: string;
  displayName: string;
  loginProviders: readonly LoginProviderContribution[];
  primaryNavigation: readonly EditionContribution[];
}>;

export type MpbRouterContext = Readonly<{
  edition: MpbEdition;
}>;

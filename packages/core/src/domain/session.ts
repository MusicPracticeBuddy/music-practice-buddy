type ValueOf<T> = T[keyof T];

export const SESSION_STATUS = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type SessionStatus = ValueOf<typeof SESSION_STATUS>;

export const SESSION_TIMING_MODE = {
  MANUAL: 'MANUAL',
  AUTO: 'AUTO',
} as const;

export type SessionTimingMode = ValueOf<typeof SESSION_TIMING_MODE>;

export const SESSION_ITEM_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  SKIPPED: 'SKIPPED',
} as const;

export type SessionItemStatus = ValueOf<typeof SESSION_ITEM_STATUS>;

export const SESSION_ITEM_ACTION = {
  START: 'START',
  COMPLETE: 'COMPLETE',
  SKIP: 'SKIP',
  RESET: 'RESET',
} as const;

export type SessionItemAction = ValueOf<typeof SESSION_ITEM_ACTION>;

export const PRACTICE_ITEM_TYPE = {
  SECTION: 'SECTION',
  EXERCISE: 'EXERCISE',
  REPERTOIRE: 'REPERTOIRE',
} as const;

export type PracticeItemType = ValueOf<typeof PRACTICE_ITEM_TYPE>;

export const LIBRARY_ITEM_TYPE = {
  EXERCISE: PRACTICE_ITEM_TYPE.EXERCISE,
  REPERTOIRE: PRACTICE_ITEM_TYPE.REPERTOIRE,
} as const;

export type LibraryItemType = ValueOf<typeof LIBRARY_ITEM_TYPE>;

export function isPracticeItemType(value: unknown): value is PracticeItemType {
  return Object.values(PRACTICE_ITEM_TYPE).some((type) => type === value);
}

export function isLibraryItemType(value: unknown): value is LibraryItemType {
  return Object.values(LIBRARY_ITEM_TYPE).some((type) => type === value);
}

export function isSessionTimingMode(value: unknown): value is SessionTimingMode {
  return Object.values(SESSION_TIMING_MODE).some((mode) => mode === value);
}

export function isSessionItemAction(value: unknown): value is SessionItemAction {
  return Object.values(SESSION_ITEM_ACTION).some((action) => action === value);
}

export function isIncompleteSessionItemStatus(status: SessionItemStatus): boolean {
  return status === SESSION_ITEM_STATUS.NOT_STARTED || status === SESSION_ITEM_STATUS.IN_PROGRESS;
}

export function isResolvedSessionItemStatus(status: SessionItemStatus): boolean {
  return status === SESSION_ITEM_STATUS.COMPLETE || status === SESSION_ITEM_STATUS.SKIPPED;
}

export function appendKeyToSessionNote(note: string, keyLabel: string) {
  const prefix = `In ${keyLabel}: `;
  if (!note) return prefix;
  return `${note}${note.endsWith('\n') ? '' : '\n'}${prefix}`;
}

export function appendRepertoireChildToSessionNote(note: string, title: string) {
  const prefix = `${title}: `;
  if (!note) return prefix;
  return `${note}${note.endsWith('\n') ? '' : '\n'}${prefix}`;
}

export const EXERCISE_NOTATION_FORMAT = {
  TEXT: 'text',
  ABC: 'abc',
} as const;

export type ExerciseNotationFormat =
  (typeof EXERCISE_NOTATION_FORMAT)[keyof typeof EXERCISE_NOTATION_FORMAT];

export function isExerciseNotationFormat(value: string): value is ExerciseNotationFormat {
  return Object.values(EXERCISE_NOTATION_FORMAT).includes(value as ExerciseNotationFormat);
}

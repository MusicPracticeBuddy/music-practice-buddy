declare module 'abc-notation-transposition' {
  type TransposeOptions = {
    accidentalNumberPreference: number;
    preferSharpsOrFlats: number;
  };

  export const ACCIDENTAL_NUMBER_PREFERENCES: {
    PREFER_FEWER: number;
    NO_PREFERENCE: number;
    PREFER_MORE: number;
  };

  export const SHARPS_OR_FLATS_PREFERENCES: {
    PRESERVE_ORIGINAL: number;
    PREFER_FLATS: number;
    PREFER_SHARPS: number;
  };

  export function transposeABC(
    notation: string,
    halfSteps: number,
    options?: TransposeOptions,
  ): string;
}

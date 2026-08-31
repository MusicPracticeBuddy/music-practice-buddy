import type { InstrumentOption } from '@/data/repertoire';

export type InstrumentOptionGroup = {
  label: string;
  instruments: InstrumentOption[];
};

export function instrumentFamilyLabel(family: string) {
  return family
    .toLocaleLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ');
}

export function groupInstrumentOptions(instruments: InstrumentOption[]): InstrumentOptionGroup[] {
  const preferred = instruments.filter((instrument) => instrument.isPreferred);
  const families = new Map<string, InstrumentOption[]>();

  for (const instrument of instruments) {
    if (instrument.isPreferred) continue;
    const familyInstruments = families.get(instrument.family) ?? [];
    familyInstruments.push(instrument);
    families.set(instrument.family, familyInstruments);
  }

  return [
    ...(preferred.length > 0 ? [{ label: 'My instruments', instruments: preferred }] : []),
    ...[...families.entries()].map(([family, familyInstruments]) => ({
      label: instrumentFamilyLabel(family),
      instruments: familyInstruments,
    })),
  ];
}

export function groupExpandedInstrumentOptions(
  instruments: InstrumentOption[],
): InstrumentOptionGroup[] {
  const preferred = instruments.filter((instrument) => instrument.isPreferred);
  const families = new Map<string, InstrumentOption[]>();

  for (const instrument of instruments) {
    const familyInstruments = families.get(instrument.family) ?? [];
    familyInstruments.push(instrument);
    families.set(instrument.family, familyInstruments);
  }

  return [
    ...(preferred.length > 0 ? [{ label: 'My instruments', instruments: preferred }] : []),
    ...[...families.entries()].map(([family, familyInstruments]) => ({
      label: instrumentFamilyLabel(family),
      instruments: familyInstruments,
    })),
  ];
}

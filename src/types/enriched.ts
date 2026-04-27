import type { Schichtplan } from './app';

export type EnrichedSchichtplan = Schichtplan & {
  mitarbeiter_auswahlName: string;
  schichttyp_auswahlName: string;
};

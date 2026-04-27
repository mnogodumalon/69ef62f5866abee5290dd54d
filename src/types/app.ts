// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Mitarbeiter {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    personalnummer?: string;
    email?: string;
    telefon?: string;
    position?: string;
  };
}

export interface Schichttypen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    schichtname?: string;
    startzeit?: string;
    endzeit?: string;
    beschreibung?: string;
    farbcode?: string;
  };
}

export interface Schichtplan {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    mitarbeiter_auswahl?: string; // applookup -> URL zu 'Mitarbeiter' Record
    schichttyp_auswahl?: string; // applookup -> URL zu 'Schichttypen' Record
    notizen?: string;
  };
}

export const APP_IDS = {
  MITARBEITER: '69ef62e2b6a48346be756872',
  SCHICHTTYPEN: '69ef62e6d202ece719d2a852',
  SCHICHTPLAN: '69ef62e79b0fffcf8efd3748',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'mitarbeiter': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'personalnummer': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'position': 'string/text',
  },
  'schichttypen': {
    'schichtname': 'string/text',
    'startzeit': 'string/text',
    'endzeit': 'string/text',
    'beschreibung': 'string/textarea',
    'farbcode': 'string/text',
  },
  'schichtplan': {
    'datum': 'date/date',
    'mitarbeiter_auswahl': 'applookup/select',
    'schichttyp_auswahl': 'applookup/select',
    'notizen': 'string/textarea',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateMitarbeiter = StripLookup<Mitarbeiter['fields']>;
export type CreateSchichttypen = StripLookup<Schichttypen['fields']>;
export type CreateSchichtplan = StripLookup<Schichtplan['fields']>;
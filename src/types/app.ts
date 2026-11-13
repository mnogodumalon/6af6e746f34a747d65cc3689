import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Umfragen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    finaler_termin?: RecordUrl; // applookup -> URL zu 'Terminvorschlaege' Record
    titel?: string;
    beschreibung?: string;
    ort?: string;
    status?: LookupValue;
  };
}

export interface Terminvorschlaege {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    beginn?: string; // Format: YYYY-MM-DD oder ISO String
    ende?: string; // Format: YYYY-MM-DD oder ISO String
    umfrage?: RecordUrl; // applookup -> URL zu 'Umfragen' Record
  };
}

export interface Antworten {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    umfrage?: RecordUrl; // applookup -> URL zu 'Umfragen' Record
    terminvorschlag?: RecordUrl; // applookup -> URL zu 'Terminvorschlaege' Record
    teilnehmer_vorname?: string;
    teilnehmer_nachname?: string;
    antwort?: LookupValue;
  };
}

export const APP_IDS = {
  UMFRAGEN: '6af6e7330a01dca53569f87d',
  TERMINVORSCHLAEGE: '6af6e7378effe68c72d780b5',
  ANTWORTEN: '6af6e73abcf0cc701ca9a859',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'umfragen': {
    status: [{ key: "offen", get label() { return lookupLabel('umfragen', 'status', "offen") ?? "Offen"; } }, { key: "geschlossen", get label() { return lookupLabel('umfragen', 'status', "geschlossen") ?? "Geschlossen"; } }],
  },
  'antworten': {
    antwort: [{ key: "ja", get label() { return lookupLabel('antworten', 'antwort', "ja") ?? "Ja"; } }, { key: "vielleicht", get label() { return lookupLabel('antworten', 'antwort', "vielleicht") ?? "Vielleicht"; } }, { key: "nein", get label() { return lookupLabel('antworten', 'antwort', "nein") ?? "Nein"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'umfragen': {
    'finaler_termin': 'applookup/select',
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'ort': 'string/text',
    'status': 'lookup/radio',
  },
  'terminvorschlaege': {
    'beginn': 'date/datetimeminute',
    'ende': 'date/datetimeminute',
    'umfrage': 'applookup/select',
  },
  'antworten': {
    'umfrage': 'applookup/select',
    'terminvorschlag': 'applookup/select',
    'teilnehmer_vorname': 'string/text',
    'teilnehmer_nachname': 'string/text',
    'antwort': 'lookup/radio',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateUmfragen = StripLookup<Umfragen['fields']>;
export type CreateTerminvorschlaege = StripLookup<Terminvorschlaege['fields']>;
export type CreateAntworten = StripLookup<Antworten['fields']>;
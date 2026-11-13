import type { Antworten, Terminvorschlaege, Umfragen } from './app';

export type EnrichedUmfragen = Umfragen & {
  finaler_terminName: string;
};

export type EnrichedTerminvorschlaege = Terminvorschlaege & {
  umfrageName: string;
};

export type EnrichedAntworten = Antworten & {
  umfrageName: string;
  terminvorschlagName: string;
};

import type { EnrichedAntworten, EnrichedTerminvorschlaege, EnrichedUmfragen } from '@/types/enriched';
import type { Antworten, Terminvorschlaege, Umfragen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { displayPart } from '@/lib/journey/rules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => displayPart(r.fields[f])).filter(Boolean).join(' ').trim();
}

interface UmfragenMaps {
  terminvorschlaegeMap: Map<string, Terminvorschlaege>;
}

export function enrichUmfragen(
  umfragen: Umfragen[],
  maps: UmfragenMaps
): EnrichedUmfragen[] {
  return umfragen.map(r => ({
    ...r,
    finaler_terminName: resolveDisplay(r.fields.finaler_termin, maps.terminvorschlaegeMap, 'beginn'),
  }));
}

interface TerminvorschlaegeMaps {
  umfragenMap: Map<string, Umfragen>;
}

export function enrichTerminvorschlaege(
  terminvorschlaege: Terminvorschlaege[],
  maps: TerminvorschlaegeMaps
): EnrichedTerminvorschlaege[] {
  return terminvorschlaege.map(r => ({
    ...r,
    umfrageName: resolveDisplay(r.fields.umfrage, maps.umfragenMap, 'titel'),
  }));
}

interface AntwortenMaps {
  umfragenMap: Map<string, Umfragen>;
  terminvorschlaegeMap: Map<string, Terminvorschlaege>;
}

export function enrichAntworten(
  antworten: Antworten[],
  maps: AntwortenMaps
): EnrichedAntworten[] {
  return antworten.map(r => ({
    ...r,
    umfrageName: resolveDisplay(r.fields.umfrage, maps.umfragenMap, 'titel'),
    terminvorschlagName: resolveDisplay(r.fields.terminvorschlag, maps.terminvorschlaegeMap, 'beginn'),
  }));
}

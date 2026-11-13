// The orchestrator's plan, as far as the running app needs it
// (docs/orchestrator/SPEC.md). Generated — do not edit; regenerated on every
// build and update from the stored plan. Without a plan every map is empty.
//
//   SYSTEM_ASSIGNED entity → fields a tool fills when a record is CREATED — the
//                   value does not exist before; dialogs hide these on create and
//                   the form-polish sets no default on them. A scheduled or
//                   update-triggered tool owns its field but is NOT in here.
//   PLAN_SENTENCES  slug → the plan in the owner's words (flows' field page)
//
// The runtime write guard (FLOW_WRITES/OWNERSHIP, planGuard.ts) left on
// 23.09.2026: a flow page composes against its generated hook, whose submit
// plan IS the Schreibliste — there is no way to spell a write outside it.

import { INTENTS } from '@/config/intents';

export const SYSTEM_ASSIGNED: Record<string, string[]> = {
  "antworten": [
    "antwort",
    "teilnehmer_nachname",
    "teilnehmer_vorname"
  ]
};

export const PLAN_SENTENCES: Record<string, string[]> = {
  "umfrage-anlegen": [
    "Legt an: terminvorschlaege, umfragen",
    "Automatisch: status (fester Wert „offen“)"
  ],
  "umfrage-abschliessen": [
    "Ändert: umfragen",
    "Automatisch: status (fester Wert „geschlossen“)"
  ]
};

export const PLAN_SUMMARY = "Du legst eine Umfrage mit Titel, Beschreibung und Ort an und trägst gleich mehrere Terminvorschläge mit Beginn und Ende ein. Jede Umfrage hat einen eigenen Link und einen QR-Code, die du mit einem Klick kopierst bzw. in einem eigenen Tab öffnest. Teilnehmende öffnen den Link ohne Anmeldung, sehen nur diese Umfrage als Tabelle mit allen bisherigen Antworten und tragen in der letzten Zeile Namen und je Termin Ja, Vielleicht oder Nein ein. Unter jedem Termin stehen die Anzahl Ja und Vielleicht, der Termin mit den meisten Ja ist hervorgehoben. Du siehst alle Antworten im Dashboard, legst den finalen Termin fest und schließt die Umfrage; danach sehen Teilnehmende den finalen Termin und die Tabelle, stimmen aber nicht mehr ab. Alles ist für das Handy ausgelegt.";

/** entity → the plan's noun („Frage“ / „Fragen“). A review row or a plan step
 *  names ONE record, so it reads the singular (J-6, 03.11.2026: „Auswertungen:
 *  Sommerfest“ for one record); the app label is the list's plural. */
export const NOUNS: Record<string, { one: string; many: string }> = {
  "umfragen": {
    "one": "Umfrage",
    "many": "Umfragen"
  },
  "terminvorschlaege": {
    "one": "Terminvorschlag",
    "many": "Terminvorschläge"
  },
  "antworten": {
    "one": "Antwort",
    "many": "Antworten"
  }
};

export function nounOne(entity: string, fallback: string): string {
  return NOUNS[entity]?.one || fallback;
}

/** „1 Beitrag“ / „3 Beiträge“ — a count with the right noun (S-13, acceptance 4:
 *  „1 Beiträge“). `many` is the list's label when the plan has no noun. */
export function countOf(entity: string, n: number, many: string): string {
  const noun = n === 1 ? (NOUNS[entity]?.one || many) : (NOUNS[entity]?.many || many);
  return `${n} ${noun}`;
}

/** slug → the lists a flow writes (the plan's Schreibliste). The nav leaves a
 *  flow out for a user who may not write one of them (lib/permissions.ts). */
export const FLOW_ENTITIES: Record<string, string[]> = {
  "umfrage-anlegen": [
    "terminvorschlaege",
    "umfragen"
  ],
  "umfrage-abschliessen": [
    "umfragen"
  ]
};

/** A field an UPDATE flow writes, and the value it fixes (if it does). */
export interface FlowOwner { slug: string; value?: string }

/** entity → field → the update flows that change it. Such a change is the
 *  flow's job — it records who and when (a review, a decision) — so the
 *  dashboard never writes these fields itself; it opens the flow
 *  (check-dashboard gate 25). */
export const FLOW_OWNED: Record<string, Record<string, FlowOwner[]>> = {
  "umfragen": {
    "finaler_termin": [
      {
        "slug": "umfrage-abschliessen"
      }
    ],
    "status": [
      {
        "slug": "umfrage-abschliessen",
        "value": "geschlossen"
      }
    ]
  }
};

/** The link that opens the flow owning `entity.field` with `recordId` already
 *  picked — `toValue` chooses between flows that fix different values (the
 *  approve flow vs the execute flow). null when no LIVE flow owns it (not
 *  built yet, or removed): the caller then offers no shortcut. */
export function flowLinkFor(entity: string, field: string, recordId: string, toValue?: string): string | null {
  const owners = (FLOW_OWNED[entity]?.[field] ?? []).filter(o => INTENTS.some(i => i.path === `/intents/${o.slug}`));
  const owner = (toValue !== undefined ? owners.find(o => o.value === toValue) : undefined)
    ?? owners.find(o => o.value === undefined)
    ?? owners[0];
  // a chosen record for a pick of the flow travels as `?<field>=<id>` — the hook preselects it (J-2)
  const pick = toValue !== undefined && owner && owner.value === undefined && FLOW_ONE_CLICK[entity]?.[field]?.['*'] ? `&${field}=${encodeURIComponent(toValue)}` : '';
  return owner ? `#/intents/${owner.slug}?record=${encodeURIComponent(recordId)}${pick}` : null;
}

/** entity → field → value → the flow that asks nothing but which record, and
 *  the values it writes (fixed, today/now). flowActionFor runs it in place.
 *  Key '*' with `pick`: the flow's one input is a chosen record the caller
 *  already knows — `flowActionFor(entity, field, id, <chosen id>)` writes it. */
export const FLOW_ONE_CLICK: Record<string, Record<string, Record<string, { slug: string; sets: Record<string, string | { rel: 'today' | 'now' }>; pick?: string }>>> = {
  "umfragen": {
    "finaler_termin": {
      "*": {
        "slug": "umfrage-abschliessen",
        "sets": {
          "status": "geschlossen"
        },
        "pick": "finaler_termin"
      }
    }
  }
};

function oneClickValues(sets: Record<string, string | { rel: 'today' | 'now' }>): Record<string, unknown> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return Object.fromEntries(Object.entries(sets).map(([k, v]) =>
    [k, typeof v === 'string' ? v : v.rel === 'today' ? day : `${day}T${pad(now.getHours())}:${pad(now.getMinutes())}`]));
}

/** entity → yes/no field → the reference to its parent: ONE child per parent holds it (EF-25). */
export const EXCLUSIVE_FLAGS: Record<string, Record<string, string>> = {};

/** flowLinkFor as a click handler — `action: go ? { label, onClick: go } : undefined`.
 *  When the owning flow asks nothing but which record (FLOW_ONE_CLICK), the
 *  handler IS the change: it writes the flow's values through the flow's door
 *  and tells the page to re-read (one click, no wizard). Otherwise it opens the
 *  flow with the record picked. null when no live flow owns the change. */
export function flowActionFor(entity: string, field: string, recordId: string, toValue?: string): (() => void) | null {
  const live = (slug: string) => INTENTS.some(i => i.path === `/intents/${slug}`);
  const one = toValue !== undefined ? FLOW_ONE_CLICK[entity]?.[field]?.[toValue] ?? (toValue ? FLOW_ONE_CLICK[entity]?.[field]?.['*'] : undefined) : undefined;
  if (one && live(one.slug)) {
    const values = { ...oneClickValues(one.sets), ...(one.pick ? { [one.pick]: toValue } : {}) };
    return () => {
      void import('@/services/journeyPort')
        .then(async ({ servicePort }) => {
          await servicePort.update(entity as never, recordId, values as never);
          // „genau eine aktiv“: the siblings lose it in the same click (EF-25)
          for (const [flag, ref] of Object.entries(EXCLUSIVE_FLAGS[entity] ?? {})) {
            if ((values as Record<string, unknown>)[flag] === true || (values as Record<string, unknown>)[flag] === 'true') {
              const { clearSiblings } = await import('@/lib/journey/exclusive');
              await clearSiblings(servicePort as never, entity as never, flag, ref, recordId);
            }
          }
        })
        .then(() => window.dispatchEvent(new CustomEvent('assistant:data-changed')))
        .catch(err => {
          console.error(`[flowActionFor] ${entity}.${field} → ${toValue}: ${String(err)}`);
          window.location.hash = `/intents/${one.slug}?record=${encodeURIComponent(recordId)}`;
        });
    };
  }
  const href = flowLinkFor(entity, field, recordId, toValue);
  return href ? () => { window.location.hash = href.slice(1); } : null;
}

/** route → hash path of the plan's display views (dashboard.views). */
export const VIEW_PATHS: Record<string, string> = {};

/** The link to a view — for ONE record always with `?record=` (EF-30: a QR view opened without it
 *  showed the first active interaction app-wide, another event's). `href={viewHref('qr-code', r.record_id)}`. */
export function viewHref(route: string, recordId?: string | null): string {
  const path = VIEW_PATHS[route] ?? `ansicht/${route}`;
  return recordId ? `#/${path}?record=${encodeURIComponent(recordId)}` : `#/${path}`;
}

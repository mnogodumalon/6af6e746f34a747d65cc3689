/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'umfragen'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.umfragen.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.umfragen.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.umfragen.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.umfragen              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled; list-field back-references additionally get a
 * "choose existing" picker that links an EXISTING record — built in, do not
 * re-roll). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   umfragen: finaler_termin, titel, beschreibung, ort, status  ·  → terminvorschlaege · ← terminvorschlaege (list + contextual +) · ← antworten (list + contextual +)
 *   terminvorschlaege: beginn, ende, umfrage  ·  → umfragen · ← umfragen (list + contextual +) · ← antworten (list + contextual +)
 *   antworten: umfrage, terminvorschlag, teilnehmer_vorname, teilnehmer_nachname, antwort  ·  → umfragen · → terminvorschlaege
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Umfragen, Terminvorschlaege, Antworten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichUmfragen, enrichTerminvorschlaege, enrichAntworten } from '@/lib/enrich';
import type { EnrichedUmfragen, EnrichedTerminvorschlaege, EnrichedAntworten } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { UmfragenDialog, type UmfragenDialogDefaults } from '@/components/dialogs/UmfragenDialog';
import { UmfragenDetails } from '@/components/details/UmfragenDetails';
import { TerminvorschlaegeDialog, type TerminvorschlaegeDialogDefaults } from '@/components/dialogs/TerminvorschlaegeDialog';
import { TerminvorschlaegeDetails } from '@/components/details/TerminvorschlaegeDetails';
import { AntwortenDialog, type AntwortenDialogDefaults } from '@/components/dialogs/AntwortenDialog';
import { AntwortenDetails } from '@/components/details/AntwortenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { usePermissions } from '@/lib/permissions';
import { toast } from 'sonner';
import { displayNameOf, displayPart } from '@/lib/journey/rules';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'umfragen'; record: EnrichedUmfragen }
  | { type: 'terminvorschlaege'; record: EnrichedTerminvorschlaege }
  | { type: 'antworten'; record: EnrichedAntworten };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  /** The action may return a sentence — the reason the step was NOT taken; the overlay shows it under the button. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void | string | Promise<void | string> } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
  /** May the signed-in user create/change records of this list? (the
   *  platform's rights — show a „+ Neu“ only when true; openCreate/openEdit
   *  refuse with a notice otherwise). */
  canWrite: boolean;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  umfragen: EntityCrudApi<Umfragen, UmfragenDialogDefaults>;
  terminvorschlaege: EntityCrudApi<Terminvorschlaege, TerminvorschlaegeDialogDefaults>;
  antworten: EntityCrudApi<Antworten, AntwortenDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { umfragen: EnrichedUmfragen[]; terminvorschlaege: EnrichedTerminvorschlaege[]; antworten: EnrichedAntworten[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  // the platform's rights of the signed-in user (lib/permissions.ts) — unknown = allowed
  const perms = usePermissions();
  const refuse = () => { toast.error(t('perm_denied_title'), { description: t('perm_denied_desc') }); };
  const [umfragenDialog, setUmfragenDialog] = useState<{ defaults?: UmfragenDialogDefaults; editing?: Umfragen } | null>(null);
  const [terminvorschlaegeDialog, setTerminvorschlaegeDialog] = useState<{ defaults?: TerminvorschlaegeDialogDefaults; editing?: Terminvorschlaege } | null>(null);
  const [antwortenDialog, setAntwortenDialog] = useState<{ defaults?: AntwortenDialogDefaults; editing?: Antworten } | null>(null);
  const enrichedUmfragen = useMemo(() => enrichUmfragen(data.umfragen, { terminvorschlaegeMap: data.terminvorschlaegeMap }), [data.umfragen, data.terminvorschlaegeMap]);
  const enrichedTerminvorschlaege = useMemo(() => enrichTerminvorschlaege(data.terminvorschlaege, { umfragenMap: data.umfragenMap }), [data.terminvorschlaege, data.umfragenMap]);
  const enrichedAntworten = useMemo(() => enrichAntworten(data.antworten, { umfragenMap: data.umfragenMap, terminvorschlaegeMap: data.terminvorschlaegeMap }), [data.antworten, data.umfragenMap, data.terminvorschlaegeMap]);

  function detailUmfragen(record: Umfragen, push = false) {
    const rec = enrichedUmfragen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'umfragen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitUmfragen(fields: Umfragen['fields']) {
    const editing = umfragenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setUmfragen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateUmfragenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('umfragen')} — ${t('crud_updated')}`, async () => {
        data.setUmfragen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateUmfragenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createUmfragenEntry(fields);
      undoToast(`${appLabel('umfragen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailTerminvorschlaege(record: Terminvorschlaege, push = false) {
    const rec = enrichedTerminvorschlaege.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'terminvorschlaege', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTerminvorschlaege(fields: Terminvorschlaege['fields']) {
    const editing = terminvorschlaegeDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTerminvorschlaege(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTerminvorschlaegeEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('terminvorschlaege')} — ${t('crud_updated')}`, async () => {
        data.setTerminvorschlaege(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTerminvorschlaegeEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTerminvorschlaegeEntry(fields);
      undoToast(`${appLabel('terminvorschlaege')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailAntworten(record: Antworten, push = false) {
    const rec = enrichedAntworten.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'antworten', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitAntworten(fields: Antworten['fields']) {
    const editing = antwortenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setAntworten(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateAntwortenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('antworten')} — ${t('crud_updated')}`, async () => {
        data.setAntworten(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateAntwortenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createAntwortenEntry(fields);
      undoToast(`${appLabel('antworten')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <UmfragenDialog
        open={umfragenDialog !== null}
        onClose={() => setUmfragenDialog(null)}
        onSubmit={submitUmfragen}
        defaultValues={umfragenDialog?.defaults}
        recordId={umfragenDialog?.editing?.record_id}
        terminvorschlaegeList={data.terminvorschlaege}
        enablePhotoScan={AI_PHOTO_SCAN['Umfragen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Umfragen']}
      />
      <TerminvorschlaegeDialog
        open={terminvorschlaegeDialog !== null}
        onClose={() => setTerminvorschlaegeDialog(null)}
        onSubmit={submitTerminvorschlaege}
        defaultValues={terminvorschlaegeDialog?.defaults}
        recordId={terminvorschlaegeDialog?.editing?.record_id}
        umfragenList={data.umfragen}
        enablePhotoScan={AI_PHOTO_SCAN['Terminvorschlaege']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Terminvorschlaege']}
      />
      <AntwortenDialog
        open={antwortenDialog !== null}
        onClose={() => setAntwortenDialog(null)}
        onSubmit={submitAntworten}
        defaultValues={antwortenDialog?.defaults}
        recordId={antwortenDialog?.editing?.record_id}
        umfragenList={data.umfragen}
        terminvorschlaegeList={data.terminvorschlaege}
        enablePhotoScan={AI_PHOTO_SCAN['Antworten']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Antworten']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'umfragen') {
            return (
              <>
                <RecordHeader title={displayNameOf('umfragen', top.record.fields as Record<string, unknown>) || appLabel('umfragen')} subtitle={undefined} />
                <UmfragenDetails
                  record={top.record}
                  terminvorschlaegeList={data.terminvorschlaege}
                  onOpenTerminvorschlaege={(r) => detailTerminvorschlaege(r, true)}
                  terminvorschlaegeUmfrageList={data.terminvorschlaege}
                  onOpenTerminvorschlaegeUmfrage={(r) => detailTerminvorschlaege(r, true)}
                  onAddTerminvorschlaegeUmfrage={perms.canWrite('terminvorschlaege') ? () => setTerminvorschlaegeDialog({ defaults: { umfrage: createRecordUrl(APP_IDS.UMFRAGEN, top.record.record_id) } }) : undefined}
                  antwortenList={data.antworten}
                  onOpenAntworten={(r) => detailAntworten(r, true)}
                  onAddAntworten={perms.canWrite('antworten') ? () => setAntwortenDialog({ defaults: { umfrage: createRecordUrl(APP_IDS.UMFRAGEN, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'terminvorschlaege') {
            return (
              <>
                <RecordHeader title={displayNameOf('terminvorschlaege', top.record.fields as Record<string, unknown>) || appLabel('terminvorschlaege')} subtitle={top.record.fields.ende ? formatDate(top.record.fields.ende) : undefined} />
                <TerminvorschlaegeDetails
                  record={top.record}
                  umfragenList={data.umfragen}
                  onOpenUmfragen={(r) => detailUmfragen(r, true)}
                  umfragenFinalerTerminList={data.umfragen}
                  onOpenUmfragenFinalerTermin={(r) => detailUmfragen(r, true)}
                  onAddUmfragenFinalerTermin={perms.canWrite('umfragen') ? () => setUmfragenDialog({ defaults: { finaler_termin: createRecordUrl(APP_IDS.TERMINVORSCHLAEGE, top.record.record_id) } }) : undefined}
                  antwortenList={data.antworten}
                  onOpenAntworten={(r) => detailAntworten(r, true)}
                  onAddAntworten={perms.canWrite('antworten') ? () => setAntwortenDialog({ defaults: { terminvorschlag: createRecordUrl(APP_IDS.TERMINVORSCHLAEGE, top.record.record_id) } }) : undefined}
                />
              </>
            );
          }
          if (top.type === 'antworten') {
            return (
              <>
                <RecordHeader title={displayNameOf('antworten', top.record.fields as Record<string, unknown>) || appLabel('antworten')} subtitle={undefined} />
                <AntwortenDetails
                  record={top.record}
                  umfragenList={data.umfragen}
                  onOpenUmfragen={(r) => detailUmfragen(r, true)}
                  terminvorschlaegeList={data.terminvorschlaege}
                  onOpenTerminvorschlaege={(r) => detailTerminvorschlaege(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        canEdit={(top) => {
          if (top.type === 'umfragen') return perms.canWrite('umfragen');
          if (top.type === 'terminvorschlaege') return perms.canWrite('terminvorschlaege');
          if (top.type === 'antworten') return perms.canWrite('antworten');
          return true;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'umfragen') setUmfragenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'terminvorschlaege') setTerminvorschlaegeDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'antworten') setAntwortenDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    umfragen: {
      openCreate: (defaults?: UmfragenDialogDefaults) => (perms.canWrite('umfragen') ? setUmfragenDialog({ defaults }) : refuse()),
      openEdit: (record: Umfragen) => (perms.canWrite('umfragen') ? setUmfragenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Umfragen) => detailUmfragen(record, false),
      canWrite: perms.canWrite('umfragen'),
    },
    terminvorschlaege: {
      openCreate: (defaults?: TerminvorschlaegeDialogDefaults) => (perms.canWrite('terminvorschlaege') ? setTerminvorschlaegeDialog({ defaults }) : refuse()),
      openEdit: (record: Terminvorschlaege) => (perms.canWrite('terminvorschlaege') ? setTerminvorschlaegeDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Terminvorschlaege) => detailTerminvorschlaege(record, false),
      canWrite: perms.canWrite('terminvorschlaege'),
    },
    antworten: {
      openCreate: (defaults?: AntwortenDialogDefaults) => (perms.canWrite('antworten') ? setAntwortenDialog({ defaults }) : refuse()),
      openEdit: (record: Antworten) => (perms.canWrite('antworten') ? setAntwortenDialog({ editing: record, defaults: record.fields }) : refuse()),
      openDetail: (record: Antworten) => detailAntworten(record, false),
      canWrite: perms.canWrite('antworten'),
    },
    enriched: { umfragen: enrichedUmfragen, terminvorschlaege: enrichedTerminvorschlaege, antworten: enrichedAntworten },
  };
}

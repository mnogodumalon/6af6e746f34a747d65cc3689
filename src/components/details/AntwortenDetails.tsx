import type { Antworten, Umfragen, Terminvorschlaege } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { usePermissions } from '@/lib/permissions';
import { displayNameOf } from '@/lib/journey/rules';

export interface AntwortenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Antworten;
  /** N:1-Ziel „Umfragen": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  umfragenList: Umfragen[];
  /** Klick auf die Umfragen-Relation → overlay.push auf dessen Detail. */
  onOpenUmfragen?: (record: Umfragen) => void;
  /** N:1-Ziel „Terminvorschlaege": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  terminvorschlaegeList: Terminvorschlaege[];
  /** Klick auf die Terminvorschlaege-Relation → overlay.push auf dessen Detail. */
  onOpenTerminvorschlaege?: (record: Terminvorschlaege) => void;
}

export function AntwortenDetails({
  record,
  umfragenList,
  onOpenUmfragen,
  terminvorschlaegeList,
  onOpenTerminvorschlaege,
}: AntwortenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const umfrageTarget = umfragenList.find(r => r.record_id === extractRecordId(record.fields.umfrage));
  const terminvorschlagTarget = terminvorschlaegeList.find(r => r.record_id === extractRecordId(record.fields.terminvorschlag));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('antworten', 'teilnehmer_vorname')} value={record.fields.teilnehmer_vorname} format="text" />
        <RecordField label={fieldLabel('antworten', 'teilnehmer_nachname')} value={record.fields.teilnehmer_nachname} format="text" />
        <RecordField label={fieldLabel('antworten', 'antwort')} value={record.fields.antwort} format="pill" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('antworten', 'umfrage')}
          name={umfrageTarget ? (displayNameOf('umfragen', umfrageTarget.fields as Record<string, unknown>) || '—') : '—'}
          meta={[umfrageTarget?.fields.ort].filter(Boolean).join(' · ') || undefined}
          onClick={umfrageTarget && onOpenUmfragen ? () => onOpenUmfragen!(umfrageTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('antworten', 'terminvorschlag')}
          name={terminvorschlagTarget ? (displayNameOf('terminvorschlaege', terminvorschlagTarget.fields as Record<string, unknown>) || '—') : '—'}
          meta={undefined}
          onClick={terminvorschlagTarget && onOpenTerminvorschlaege ? () => onOpenTerminvorschlaege!(terminvorschlagTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.ANTWORTEN} recordId={record.record_id} readOnly={!perms.canWrite('antworten')} />
    </>
  );
}

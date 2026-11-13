import type { Umfragen, Terminvorschlaege, Antworten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';
import { usePermissions } from '@/lib/permissions';
import { displayNameOf, displayPart } from '@/lib/journey/rules';

export interface UmfragenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Umfragen;
  /** N:1-Ziel „Terminvorschlaege": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  terminvorschlaegeList: Terminvorschlaege[];
  /** Klick auf die Terminvorschlaege-Relation → overlay.push auf dessen Detail. */
  onOpenTerminvorschlaege?: (record: Terminvorschlaege) => void;
  /** 1:N „Terminvorschläge" (umfrage): VOLLE Liste — der Block filtert auf diesen Record. */
  terminvorschlaegeUmfrageList: Terminvorschlaege[];
  /** Zeilen-Klick → overlay.push auf das Terminvorschlaege-Detail (nie der Edit-Dialog). */
  onOpenTerminvorschlaegeUmfrage: (record: Terminvorschlaege) => void;
  /** Kontextuelles „+": öffnet den Terminvorschlaege-Dialog mit diesem Record vorgesetzt. */
  onAddTerminvorschlaegeUmfrage?: () => void;
  /** 1:N „Antworten" (umfrage): VOLLE Liste — der Block filtert auf diesen Record. */
  antwortenList: Antworten[];
  /** Zeilen-Klick → overlay.push auf das Antworten-Detail (nie der Edit-Dialog). */
  onOpenAntworten: (record: Antworten) => void;
  /** Kontextuelles „+": öffnet den Antworten-Dialog mit diesem Record vorgesetzt. */
  onAddAntworten?: () => void;
}

export function UmfragenDetails({
  record,
  terminvorschlaegeList,
  onOpenTerminvorschlaege,
  terminvorschlaegeUmfrageList,
  onOpenTerminvorschlaegeUmfrage,
  onAddTerminvorschlaegeUmfrage,
  antwortenList,
  onOpenAntworten,
  onAddAntworten,
}: UmfragenDetailsProps) {
  // attachments are a write to this record — read-only without the platform right
  const perms = usePermissions();
  const finaler_terminTarget = terminvorschlaegeList.find(r => r.record_id === extractRecordId(record.fields.finaler_termin));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('umfragen', 'titel')} value={record.fields.titel} format="text" />
        <RecordField label={fieldLabel('umfragen', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('umfragen', 'ort')} value={record.fields.ort} format="text" />
        <RecordField label={fieldLabel('umfragen', 'status')} value={record.fields.status} format="pill" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={1}>
        <RecordRelation
          label={fieldLabel('umfragen', 'finaler_termin')}
          name={finaler_terminTarget ? (displayNameOf('terminvorschlaege', finaler_terminTarget.fields as Record<string, unknown>) || '—') : '—'}
          meta={undefined}
          onClick={finaler_terminTarget && onOpenTerminvorschlaege ? () => onOpenTerminvorschlaege!(finaler_terminTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={`${appLabel('terminvorschlaege')} · ${fieldLabel('terminvorschlaege', 'umfrage')}`}
        items={terminvorschlaegeUmfrageList.filter(r => extractRecordId(r.fields.umfrage) === record.record_id)}
        map={r => ({ name: displayNameOf('terminvorschlaege', r.fields as Record<string, unknown>) || appLabel('terminvorschlaege'), meta: displayPart(r.fields.ende) })}
        onOpen={onOpenTerminvorschlaegeUmfrage}
        onAdd={onAddTerminvorschlaegeUmfrage}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('antworten')}
        items={antwortenList.filter(r => extractRecordId(r.fields.umfrage) === record.record_id)}
        map={r => ({ name: displayNameOf('antworten', r.fields as Record<string, unknown>) || appLabel('antworten'), meta: undefined })}
        onOpen={onOpenAntworten}
        onAdd={onAddAntworten}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.UMFRAGEN} recordId={record.record_id} readOnly={!perms.canWrite('umfragen')} />
    </>
  );
}

/**
 * src/i18n/common.ts — pre-translated standard dashboard vocabulary. NEVER edit.
 *
 * LEGACY: new pages mark their text with tx() from '@/i18n' instead — this
 * file stays only because agent pages written under the old contract import
 * it. Do not add tc to new code.
 *
 * Every generic UI word a dashboard needs is already HERE, in both core
 * locales. Import tc and use these keys instead of re-typing the words in
 * your own makeT table — live builds kept re-inventing 'Überfällig' and
 * 'Bearbeiten', and template-literal toasts shipped German into the EN locale:
 *
 *   import { tc } from '@/i18n/common';
 *   … <span>{tc('ueberfaellig')}</span>
 *   … undoToast(`${name} — ${tc('zurueckgegeben')}`, undo)
 *
 * Complete key list (typed — an unknown key is a tsc error):
 *   states   ueberfaellig faellig heute diese_woche offen erledigt aktiv
 *            inaktiv verfuegbar alle keine gesamt status details
 *   actions  neu bearbeiten anzeigen hinzufuegen entfernen speichern
 *            abbrechen schliessen abschliessen zurueckgeben rueckgaengig
 *            suchen weiter zurueck
 *   toasts   erstellt aktualisiert geaendert geloescht gespeichert
 *            abgeschlossen zurueckgegeben
 *
 * Your own makeT table is ONLY for app-specific text (context line, hero
 * sentence, entity-composed buttons like 'Neue Wartung'). Lookup option
 * labels never come from here — read them via lookupLabel()/the record.
 *
 * WRONG: label: 'Bearbeiten'          (re-typed, frozen in one language)
 * RIGHT: label: tc('bearbeiten')      (both locales, already shipped)
 */
import { makeT } from './index';

export const tc = makeT({
  de: {
    ueberfaellig: 'Überfällig',
    faellig: 'Fällig',
    heute: 'Heute',
    diese_woche: 'Diese Woche',
    offen: 'Offen',
    erledigt: 'Erledigt',
    aktiv: 'Aktiv',
    inaktiv: 'Inaktiv',
    verfuegbar: 'Verfügbar',
    alle: 'Alle',
    keine: 'Keine',
    gesamt: 'Gesamt',
    status: 'Status',
    details: 'Details',
    neu: 'Neu',
    bearbeiten: 'Bearbeiten',
    anzeigen: 'Anzeigen',
    hinzufuegen: 'Hinzufügen',
    entfernen: 'Entfernen',
    speichern: 'Speichern',
    abbrechen: 'Abbrechen',
    schliessen: 'Schließen',
    abschliessen: 'Abschließen',
    zurueckgeben: 'Zurückgeben',
    rueckgaengig: 'Rückgängig',
    suchen: 'Suchen',
    weiter: 'Weiter',
    zurueck: 'Zurück',
    erstellt: 'Erstellt',
    aktualisiert: 'Aktualisiert',
    geaendert: 'Geändert',
    geloescht: 'Gelöscht',
    gespeichert: 'Gespeichert',
    abgeschlossen: 'Abgeschlossen',
    zurueckgegeben: 'Zurückgegeben',
  },
  en: {
    ueberfaellig: 'Overdue',
    faellig: 'Due',
    heute: 'Today',
    diese_woche: 'This week',
    offen: 'Open',
    erledigt: 'Done',
    aktiv: 'Active',
    inaktiv: 'Inactive',
    verfuegbar: 'Available',
    alle: 'All',
    keine: 'None',
    gesamt: 'Total',
    status: 'Status',
    details: 'Details',
    neu: 'New',
    bearbeiten: 'Edit',
    anzeigen: 'View',
    hinzufuegen: 'Add',
    entfernen: 'Remove',
    speichern: 'Save',
    abbrechen: 'Cancel',
    schliessen: 'Close',
    abschliessen: 'Complete',
    zurueckgeben: 'Return',
    rueckgaengig: 'Undo',
    suchen: 'Search',
    weiter: 'Next',
    zurueck: 'Back',
    erstellt: 'Created',
    aktualisiert: 'Updated',
    geaendert: 'Changed',
    geloescht: 'Deleted',
    gespeichert: 'Saved',
    abgeschlossen: 'Completed',
    zurueckgegeben: 'Returned',
  },
});

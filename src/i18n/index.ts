/**
 * src/i18n/index.ts — runtime language layer (generated). NEVER edit.
 *
 * The dashboard ships the CORE locales de/en baked in; ADDITIONAL locales
 * (e.g. ru) load as overlays from `locales/{lang}.json` next to the bundle —
 * uploaded server-side, no rebuild needed. The active locale is chosen at
 * runtime: LA profile language → localStorage 'app-locale' → build locale.
 * Switching remounts the tree (LocaleGate in App.tsx), so plain calls inside
 * component bodies stay correct — never hoist their results into module-scope
 * constants.
 *
 * Scaffold chrome and structure labels are already localized — read them,
 * never re-type them:
 *   t(key, params?)                 — catalog chrome text ('save', 'search', …)
 *   tp(key, n, params?)             — plural-aware: catalog keys key_one/key_few/
 *                                     key_many/key_other (Intl.PluralRules)
 *   appLabel(entityKey)             — localized entity display name
 *   fieldLabel(entityKey, field)    — localized field label
 *   lookupLabel(entityKey, field, optionKey) — lookup option label (null = unknown)
 *   dateFormat()/dateTimeFormat()/dateFnsLocale()/localeTag()/CURRENCY
 *
 * Text YOU write (overview, intent pages, bespoke public pages): write it
 * ONCE in the build language and MARK it with tx — the pipeline generates
 * every translation after you finish. NEVER write translations yourself,
 * NEVER build translation tables.
 *
 *   import { tx, appLabel } from '@/i18n';
 *   <h2>{tx('Auslastung')}</h2>
 *   label: tx('Bearbeiten')
 *   toast(tx`${name} — zurückgegeben`)   // tagged template for interpolation
 *
 * The tagged form keeps expressions OUT of the sentence ({0}/{1} slots), so
 * it stays translatable — never assemble text with plain `${…}` literals or
 * string concatenation. tx at MODULE SCOPE freezes one language at import
 * time — call it inside the component body only. Deliberate exceptions
 * (brand names, codes) take an i18n-exempt comment on the line.
 *
 * WRONG: <h2>Auslastung</h2>            (unmarked — frozen in one language)
 * WRONG: const T = tx('Auslastung');    (module scope — frozen at import)
 * RIGHT: <h2>{tx('Auslastung')}</h2>    (translated at render time)
 *
 * makeT (LEGACY): older pages carry per-page {de,en} tables and render
 * tt('key') — still fully supported, but do not write new ones.
 */
import { de as dfDe } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import { REST_URL, restFetch } from '@/lib/origin';

// Core = baked into the bundle. Locale stays an OPEN string type so overlay
// languages added later never invalidate today's code (`string & {}` keeps
// core autocompletion without closing the union).
export type CoreLocale = 'de' | 'en';
export type Locale = CoreLocale | (string & {});
export const CORE_LOCALES: CoreLocale[] = ['de', 'en'];
export const LOCALES: Locale[] = [...CORE_LOCALES];
export const LOCALE_NAMES: Record<string, string> = { de: 'Deutsch', en: 'English' };

export const BUILD_LOCALE: CoreLocale = 'de';

// Currency is a property of the DATA, never of the UI language.
export const CURRENCY = 'EUR';

const STORAGE_KEY = 'app-locale';
const LA_API_URL = REST_URL;

// ── Generated catalogs ─────────────────────────────────────────────
// UI chrome strings (generator UI_TEXTS, all core locales):
export const UI_CATALOG: Record<CoreLocale, Record<string, string>> = {
  "de": {
    "overview": "Übersicht",
    "navigation": "Navigation",
    "cancel": "Abbrechen",
    "delete": "Löschen",
    "save": "Speichern",
    "crud_created": "erstellt",
    "crud_updated": "aktualisiert",
    "saving": "Speichern...",
    "submit_error": "Speichern fehlgeschlagen.",
    "create": "Erstellen",
    "search": "Suchen...",
    "actions": "Aktionen",
    "no_results": "Keine Ergebnisse gefunden.",
    "no_data_yet": "Noch keine {entity}. Jetzt hinzufügen!",
    "select_placeholder": "Auswählen...",
    "confirm_delete_desc": "Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.",
    "add": "Hinzufügen",
    "view_entity": "{entity} anzeigen",
    "edit_button": "Bearbeiten",
    "edit_entity": "{entity} bearbeiten",
    "new_entity": "{entity} hinzufügen",
    "delete_entity": "{entity} löschen",
    "yes": "Ja",
    "no": "Nein",
    "search_entity": "{entity} suchen...",
    "in_system": "{entity} im System",
    "welcome": "Willkommen",
    "overview_subtitle": "Hier ist eine Übersicht Ihrer Daten.",
    "management": "Verwaltung",
    "dashboard": "Dashboard",
    "date_format": "dd.MM.yyyy",
    "admin": "Verwaltung",
    "admin_subtitle": "Alle Daten verwalten",
    "records": "Einträge",
    "select_all": "Alle auswählen",
    "bulk_delete": "Ausgewählte löschen",
    "bulk_clone": "Kopieren",
    "bulk_edit": "Feld bearbeiten",
    "selected": "ausgewählt",
    "apply_to_n": "Auf {n} Einträge anwenden",
    "filter": "Filtern",
    "clear_filters": "Filter zurücksetzen",
    "choose_field": "Feld auswählen",
    "new_value": "Neuer Wert",
    "all_values": "Alle",
    "confirm_bulk_delete": "Sollen {n} Einträge wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden.",
    "deselect_all": "Auswahl aufheben",
    "applying": "Wird angewendet...",
    "create_new_app": "Neue App erstellen",
    "apps_label": "Apps",
    "profile_label": "Profil",
    "back": "Zurück",
    "display_section": "Darstellung",
    "data_management": "Datenverwaltung",
    "apps_search": "Suche...",
    "apps_no_results": "Keine Apps gefunden",
    "apps_page_of": "von",
    "sort_newest": "Neuste zuerst",
    "sort_oldest": "Älteste zuerst",
    "sort_az": "Name, A → Z",
    "sort_za": "Name, Z → A",
    "edit_dashboard": "Klar Lab",
    "developer": "Entwickler",
    "beta_features": "Beta Features",
    "actions_section": "Aktionen",
    "files_section": "Dateien",
    "public_pages_section": "Öffentliche Seiten",
    "legal_imprint": "Impressum",
    "legal_privacy": "Datenschutz",
    "source_code": "Quellcode",
    "copy_code": "Code kopieren",
    "copied": "Kopiert!",
    "code_for": "Code für",
    "delete_confirm": "Aktion löschen",
    "delete_confirm_from": "aus",
    "action_deleted": "Aktion gelöscht:",
    "empty_action": "Leere Aktion",
    "run": "Ausführen",
    "field_required": "ist erforderlich",
    "file_too_large": "Datei überschreitet das Limit von 10 MB.",
    "preparing": "Wird vorbereitet...",
    "busy": "In Arbeit...",
    "files_label": "Dateien",
    "no_files": "Keine Dateien vorhanden",
    "sort_name_az": "Name A→Z",
    "sort_name_za": "Name Z→A",
    "delete_file_confirm": "Datei löschen",
    "file_deleted": "Datei gelöscht:",
    "datetime_format": "dd.MM.yyyy, HH:mm",
    "download": "Herunterladen",
    "auth_error_title": "Du bist nicht angemeldet.",
    "auth_login_button": "Anmelden",
    "perm_denied_title": "Dafür fehlt dir die Berechtigung.",
    "perm_denied_desc": "Eine Administratorin oder ein Administrator der Anwendung kann sie dir geben.",
    "repair_text": "Dashboard reparieren",
    "repair_error_title": "Etwas ist schiefgelaufen",
    "repair_reload": "Neu laden",
    "repair_starting": "Reparatur wird gestartet...",
    "repair_running": "Reparatur läuft...",
    "repair_done_title": "Dashboard repariert",
    "repair_done_desc": "Das Problem wurde behoben. Bitte laden Sie die Seite neu.",
    "repair_failed": "Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.",
    "fix_action_button": "Automatisch beheben",
    "fix_action_running": "Wird behoben…",
    "fix_error_heading": "Etwas klappte nicht bei der Ausführung von",
    "fix_intro_prefix": "Korrektur für",
    "fix_intro_suffix": "neue Chat-Sitzung für diese Korrektur gestartet.",
    "fix_still_fails": "Die Aktion schlägt weiterhin fehl",
    "fix_not_confirmed": "Die Korrektur ist noch nicht bestätigt — deine ursprüngliche Eingabe bleibt erhalten.",
    "fix_request_failed": "Korrektur-Anfrage fehlgeschlagen",
    "fix_retry_hint": "Deine ursprüngliche Eingabe bleibt erhalten — du kannst es erneut versuchen.",
    "close": "Schließen",
    "code_versions": "Versionen",
    "code_version_active": "Aktiv",
    "code_tab_code": "Code",
    "code_tab_diff": "Änderungen",
    "code_tab_diff_to": "Änderungen zu",
    "code_viewing_old_prefix": "Du siehst",
    "code_viewing_old_suffix": "— nicht die aktive Version.",
    "code_restore": "Diese Version wiederherstellen",
    "code_restore_confirm_title": "Version wiederherstellen",
    "code_restore_confirm_desc": "Der aktuelle Code wird ersetzt. Nichts geht verloren — es entsteht eine neue Version.",
    "code_restore_failed": "Wiederherstellen fehlgeschlagen",
    "code_restored_to": "Zurückgesetzt auf Version",
    "code_origin_fix": "Auto-Fix",
    "code_origin_chat": "Chat",
    "code_origin_initial": "Erstellt",
    "code_origin_revert": "Wiederhergestellt",
    "code_no_versions": "Keine früheren Versionen",
    "code_lines": "Zeilen",
    "code_out_tab": "Ausgabe",
    "code_out_heading": "Testlauf",
    "code_out_history_badge": "Code aus der Historie — nicht wiederhergestellt",
    "code_out_inputs": "Eingaben",
    "code_out_open": "Öffnen",
    "code_out_no_output": "(keine Ausgabe)",
    "code_chat_placeholder": "Frage zum Code stellen…",
    "code_back_to_tools": "Zurück zu den Werkzeugen",
    "code_switch_tool": "Aktion wechseln",
    "version_card_view_changes": "Änderungen ansehen",
    "version_card_undo": "Rückgängig",
    "version_card_open_action": "Aktion öffnen",
    "chat_history_title": "Verlauf",
    "chat_new": "Neuer Chat",
    "run_done_badge": "Ausgeführt",
    "run_id_copy": "RunID kopieren — bei Problemen für den Support angeben",
    "dock_empty_hint": "Frag etwas zu dieser Aktion — die Antwort kennt Code und Versionen.",
    "dock_suggest_what": "Was macht diese Aktion?",
    "dock_suggest_explain": "Erkläre mir den Code",
    "dock_ctx_other_prefix": "Diese Unterhaltung gehört zu",
    "dock_ctx_general": "Allgemeine Unterhaltung ohne Aktions-Bezug",
    "scope_menu_general_title": "Allgemeine Unterhaltung",
    "scope_general_short": "Allgemein",
    "scope_menu_action_desc": "Fragen & Änderungen zu dieser Aktion",
    "scope_menu_last_prefix": "Zuletzt",
    "run_result_details": "Details",
    "chat_new_for_tool": "Neue Unterhaltung zu dieser Aktion",
    "chat_history_search": "Verlauf durchsuchen…",
    "chat_history_empty": "Noch keine Unterhaltungen",
    "chat_history_today": "Heute",
    "chat_history_yesterday": "Gestern",
    "chat_history_older": "Älter",
    "chat_history_active": "Aktiv",
    "chat_history_recent": "Zuletzt",
    "chat_history_filter_all": "Alle",
    "chat_history_filter_tool": "Diese Aktion",
    "chat_history_delete_title": "Sitzung löschen?",
    "chat_history_delete_desc": "Diese Unterhaltung wird dauerhaft gelöscht.",
    "chat_history_delete_action": "Löschen",
    "chat_resumed": "Sitzung fortgesetzt",
    "chat_messages_label": "Nachrichten",
    "toast_network_title": "Netzwerkfehler",
    "toast_network_desc": "Verbindung zum Server verloren.",
    "toast_server_title": "Serverfehler",
    "toast_server_desc": "Bitte versuche es später erneut.",
    "toast_bug_desc": "Ein Problem wurde entdeckt. Das Dashboard kann automatisch repariert werden.",
    "update_available": "Update verfügbar:",
    "update_confirm_title": "Update installieren?",
    "update_confirm_desc": "Die Anwendung wird auf die neueste Version aktualisiert. Das dauert einige Minuten.",
    "update_confirm_action": "Aktualisieren",
    "updating": "Aktualisiert…",
    "update_verifying": "Version wird bestätigt…",
    "update_verify_timeout": "Version konnte nicht bestätigt werden. Bitte Seite neu laden.",
    "update_busy_queued": "Ein Build läuft gerade (gestartet vor {min} min). Das Update ist vorgemerkt und wird danach automatisch ausgeführt.",
    "busy_build_running": "Für dieses Dashboard läuft gerade ein Build. Bitte versuche es in ein paar Minuten erneut.",
    "vc_build_pill": "Deine Änderungen werden eingebaut",
    "vc_build_initial": "Deine Anwendung wird fertig eingerichtet",
    "vc_build_update": "Dashboard wird aktualisiert",
    "vc_build_failed": "Die letzte Aktualisierung ist fehlgeschlagen — deine Änderung ist noch nicht im Dashboard.",
    "vc_updated_toast": "Dashboard wurde aktualisiert",
    "vc_updated_toast_desc": "Die Struktur hat sich geändert — offene Formulare bitte neu öffnen.",
    "vc_updated_reload": "Neu laden",
    "vc_updated_later": "Später",
    "rollback_label": "Zurück auf",
    "rollback_confirm_title": "Version zurücksetzen?",
    "rollback_confirm_desc": "Die Anwendung wird auf die ausgewählte Version zurückgesetzt.",
    "rollback_confirm_action": "Zurücksetzen",
    "rolling_back": "Wird zurückgesetzt…",
    "attachments_label": "Anhänge",
    "attachments_empty": "Keine Anhänge vorhanden",
    "attachments_add": "Anhang hinzufügen",
    "attachments_type": "Typ",
    "attachments_label_field": "Bezeichnung",
    "attachments_value": "Wert",
    "attachments_value_file": "Datei",
    "attachments_value_note": "Notiz",
    "attachments_value_url": "URL",
    "attachments_value_json": "JSON",
    "attachments_choose_file": "Datei auswählen",
    "attachments_uploading": "Hochladen…",
    "attachments_loading": "Lade Anhänge…",
    "attachments_save_record_first": "Datensatz zuerst speichern, dann können Anhänge hinzugefügt werden.",
    "attachments_invalid_json": "Ungültiges JSON",
    "attachments_open": "Öffnen",
    "attachments_dz_hint": "Datei hier ablegen oder klicken",
    "attachments_dz_subhint": "PDFs, Bilder, Dokumente",
    "attachments_input_placeholder": "Notiz, Bild oder URL",
    "attachments_hint_enter": "↵ Enter zum Hinzufügen",
    "attachments_add_dialog_title": "Anhang hinzufügen",
    "attachments_or": "oder",
    "attachments_empty_cta": "Anhang hinzufügen — Datei ablegen oder klicken",
    "attachments_drop_to_upload": "Datei loslassen zum Hochladen",
    "attachments_delete_title": "Anhang löschen?",
    "attachments_delete_desc": "Dieser Anhang wird unwiederbringlich entfernt.",
    "attachments_rel_just_now": "gerade eben",
    "attachments_rel_min_prefix": "vor ",
    "attachments_rel_min": "Min",
    "attachments_rel_hr_prefix": "vor ",
    "attachments_rel_hr": "Std",
    "attachments_rel_day_prefix": "vor ",
    "attachments_rel_day": "Tagen",
    "fr_show_coords": "Koordinaten anzeigen",
    "fr_hide_coords": "Koordinaten verbergen",
    "fr_lat": "Breitengrad",
    "fr_long": "Längengrad",
    "fr_upload_file": "Datei hochladen",
    "fr_change": "Ändern",
    "fr_remove": "Entfernen",
    "fr_use_location": "Aktuellen Standort verwenden",
    "fr_photo_location": "Standort aus Foto übernommen",
    "fr_search_address": "Adresse suchen und auswählen…",
    "fr_record_url": "Record URL",
    "create_in": "Neu in {entity}",
    "assigned_by_system": "Vergibt das System",
    "pf_submit_text": "Absenden",
    "pf_submitting_text": "Wird gesendet...",
    "pf_required_error_text": "Dieses Feld ist erforderlich.",
    "pf_unavailable_title": "Nicht verfügbar",
    "pf_unavailable_message": "Dieses Formular ist derzeit nicht verfügbar.",
    "pf_error_generic_text": "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    "pf_rate_limit_text": "Zu viele Versuche — bitte warte einen Moment und versuche es erneut.",
    "pf_another_entry_text": "Weitere Eingabe",
    "pf_powered_by_text": "Powered by Klar",
    "pf_address_placeholder": "Adresse suchen...",
    "pf_remove_text": "Entfernen",
    "pps_unavailable_message": "Diese Seite ist derzeit nicht verfügbar.",
    "ppn_heading": "Öffentliche Seiten",
    "ppa_title": "Öffentliche Seiten",
    "ppa_subtitle": "Formulare und Seiten, die du per Link teilen kannst — ohne dass Besucher ein Konto brauchen.",
    "ppa_empty": "Noch keine Seiten. Sag im Chat, welche öffentliche Seite du brauchst — sie wird dann gebaut und erscheint hier.",
    "ppa_origin_auto": "Vorschlag",
    "ppa_origin_user": "Eigene",
    "ppa_origin_agent": "KI-Seite",
    "ppa_status_published": "Öffentlich",
    "ppa_status_draft": "Entwurf",
    "ppa_republish": "war veröffentlicht — Rechte geändert, bitte erneut freigeben",
    "ppa_publish": "Veröffentlichen",
    "ppa_pause": "Pausieren",
    "ppa_open": "Felder zeigen",
    "ppa_copy": "Link kopieren",
    "ppa_copied": "Kopiert!",
    "ppa_confirm_title": "Wirklich veröffentlichen?",
    "ppa_can_do": "Jeder mit dem Link kann:",
    "ppa_cannot_do": "Niemand kann:",
    "ppa_can_submit": "Einträge absenden",
    "ppa_can_view": "diese Daten sehen",
    "ppa_cannot_line": "bestehende Daten sehen oder ändern.",
    "ppa_cannot_change_line": "bestehende Daten ändern oder löschen.",
    "ppa_link_param_note": "Der Link pro Eintrag zeigt Besuchern nur diesen einen Eintrag. Technisch lesbar sind über die Seite trotzdem alle Einträge der aufgeführten Listen — ein Scope in der Liste begrenzt das.",
    "ppa_cancel": "Abbrechen",
    "ppa_confirm_publish": "Veröffentlichen",
    "ps_preview_banner": "Vorschau — nur du siehst diese Seite. Absenden legt einen echten Eintrag an.",
    "ppa_preview": "Vorschau",
    "ppa_links": "Links",
    "ppa_links_title": "Link pro Eintrag",
    "ppa_links_intro": "Diese Seite braucht einen Eintrag im Link. Kopiere den passenden Link und verschicke ihn.",
    "ppa_links_empty": "Noch keine Einträge vorhanden.",
    "ppa_links_hint": "Der Link ohne Eintrag zeigt nur einen Hinweis — verschicke immer einen Link aus dieser Liste.",
    "ppa_qr": "QR-Code",
    "sp_take": "Übernehmen",
    "lp_text": "Die Seite konnte gerade nicht geladen werden. Wir versuchen es gleich noch einmal.",
    "lp_retry": "Erneut versuchen",
    "vte_saved": "Gespeichert",
    "vte_saving": "Speichert …",
    "vte_failed": "Nicht gespeichert — erneut versuchen",
    "vte_copy": "Text kopieren",
    "vte_copied": "Kopiert",
    "vte_copy_manual": "Der Text ist markiert — bitte mit Strg+C (⌘+C) kopieren.",
    "vte_recompose": "Neu zusammenführen",
    "vte_recompose_confirm": "Wirklich überschreiben? Noch einmal klicken",
    "ss_read_failed": "Die Daten für „{what}“ konnten nicht geladen werden — Bestätigen ist gesperrt, damit nichts mit einer leeren Liste gespeichert wird. Bitte die Seite neu laden.",
    "sp_taken": "Übernommen",
    "ppa_qr_title": "QR-Code",
    "ppa_qr_intro": "Scannen öffnet den Link — zum Ausdrucken, für den Beamer oder den Flyer. Der Link steht darunter, falls jemand nicht scannen kann.",
    "ppa_qr_download": "Als SVG speichern",
    "ppa_fields": "Felder",
    "ppa_fields_title": "Felder auswählen",
    "ppa_fields_intro": "Wähle, welche Felder im öffentlichen Formular erscheinen.",
    "ppa_field_required": "Pflichtfeld — immer enthalten",
    "ppa_field_file": "Datei-Upload wird öffentlich nicht unterstützt",
    "ppa_field_exposes": "Zeigt Besuchern die Liste der verknüpften Einträge",
    "ppa_save": "Speichern",
    "ppa_who_visitor": "Besucher",
    "ppa_list_filter_intro": "{who} sehen nur Einträge, bei denen …",
    "ppa_filter_none": "kein Filter",
    "ppa_op": "Vergleich",
    "ppa_op_eq": "ist",
    "ppa_op_ne": "nicht ist",
    "ppa_op_in": "einer von ist",
    "ppa_op_not_in": "keiner von ist",
    "ppa_op_gt": "größer ist als",
    "ppa_op_gte": "mindestens ist",
    "ppa_op_lt": "kleiner ist als",
    "ppa_op_lte": "höchstens ist",
    "ppa_op_empty": "leer ist",
    "ppa_op_not_empty": "nicht leer ist",
    "ppa_op_date_eq": "am",
    "ppa_op_date_ne": "nicht am",
    "ppa_op_date_gt": "nach",
    "ppa_op_date_gte": "ab",
    "ppa_op_date_lt": "vor",
    "ppa_op_date_lte": "bis",
    "ppa_date_today": "heute",
    "ppa_date_now": "jetzt",
    "ppa_date_pick": "einem Datum",
    "ppa_date_days": "Tage dazu (minus für davor)",
    "ppa_add_condition": "Weitere Bedingung",
    "ppa_remove_condition": "Bedingung entfernen",
    "ppa_mode_all": "alle Bedingungen zutreffen",
    "ppa_mode_any": "mindestens eine Bedingung zutrifft",
    "ppa_list_filter_join": "und",
    "ppa_list_values_hint": "Mehrere Werte mit Komma trennen",
    "ppa_value": "Wert",
    "ppa_list_max_prefix": "Höchstens",
    "ppa_list_max_suffix": "Einträge",
    "ppa_agent_scope": "Die Seite zeigt außerdem nur: {text} – diese Regel ist zu verschachtelt für die Tabelle und lässt sich nur per Änderungsauftrag anpassen.",
    "ppa_agent_filter_hint": "So hat der Agent die Seite gebaut. Du kannst den Filter ändern oder auf „kein Filter“ stellen.",
    "ppa_s_exposes": "öffnet {who} die Liste „{target}“",
    "ppa_who_team": "Dein Team",
    "ppa_nothing_to_adjust": "Hier gibt es nichts anzupassen.",
    "ppa_new_agent": "Neue Seite vom Agenten",
    "ppa_edit_agent": "Ändern (Agent)",
    "ppa_delete": "Löschen",
    "ppa_policy_title": "Felder anpassen",
    "ppa_policy_intro": "Was Besucher sehen und eingeben. Änderungen gelten sofort, ohne Neubau der Seite.",
    "ppa_policy_submit_section": "{who} legen an: {entity}",
    "ppa_policy_list_section": "{who} sehen: {entity}",
    "ppa_col_field": "Feld",
    "ppa_col_visible": "Sichtbar",
    "ppa_col_required": "Pflicht",
    "ppa_col_fixed": "Fester Wert",
    "ppa_col_label": "Beschriftung",
    "ppa_fixed_none": "kein fester Wert",
    "ppa_fixed_hint": "Ein fester Wert wird automatisch eingetragen. {who} sehen das Feld dann nicht.",
    "ppa_more_fields": "Weitere Felder von {entity}",
    "ppa_more_fields_hint": "Diese Felder fragt die Seite nicht ab. Du kannst ihnen einen festen Wert geben.",
    "ppa_pick_locked": "Auswahlschritt, bleibt sichtbar",
    "ppa_policy_texts": "Texte der Seite",
    "ppa_text_title": "Titel",
    "ppa_text_description": "Beschreibung",
    "ppa_text_thanks_title": "Überschrift nach dem Absenden",
    "ppa_text_thanks_message": "Text nach dem Absenden",
    "ppa_policy_saved": "Gespeichert. Gilt sofort für alle Besucher.",
    "ppa_policy_changed": "{n} Anpassungen",
    "ppa_yes": "Ja",
    "ppa_no": "Nein",
    "ppa_back_to_pages": "Zurück zu den öffentlichen Seiten",
    "ppa_more": "Mehr",
    "ppa_less": "Weniger",
    "ppa_s_pick": "{who} wählen hier einen bestehenden Eintrag aus",
    "ppa_s_fixed": "Wird automatisch auf „{value}“ gesetzt, {who} sehen das Feld nicht",
    "ppa_s_never": "Die Seite fragt dieses Feld nicht ab",
    "ppa_s_hidden": "{who} sehen das Feld nicht",
    "ppa_s_visitor_enters": "{who} geben ein",
    "ppa_s_required": "Pflicht",
    "ppa_s_optional": "freiwillig",
    "ppa_s_labelled": "heißt „{label}“",
    "ppa_s_summary": "{visible} Felder sichtbar · {required} Pflicht · {hidden} ausgeblendet · {fixed} fest",
    "ppa_unsaved": "{n} ungespeicherte Änderungen",
    "ppa_nothing_unsaved": "Alles gespeichert",
    "ppa_view_page": "Seite ansehen",
    "ppa_list_hint": "Eine abgewählte Spalte bekommen Besucher gar nicht mehr geliefert. Nutzt die Seite sie für ihre Anzeige, zum Beispiel „Status“ für „verfügbar“, ändert sich die Seite. Prüfe das mit „Seite ansehen“.",
    "ppa_discard": "Verwerfen",
    "am_title": "Deine Anwendung",
    "am_beta": "Beta",
    "am_create_heading": "Wenn du etwas anlegst",
    "am_find": "Finden",
    "am_find_placeholder": "Finden, zum Beispiel „Rechnung“ oder „6 Uhr“",
    "am_nothing": "Nichts gefunden.",
    "am_as_wish": "Als Wunsch aufschreiben",
    "am_assumed_tag": "angenommen",
    "am_inferred_tag": "dazu gedacht",
    "am_inferred_hint": "Stand nicht in deiner Beschreibung — Klar hat es ergänzt. „Nicht nötig“ entfernt es.",
    "am_instant_hint": "Gilt sofort.",
    "am_take": "Übernehmen",
    "am_changed": "Geändert",
    "am_kept": "Bleibt so.",
    "am_undo": "Rückgängig",
    "am_rebuild": "Zurückbauen · ca. {n} Min.",
    "am_undone": "zurückgenommen",
    "am_remaining": "noch ca. {n} Min.",
    "am_meanwhile": "Bis dahin gilt das Alte.",
    "am_job_failed_short": "hat nicht geklappt",
    "am_retry": "Nochmal · ca. {n} Min.",
    "am_leave": "So lassen",
    "am_view": "Ansehen",
    "am_last": "Zuletzt",
    "am_history_link": "Was sich geändert hat",
    "am_more": "Mehr",
    "am_less": "Weniger",
    "am_good_to_know": "Gut zu wissen:",
    "am_other_about": "Etwas anderes an „{label}“ ändern …",
    "am_wish_title": "Was soll an „{label}“ anders sein?",
    "am_wish_title_free": "Schreib auf, was anders sein soll.",
    "am_wish_limits_intent": "Geht hier: Schritte, Auswahl, Vorgaben, was danach automatisch passiert. Geht hier nicht: neue Felder, Rechte, andere Listen.",
    "am_wish_limits_tool": "Geht hier: wann es läuft, welche Einträge es anfasst und was es daran ändert. Geht hier nicht: neue Felder, Rechte, andere Listen.",
    "am_wish_placeholder": "Schreib es in einem Satz.",
    "am_wish_look": "Ansehen",
    "am_report_title": "Was stimmt nicht?",
    "am_report_placeholder": "Ein Satz dazu, was nicht passt.",
    "am_report_send": "Melden",
    "am_report_thanks": "Danke, wir schauen es uns an.",
    "am_report_failed": "Das ging gerade nicht. Bitte noch einmal versuchen.",
    "am_wish_reading": "Wird angesehen … {s} s",
    "am_wish_failed": "Das ging nicht: {error}",
    "am_wish_shape": "So würde es aussehen:",
    "am_before": "Vorher",
    "am_after": "Nachher",
    "am_new": "Neu",
    "am_gone": "Fällt weg",
    "am_stays": "Bleibt",
    "am_do_it": "So machen",
    "am_do_it_minutes": "So machen · ca. {n} Min.",
    "am_not": "Doch nicht",
    "am_after_now": "Das gilt sofort.",
    "am_after_minutes": "Das dauert ein paar Minuten. Du kannst weiterarbeiten, bis dahin gilt das Alte.",
    "am_accepted_now": "Übernommen. Das gilt ab jetzt.",
    "am_accepted_work": "Übernommen. In ein paar Minuten ist es fertig.",
    "am_today": "heute",
    "am_yesterday": "gestern",
    "am_join_and": " und ",
    "pn_failed": "{text} hat nicht geklappt.",
    "pn_view": "Ansehen",
    "pn_setup": "Einrichten",
    "pn_structure": "{text} Soll die Anwendung dafür etwas tun?",
    "wz_adjust": "Anpassen",
    "am_nav": "Deine Anwendung",
    "am_none": "Für diese Anwendung gibt es hier noch nichts zu sehen.",
    "am_stale": "Die Anwendung wurde am {date} neu gebaut, ohne diesen Plan zu kennen. Was hier steht, kann davon abweichen.",
    "am_readonly": "Hier siehst du, wie die Anwendung arbeitet. Ändern können das nur Administratoren.",
    "am_stale_rollback": "Die Anwendung wurde am {date} auf eine ältere Version zurückgesetzt. Was hier steht, kann die neuere beschreiben.",
    "am_planning_failed": "Am {date} konnte der Plan für diese Anwendung nicht erstellt werden. Sie wurde ohne Plan gebaut.",
    "am_planning_failed_adopted": "Am {date} konnte der Plan für diese Anwendung nicht erstellt werden. Sie wurde ohne Plan gebaut. Was hier steht, ist aus der laufenden Anwendung abgelesen.",
    "am_loading": "Lade …",
    "am_saving": "Wird übernommen …",
    "am_upload": "Datei hochladen (PDF, DOCX)",
    "am_mode_all": "alle Bedingungen",
    "am_mode_any": "eine der Bedingungen",
    "am_add_condition": "Bedingung",
    "am_remove": "Entfernen",
    "am_all": "Alle zulassen",
    "am_daily_at": "täglich um {time} Uhr",
    "am_weekly": "jeden Montag um 8 Uhr",
    "am_monthly": "am Monatsersten um 8 Uhr",
    "am_op_eq": "ist",
    "am_op_ne": "ist nicht",
    "am_op_in": "ist eines von",
    "am_op_not_in": "ist keines von",
    "am_op_gt": "größer als",
    "am_op_gte": "mindestens",
    "am_op_lt": "kleiner als",
    "am_op_lte": "höchstens",
    "am_op_empty": "ist leer",
    "am_op_not_empty": "ist gesetzt",
    "am_fits": "Stimmt so",
    "am_published": "Veröffentlicht.",
    "am_change": "ändern",
    "am_join_all": " und ",
    "am_join_any": " oder ",
    "sel_only_where": "Nur wo {text}",
    "ss_set_by_flow": "Setzt der Ablauf",
    "ss_notice_assumed": "Angenommen: {value}.",
    "ss_notice_once": "Das siehst du nur dieses eine Mal.",
    "ss_notice_ok": "Passt",
    "am_confirm_tool": "Die Anwendung passt „{name}“ für dich an. Das dauert ein paar Minuten, bis dahin gilt das Alte.",
    "am_confirm_page": "Die Anwendung passt den Ablauf „{name}“ für dich an. Das dauert ein paar Minuten, bis dahin gilt das Alte.",
    "am_confirm_go": "Umbauen lassen · ca. {n} Min.",
    "am_confirm_cancel": "Abbrechen",
    "am_job_done": "Fertig: {text}",
    "am_job_failed": "Ging nicht: {text}. An der Anwendung hat sich nichts geändert.",
    "am_job_blocked": "Hier wird gerade umgebaut. Sobald das fertig ist, kannst du wieder ändern.",
    "am_dev_toggle": "Für Entwickler: verborgene Zeilen, Kennungen und Plan-Ausschnitte zeigen",
    "pn_running": "Die Anwendung baut gerade um: {text}. Das dauert ein paar Minuten.",
    "ia_title": "Abläufe",
    "ia_subtitle": "Geführte Abläufe für dein Team — vom Agenten gebaut, hier verwaltet.",
    "ia_new": "Neuer Ablauf",
    "ia_manage": "Abläufe verwalten",
    "ia_empty": "Noch kein Ablauf. Beschreibe den ersten in einem Satz — der Agent baut ihn.",
    "ia_open": "Öffnen",
    "ia_edit": "Ändern",
    "ia_delete": "Löschen",
    "ia_fields_intro": "Was dein Team in diesem Ablauf sieht und eingibt. Änderungen gelten sofort, ohne Neubau.",
    "ia_fields_note": "Gilt für alle, die den Ablauf in der App nutzen. Werkzeuge und die Datenverwaltung bleiben unberührt.",
    "ia_back_to_flows": "Zurück zu den Abläufen",
    "ia_view_flow": "Ablauf öffnen",
    "ia_fields_legacy": "Dieser Ablauf ist älter und kennt noch keine anpassbaren Felder. Lass ihn vom Agenten ändern, dann erscheinen sie hier.",
    "ia_policy_saved": "Gespeichert. Gilt sofort für dein Team.",
    "ia_plan_title": "Aus dem Bauplan",
    "ia_plan_hint": "So wurde dieser Ablauf geplant. Was hier steht, darf er schreiben – nicht mehr.",
    "pj_title_create_flow": "Neuer Ablauf",
    "pj_title_edit_flow": "Ablauf ändern",
    "pj_title_delete_flow": "Ablauf löschen",
    "pj_title_create_public": "Neue öffentliche Seite",
    "pj_title_edit_public": "Öffentliche Seite ändern",
    "pj_title_delete_public": "Öffentliche Seite löschen",
    "pj_prompt_label": "Was soll die Seite tun?",
    "pj_prompt_hint": "Ein, zwei Sätze reichen. Der Agent kennt deine Daten und baut los, sobald du abschickst.",
    "pj_prompt_placeholder_flow": "z. B. Neue Buchung anlegen: Gast suchen, Zeitraum im Belegungskalender wählen, Zimmer zuordnen",
    "pj_prompt_placeholder_public": "z. B. Terminanfrage für Kunden ohne Login mit Wunschzeitraum und Kontaktdaten",
    "pj_prompt_edit_placeholder": "z. B. den Schritt „Zusatzleistungen\" entfernen",
    "pj_delete_flow_text": "Der Ablauf verschwindet aus der Seitenleiste und dem Dashboard. Vorhandene Daten bleiben unberührt.",
    "pj_delete_public_text": "Die Seite wird entfernt, der geteilte Link funktioniert danach nicht mehr. Vorhandene Daten bleiben unberührt.",
    "pj_start": "Erstellen lassen",
    "pj_start_edit": "Ändern lassen",
    "pj_start_delete": "Löschen",
    "pj_retry": "Erneut versuchen",
    "pj_cancel": "Abbrechen",
    "pj_close": "Schließen",
    "pj_starting": "Startet …",
    "pj_running": "Das dauert zwei bis vier Minuten. Du kannst das Fenster schließen — der Bau läuft weiter, und das Dashboard meldet sich, wenn die Seite da ist.",
    "pj_done": "Fertig. Lade das Dashboard neu, um die Seite zu sehen.",
    "pj_done_delete": "Entfernt. Lade das Dashboard neu.",
    "pj_reload": "Neu laden",
    "pj_state_running_create": "Wird erstellt",
    "pj_state_running_edit": "Wird geändert",
    "pj_state_running_delete": "Wird gelöscht",
    "pj_state_failed": "Fehlgeschlagen",
    "pj_dismiss": "Verwerfen",
    "pj_failed": "Nicht gebaut",
    "pj_busy": "Für dieses Dashboard läuft gerade ein anderer Bau (seit {minutes} min). Bitte kurz warten und erneut versuchen.",
    "pj_error_network": "Verbindung abgebrochen. Der Bau läuft möglicherweise weiter — das Dashboard meldet sich, wenn die Seite da ist.",
    "pj_toast_started": "Wird im Hintergrund gebaut, das dauert zwei bis vier Minuten. Du kannst weiterarbeiten — das Dashboard meldet sich, wenn es fertig ist.",
    "pj_toast_error_hint_flow": "Unter „Abläufe verwalten“ kannst du es erneut versuchen.",
    "pj_toast_error_hint_public": "Unter „Seiten verwalten“ kannst du es erneut versuchen.",
    "load_error_title": "Fehler beim Laden",
    "retry": "Erneut versuchen",
    "data_load_failed": "Fehler beim Laden der Daten",
    "wizard_back_to_dashboard": "Zurück zum Dashboard",
    "v_required": "„{label}\" ist ein Pflichtfeld",
    "v_email": "Bitte für „{label}\" eine gültige E-Mail-Adresse eingeben.",
    "v_tel": "Bitte für „{label}\" eine gültige Telefonnummer eingeben.",
    "v_url": "Bitte für „{label}\" eine gültige Web-Adresse eingeben.",
    "v_number": "Bitte für „{label}\" eine Zahl eingeben.",
    "v_maxlength": "Bitte „{label}\" auf höchstens {max} Zeichen kürzen.",
    "v_option": "Bitte für „{label}\" einen der angebotenen Werte wählen.",
    "v_range_order": "„{to}\" muss nach „{from}\" liegen",
    "v_range_blocked": "Dieser Zeitraum ist nicht frei — bitte andere Tage wählen",
    "v_min_nights_one": "Mindestaufenthalt: eine Nacht",
    "v_min_nights_other": "Mindestaufenthalt: {n} Nächte",
    "v_nights_one": "{n} Nacht",
    "v_nights_other": "{n} Nächte",
    "v_days_one": "{n} Tag",
    "v_days_other": "{n} Tage",
    "v_min_days_one": "Mindestens ein Tag",
    "v_min_days_other": "Mindestens {n} Tage",
    "v_yes": "Ja",
    "v_record_unnamed": "Ausgewählter Eintrag",
    "v_records_unnamed_one": "{n} ausgewählter Eintrag",
    "v_records_unnamed_other": "{n} ausgewählte Einträge",
    "v_no": "Nein",
    "v_ok": "Eingabe passt",
    "es_title_one": "Bitte korrigiere eine Angabe",
    "es_title_other": "Bitte korrigiere {n} Angaben",
    "ss_title": "Alles richtig?",
    "ss_change": "Ändern",
    "nf_title": "Diese Seite gibt es nicht",
    "nf_message": "Unter „{path}“ liegt nichts — der Link ist veraltet oder vertippt.",
    "nf_back": "Zurück zum Dashboard",
    "ss_change_selection": "Auswahl ändern",
    "ss_missing": "Noch offen:",
    "le_add": "Hinzufügen",
    "le_edit": "Ändern",
    "le_remove": "Entfernen",
    "le_list": "{entity}: Einträge",
    "le_empty": "Noch kein Eintrag. Ausfüllen und „Hinzufügen“ drücken, oder mit „Weiter“ den ersten übernehmen.",
    "ss_confirm": "Bestätigen",
    "ss_submitting": "Wird gespeichert …",
    "ss_error_title": "Das hat nicht geklappt — deine Eingaben sind noch da.",
    "ss_retry": "Erneut versuchen",
    "ss_offline_title": "Keine Verbindung — deine Eingaben sind gesichert.",
    "ss_offline_text": "Sobald das Netz wieder da ist, senden wir sie automatisch. Du kannst die Seite offen lassen.",
    "ss_limited_title": "Gerade viele Teilnehmende",
    "ss_limited_text": "Gerade viele Teilnehmende — wir senden gleich noch einmal.",
    "ss_step_done": "angelegt",
    "ss_step_done_updated": "aktualisiert",
    "ss_step_running_updated": "wird aktualisiert …",
    "ss_step_failed": "fehlgeschlagen",
    "ss_step_running": "wird angelegt …",
    "ss_step_idle": "ausstehend",
    "ss_partial": "{done} ist gesichert. Ein erneuter Versuch legt nichts doppelt an.",
    "ss_step_of": "Schritt {n}",
    "sx_reference": "Referenz",
    "sx_copy": "Kopieren",
    "sx_restart": "Noch einmal",
    "wl_more": "+{n} weitere anzeigen",
    "wl_less": "Weniger anzeigen",
    "sx_undo": "Zurücknehmen",
    "sx_undone": "Zurückgenommen.",
    "sx_undo_failed": "Das Zurücknehmen hat nicht geklappt — bitte noch einmal versuchen.",
    "wz_needs": "Dieser Schritt braucht zuerst: {fields}.",
    "wz_needs_back": "Zu Schritt {step}",
    "sx_copied": "Kopiert",
    "sx_print": "Bestätigung drucken",
    "sx_next_title": "Wie geht es weiter?",
    "sx_default_title": "{entity} angelegt",
    "sx_default_title_updated": "{entity} aktualisiert",
    "sx_saved": "Gespeichert",
    "sn_back": "Zurück",
    "sn_next": "Weiter",
    "sn_next_to": "Weiter: {step}",
    "sn_to_summary": "Zurück zur Zusammenfassung",
    "sn_blocked": "Bitte die Angaben in diesem Schritt vervollständigen.",
    "wz_progress": "Schritt {n} von {total}",
    "wz_progress_label": "Schritt {n} von {total}: {label}",
    "wz_steps_nav": "Fortschritt",
    "up_choose": "Datei auswählen",
    "up_replace": "Andere Datei",
    "up_remove": "Datei entfernen",
    "up_reading": "Datei wird gelesen …",
    "up_hint": "PDF, Bild, Word oder Excel, höchstens {mb} MB.",
    "up_too_big": "Die Datei ist größer als {mb} MB.",
    "up_bad_type": "Diese Dateiart geht hier nicht — bitte PDF, Bild, Word oder Excel.",
    "up_empty": "Die Datei ist leer.",
    "up_read_failed": "Die Datei ließ sich nicht lesen. Bitte noch einmal auswählen.",
    "wz_step_done": "erledigt",
    "wz_completed": "Abgeschlossen",
    "wz_answers": "Bisherige Angaben",
    "wz_draft_resumed": "Entwurf {when} fortgesetzt — deine Angaben sind noch da.",
    "wz_draft_discard": "Verwerfen",
    "wz_draft_just_now": "von eben",
    "wz_draft_today": "von heute",
    "wz_draft_yesterday": "von gestern",
    "wz_draft_days_ago": "von vor {n} Tagen",
    "wz_intro_start": "Los geht's",
    "wz_intro_steps": "So läuft es ab:",
    "wz_intro_needs": "Das brauchst du",
    "wz_intro_eyebrow": "So funktioniert's",
    "wz_intro_button": "So funktioniert's",
    "wz_intro_close": "Schließen",
    "wz_intro_steps_count_one": "ein Schritt",
    "wz_intro_steps_count_other": "{n} Schritte",
    "wz_intro_minutes": "ca. {n} Min.",
    "wz_intro_autosave": "Deine Eingaben werden automatisch zwischengespeichert.",
    "wz_intro_once": "Diese Einführung erscheint nur beim ersten Mal.",
    "pf_free": "frei",
    "pf_occupied": "belegt",
    "pf_pick_resource_first": "Zuerst „{resource}“ wählen — der Kalender zeigt dann, welche Nächte dort frei sind.",
    "step_create_new": "Neu erstellen",
    "sel_type_to_search": "Tippe, um zu suchen …",
    "sel_min_chars": "Mindestens {n} Zeichen eingeben",
    "sel_showing_of": "{shown} von {total} angezeigt – Suche verfeinern",
    "sel_search_failed": "Suche fehlgeschlagen. Bitte erneut versuchen.",
    "sel_loading": "Einträge werden geladen …",
    "sel_selected_one": "{n} Eintrag ausgewählt",
    "sel_selected_other": "{n} Einträge ausgewählt",
    "sel_no_hits": "Keine Treffer für „{q}“.",
    "sel_clear_search": "Suche zurücksetzen",
    "sel_empty_filtered": "Kein Eintrag erfüllt die Voraussetzung dieses Schritts.",
    "sel_empty_entity": "Noch keine Einträge unter „{entity}“.",
    "sel_create_title": "Neuer Eintrag: {entity}",
    "sel_create_submit": "Anlegen und auswählen",
    "sel_create_failed": "Anlegen fehlgeschlagen. Bitte erneut versuchen.",
    "budget_none": "Kein Budget definiert",
    "budget_booked": "Gebucht",
    "budget_of": "von",
    "budget_remaining": "Verbleibend",
    "budget_over": "Budget überschritten!",
    "budget_label": "Budget",
    "cap_label": "Auslastung",
    "cap_none": "Keine Kapazität festgelegt",
    "cap_booked": "Belegt",
    "cap_of": "von",
    "cap_remaining": "Frei",
    "cap_over": "Kapazität überschritten",
    "cap_full": "Voll belegt",
    "arp_pick_arrival": "Anreise wählen",
    "arp_pick_departure": "Abreise wählen",
    "arp_nights_one": "{n} Nacht ausgewählt",
    "arp_nights_other": "{n} Nächte ausgewählt",
    "arp_hint_blocked": "Dieser Zeitraum ist bereits belegt.",
    "arp_hint_min_nights": "Mindestaufenthalt: {n} Nächte",
    "arp_pick_start": "Beginn wählen",
    "arp_pick_end": "Ende wählen",
    "arp_days_one": "{n} Tag ausgewählt",
    "arp_days_other": "{n} Tage ausgewählt",
    "arp_hint_min_days": "Mindestens {n} Tage",
    "arp_legend_free": "Frei",
    "arp_legend_blocked": "Belegt",
    "arp_legend_selected": "Ausgewählt",
    "arp_prev_month": "Voriger Monat",
    "arp_next_month": "Nächster Monat",
    "arp_clear": "Auswahl löschen",
    "combo_search": "Suchen…",
    "combo_no_match": "Kein Treffer",
    "combo_clear_selection": "Auswahl entfernen",
    "combo_clear_search": "Suche leeren",
    "combo_create_new": "Neuen Eintrag anlegen",
    "combo_create_named": "„{name}“ anlegen",
    "combo_create_labeled": "{label} anlegen",
    "combo_create_prefill_hint": "Übernimmt den Suchtext als Vorbelegung",
    "combo_create_inline_hint": "Direkt im Dialog erfassen",
    "combo_add_more": "+ Hinzufügen",
    "combo_remove_item": "{label} entfernen",
    "date_hint_date": "tt.mm.jjjj",
    "date_hint_datetime": "tt.mm.jjjj, hh:mm",
    "date_pick_date": "Datum wählen",
    "date_pick_datetime": "Datum & Uhrzeit wählen",
    "date_clear": "Datum zurücksetzen",
    "date_hours": "Stunden",
    "date_minutes": "Minuten",
    "date_now": "Jetzt",
    "date_today": "Heute",
    "date_reset": "Zurücksetzen",
    "address_search": "Adresse suchen…",
    "address_none": "Keine Adresse gefunden",
    "sat_empty": "Noch keine {title}.",
    "sat_add": "{title} hinzufügen",
    "sat_pick": "Vorhandene wählen",
    "pick_title": "{title} verknüpfen",
    "pick_description": "Einen vorhandenen Eintrag auswählen und mit diesem Datensatz verknüpfen.",
    "pick_placeholder": "Eintrag suchen…",
    "pick_empty": "Alle Einträge sind bereits verknüpft.",
    "pick_confirm": "Verknüpfen",
    "pick_linked": "verknüpft",
    "intents_heading": "Abläufe",
    "intents_pending": "Werden erstellt …",
    "placeholder_page_desc": "Hier die eigene {entity}-Ansicht bauen.",
    "placeholder_page_box": "Platzhalter für eigene UI — hier die {entity}-Ansicht bauen",
    "tools_label": "Werkzeuge",
    "tools_subtitle_available": "verfügbar",
    "tools_empty_title": "Noch keine Werkzeuge angelegt",
    "tools_empty_desc": "Beschreibe im Chat, was du automatisieren willst — daraus entsteht dein erstes Werkzeug.",
    "tools_empty_cta": "Im Chat erstellen",
    "tools_file_singular": "Datei",
    "tools_file_plural": "Dateien",
    "chatw_title": "Assistent",
    "chatw_placeholder": "Frage stellen oder Bild hochladen...",
    "chatw_thinking": "Denkt nach...",
    "chatw_analyze_image": "Bild analysieren",
    "chatw_attach_file": "Datei anhängen",
    "chatw_fullscreen": "Vollbild",
    "chatw_exit_fullscreen": "Verkleinern",
    "ctx_error_text": "Fehler bei der Ausführung",
    "ctx_action_label": "Aktion",
    "acd_test_version": "v{v} testen",
    "vc_loading_versions": "Lade Versionen...",
    "vc_no_previous_versions": "Keine früheren Versionen",
    "vc_error_text": "Fehler aufgetreten",
    "vc_label_initial": "Erstversion",
    "vc_label_update": "Scaffold-Update",
    "vc_label_agent": "KI-Änderung",
    "vc_label_main_branch": "Hauptlinie",
    "vc_label_alternate_direction": "Alternative Richtung",
    "vc_version_singular": "Version",
    "vc_version_plural": "Versionen",
    "polish_greeting_morning": "Guten Morgen!",
    "polish_greeting_day": "Guten Tag!",
    "polish_greeting_evening": "Guten Abend!",
    "polish_greeting_morning_named": "Guten Morgen, {name}!",
    "polish_greeting_day_named": "Guten Tag, {name}!",
    "polish_greeting_evening_named": "Guten Abend, {name}!",
    "polish_undo": "Rückgängig",
    "attachments_upload_failed": "Datei konnte nicht hochgeladen werden.",
    "scan_error": "Scan fehlgeschlagen",
    "scan_header_sub": "Versteht Fotos, Dokumente und Text und füllt alles für dich aus",
    "scan_analyzing": "KI analysiert...",
    "scan_analyzing_sub": "Felder werden automatisch ausgefüllt",
    "scan_success": "Felder ausgefüllt!",
    "scan_success_sub": "Prüfe die Werte und passe sie ggf. an",
    "scan_upload": "Foto oder Dokument hierher ziehen oder auswählen",
    "scan_camera_btn": "Kamera",
    "scan_file_btn": "Foto wählen",
    "scan_doc_btn": "Dokument",
    "useinfo_label": "KI-Assistent darf zusätzlich Informationen zu meiner Person verwenden",
    "useinfo_more": "mehr Infos",
    "useinfo_loading": "Lade...",
    "useinfo_error": "Profil konnte nicht geladen werden",
    "profile_preamble": "Folgende Infos über dich können von der KI genutzt werden:",
    "scan_text_placeholder": "Text eingeben oder einfügen, z.B. Notizen, E-Mails, Beschreibungen...",
    "scan_text_analyze": "Analysieren",
    "smart_fill": "KI-Ausfüllen",
    "missing_required": "Bitte fülle die markierten Pflichtfelder aus.",
    "paste": "Einfügen",
    "bulk_edit_title": "Feld für ausgewählte Einträge bearbeiten",
    "details": "Details",
    "relations": "Verknüpft",
    "not_found": "Eintrag nicht gefunden",
    "required_hint": "Pflichtfeld"
  },
  "en": {
    "overview": "Overview",
    "navigation": "Navigation",
    "cancel": "Cancel",
    "delete": "Delete",
    "save": "Save",
    "crud_created": "created",
    "crud_updated": "updated",
    "saving": "Saving...",
    "submit_error": "Saving failed.",
    "create": "Create",
    "search": "Search...",
    "actions": "Actions",
    "no_results": "No results found.",
    "no_data_yet": "No {entity} yet. Add one!",
    "select_placeholder": "Select...",
    "confirm_delete_desc": "Are you sure? This action cannot be undone.",
    "add": "Add",
    "view_entity": "View {entity}",
    "edit_button": "Edit",
    "edit_entity": "Edit {entity}",
    "new_entity": "New {entity}",
    "delete_entity": "Delete {entity}",
    "yes": "Yes",
    "no": "No",
    "search_entity": "Search {entity}...",
    "in_system": "{entity} in the system",
    "welcome": "Welcome back",
    "overview_subtitle": "Here's an overview of your data.",
    "management": "Management",
    "dashboard": "Dashboard",
    "date_format": "MMM d, yyyy",
    "admin": "Admin",
    "admin_subtitle": "Manage all data",
    "records": "records",
    "select_all": "Select all",
    "bulk_delete": "Delete selected",
    "bulk_clone": "Clone selected",
    "bulk_edit": "Edit field",
    "selected": "selected",
    "apply_to_n": "Apply to {n} records",
    "filter": "Filter",
    "clear_filters": "Clear filters",
    "choose_field": "Choose field",
    "new_value": "New value",
    "all_values": "All",
    "confirm_bulk_delete": "Are you sure you want to delete {n} records? This action cannot be undone.",
    "deselect_all": "Deselect all",
    "applying": "Applying...",
    "create_new_app": "Create New App",
    "apps_label": "Apps",
    "profile_label": "Profile",
    "back": "Back",
    "display_section": "View",
    "data_management": "Data management",
    "apps_search": "Search...",
    "apps_no_results": "No apps found",
    "apps_page_of": "of",
    "sort_newest": "Newest first",
    "sort_oldest": "Oldest first",
    "sort_az": "Name, A → Z",
    "sort_za": "Name, Z → A",
    "edit_dashboard": "Klar Lab",
    "developer": "Developer",
    "beta_features": "Beta Features",
    "actions_section": "Actions",
    "files_section": "Files",
    "public_pages_section": "Public pages",
    "legal_imprint": "Imprint",
    "legal_privacy": "Privacy",
    "source_code": "Source Code",
    "copy_code": "Copy code",
    "copied": "Copied!",
    "code_for": "Code for",
    "delete_confirm": "Delete action",
    "delete_confirm_from": "from",
    "action_deleted": "Action deleted:",
    "empty_action": "Empty action",
    "run": "Run",
    "field_required": "is required",
    "file_too_large": "File exceeds the 10 MB limit.",
    "preparing": "Preparing...",
    "busy": "Working...",
    "files_label": "Files",
    "no_files": "No files yet",
    "sort_name_az": "Name A→Z",
    "sort_name_za": "Name Z→A",
    "delete_file_confirm": "Delete file",
    "file_deleted": "File deleted:",
    "datetime_format": "MMM d, yyyy, h:mm a",
    "download": "Download",
    "auth_error_title": "You are not logged in.",
    "auth_login_button": "Log in",
    "perm_denied_title": "You do not have permission for this.",
    "perm_denied_desc": "An administrator of the application can grant it.",
    "repair_text": "Repair Dashboard",
    "repair_error_title": "Something went wrong",
    "repair_reload": "Reload",
    "repair_starting": "Starting repair...",
    "repair_running": "Repairing...",
    "repair_done_title": "Dashboard Repaired",
    "repair_done_desc": "The issue has been fixed. Please reload the page.",
    "repair_failed": "Automatic repair failed. Please contact support.",
    "fix_action_button": "Try to fix",
    "fix_action_running": "Fixing…",
    "fix_error_heading": "Error executing",
    "fix_intro_prefix": "Fixing",
    "fix_intro_suffix": "started a new chat session for this fix.",
    "fix_still_fails": "The action still fails",
    "fix_not_confirmed": "The fix is not confirmed yet — your original input stays preserved.",
    "fix_request_failed": "Fix request failed",
    "fix_retry_hint": "Your original input stays preserved — you can retry the fix.",
    "close": "Close",
    "code_versions": "Versions",
    "code_version_active": "Active",
    "code_tab_code": "Code",
    "code_tab_diff": "Changes",
    "code_tab_diff_to": "Changes vs",
    "code_viewing_old_prefix": "Viewing",
    "code_viewing_old_suffix": "— not the active version.",
    "code_restore": "Restore this version",
    "code_restore_confirm_title": "Restore version",
    "code_restore_confirm_desc": "The current code will be replaced. Nothing is lost — a new version is created.",
    "code_restore_failed": "Restore failed",
    "code_restored_to": "Restored to version",
    "code_origin_fix": "Auto-Fix",
    "code_origin_chat": "Chat",
    "code_origin_initial": "Created",
    "code_origin_revert": "Restored",
    "code_no_versions": "No previous versions",
    "code_lines": "lines",
    "code_out_tab": "Output",
    "code_out_heading": "Test run",
    "code_out_history_badge": "Code from history — not restored",
    "code_out_inputs": "Inputs",
    "code_out_open": "Open",
    "code_out_no_output": "(no output)",
    "code_chat_placeholder": "Ask about this code…",
    "code_back_to_tools": "Back to tools",
    "code_switch_tool": "Switch action",
    "version_card_view_changes": "View changes",
    "version_card_undo": "Undo",
    "version_card_open_action": "Open action",
    "chat_history_title": "History",
    "chat_new": "New chat",
    "run_done_badge": "Completed",
    "run_id_copy": "Copy RunID — quote it when reporting a problem",
    "dock_empty_hint": "Ask about this action — the answer knows its code and versions.",
    "dock_suggest_what": "What does this action do?",
    "dock_suggest_explain": "Explain the code to me",
    "dock_ctx_other_prefix": "This conversation belongs to",
    "dock_ctx_general": "General conversation, not tied to an action",
    "scope_menu_general_title": "General conversation",
    "scope_general_short": "General",
    "scope_menu_action_desc": "Questions & changes about this action",
    "scope_menu_last_prefix": "Last",
    "run_result_details": "Details",
    "chat_new_for_tool": "New conversation about this action",
    "chat_history_search": "Search history…",
    "chat_history_empty": "No conversations yet",
    "chat_history_today": "Today",
    "chat_history_yesterday": "Yesterday",
    "chat_history_older": "Older",
    "chat_history_active": "Active",
    "chat_history_recent": "Recent",
    "chat_history_filter_all": "All",
    "chat_history_filter_tool": "This action",
    "chat_history_delete_title": "Delete session?",
    "chat_history_delete_desc": "This conversation will be permanently deleted.",
    "chat_history_delete_action": "Delete",
    "chat_resumed": "Session resumed",
    "chat_messages_label": "messages",
    "toast_network_title": "Network error",
    "toast_network_desc": "Lost connection to the server.",
    "toast_server_title": "Server error",
    "toast_server_desc": "Please try again later.",
    "toast_bug_desc": "An issue was detected. The dashboard can be repaired automatically.",
    "update_available": "Update available:",
    "update_confirm_title": "Install update?",
    "update_confirm_desc": "The app will be updated to the latest version. This takes a few minutes.",
    "update_confirm_action": "Update",
    "updating": "Updating…",
    "update_verifying": "Confirming version…",
    "update_verify_timeout": "Could not confirm new version. Please reload the page.",
    "update_busy_queued": "A build is already running (started {min} min ago). The update is queued and will run automatically afterwards.",
    "busy_build_running": "A build is currently running for this dashboard. Please try again in a few minutes.",
    "vc_build_pill": "Building in your changes",
    "vc_build_initial": "Finishing setting up your app",
    "vc_build_update": "Dashboard is being updated",
    "vc_build_failed": "The last update failed — your change is not in the dashboard yet.",
    "vc_updated_toast": "Dashboard has been updated",
    "vc_updated_toast_desc": "The structure has changed — please reopen any open forms.",
    "vc_updated_reload": "Reload",
    "vc_updated_later": "Later",
    "rollback_label": "Revert to",
    "rollback_confirm_title": "Revert version?",
    "rollback_confirm_desc": "The app will be reverted to the selected version.",
    "rollback_confirm_action": "Revert",
    "rolling_back": "Reverting…",
    "attachments_label": "Attachments",
    "attachments_empty": "No attachments yet",
    "attachments_add": "Add attachment",
    "attachments_type": "Type",
    "attachments_label_field": "Label",
    "attachments_value": "Value",
    "attachments_value_file": "File",
    "attachments_value_note": "Note",
    "attachments_value_url": "URL",
    "attachments_value_json": "JSON",
    "attachments_choose_file": "Choose file",
    "attachments_uploading": "Uploading…",
    "attachments_loading": "Loading attachments…",
    "attachments_save_record_first": "Save the record first, then attachments can be added.",
    "attachments_invalid_json": "Invalid JSON",
    "attachments_open": "Open",
    "attachments_dz_hint": "Drop file here or click",
    "attachments_dz_subhint": "PDFs, images, documents",
    "attachments_input_placeholder": "Note, image, or URL",
    "attachments_hint_enter": "↵ Press Enter to add",
    "attachments_add_dialog_title": "Add attachment",
    "attachments_or": "or",
    "attachments_empty_cta": "Add attachment — drop a file or click",
    "attachments_drop_to_upload": "Release to upload",
    "attachments_delete_title": "Delete attachment?",
    "attachments_delete_desc": "This attachment will be permanently removed.",
    "attachments_rel_just_now": "just now",
    "attachments_rel_min_prefix": "",
    "attachments_rel_min": "min ago",
    "attachments_rel_hr_prefix": "",
    "attachments_rel_hr": "h ago",
    "attachments_rel_day_prefix": "",
    "attachments_rel_day": "d ago",
    "fr_show_coords": "Show coordinates",
    "fr_hide_coords": "Hide coordinates",
    "fr_lat": "Latitude",
    "fr_long": "Longitude",
    "fr_upload_file": "Upload file",
    "fr_change": "Change",
    "fr_remove": "Remove",
    "fr_use_location": "Use my location",
    "fr_photo_location": "Location from photo",
    "fr_search_address": "Search an address…",
    "fr_record_url": "Record URL",
    "create_in": "New in {entity}",
    "assigned_by_system": "Assigned by the system",
    "pf_submit_text": "Submit",
    "pf_submitting_text": "Submitting...",
    "pf_required_error_text": "This field is required.",
    "pf_unavailable_title": "Not available",
    "pf_unavailable_message": "This form is currently not available.",
    "pf_error_generic_text": "Something went wrong. Please try again.",
    "pf_rate_limit_text": "Too many attempts — please wait a moment and try again.",
    "pf_another_entry_text": "Submit another",
    "pf_powered_by_text": "Powered by Klar",
    "pf_address_placeholder": "Search address...",
    "pf_remove_text": "Remove",
    "pps_unavailable_message": "This page is currently not available.",
    "ppn_heading": "Public pages",
    "ppa_title": "Public pages",
    "ppa_subtitle": "Forms and pages you can share via link — no account required for visitors.",
    "ppa_empty": "No pages yet. Ask in the chat for the public page you need — it gets built and shows up here.",
    "ppa_origin_auto": "Suggested",
    "ppa_origin_user": "Yours",
    "ppa_origin_agent": "AI page",
    "ppa_status_published": "Public",
    "ppa_status_draft": "Draft",
    "ppa_republish": "was published — rights changed, please approve again",
    "ppa_publish": "Publish",
    "ppa_pause": "Pause",
    "ppa_open": "Show fields",
    "ppa_copy": "Copy link",
    "ppa_copied": "Copied!",
    "ppa_confirm_title": "Publish this page?",
    "ppa_can_do": "Anyone with the link can:",
    "ppa_cannot_do": "Nobody can:",
    "ppa_can_submit": "submit entries",
    "ppa_can_view": "see this data",
    "ppa_cannot_line": "see or change existing data.",
    "ppa_cannot_change_line": "change or delete existing data.",
    "ppa_link_param_note": "A per-record link shows a visitor just that one record. Technically the page can still read every record of the lists above — a scope on the list narrows that.",
    "ppa_cancel": "Cancel",
    "ppa_confirm_publish": "Publish",
    "ps_preview_banner": "Preview — only you can see this page. Submitting creates a real record.",
    "ppa_preview": "Preview",
    "ppa_links": "Links",
    "ppa_links_title": "Link per record",
    "ppa_links_intro": "This page needs a record in the link. Copy the matching link and send it out.",
    "ppa_links_empty": "No records yet.",
    "ppa_links_hint": "The link without a record only shows a notice — always send a link from this list.",
    "ppa_qr": "QR code",
    "sp_take": "Use this",
    "lp_text": "The page could not be loaded just now. We will try again in a moment.",
    "lp_retry": "Try again",
    "vte_saved": "Saved",
    "vte_saving": "Saving …",
    "vte_failed": "Not saved — try again",
    "vte_copy": "Copy text",
    "vte_copied": "Copied",
    "vte_copy_manual": "The text is selected — please copy it with Ctrl+C (⌘+C).",
    "vte_recompose": "Compose again",
    "vte_recompose_confirm": "Really overwrite? Click again",
    "ss_read_failed": "The data for “{what}” could not be loaded — confirming is locked so nothing is saved from an empty list. Please reload the page.",
    "sp_taken": "Taken",
    "ppa_qr_title": "QR code",
    "ppa_qr_intro": "Scanning opens the link — for a poster, a projector or a flyer. The link is printed below it for anyone who cannot scan.",
    "ppa_qr_download": "Save as SVG",
    "ppa_fields": "Fields",
    "ppa_fields_title": "Choose fields",
    "ppa_fields_intro": "Choose which fields appear in the public form.",
    "ppa_field_required": "Required — always included",
    "ppa_field_file": "File upload is not supported publicly",
    "ppa_field_exposes": "Reveals the list of linked entries to visitors",
    "ppa_save": "Save",
    "ppa_who_visitor": "Visitors",
    "ppa_list_filter_intro": "{who} only see entries where …",
    "ppa_filter_none": "no filter",
    "ppa_op": "Comparison",
    "ppa_op_eq": "is",
    "ppa_op_ne": "is not",
    "ppa_op_in": "is one of",
    "ppa_op_not_in": "is none of",
    "ppa_op_gt": "is greater than",
    "ppa_op_gte": "is at least",
    "ppa_op_lt": "is less than",
    "ppa_op_lte": "is at most",
    "ppa_op_empty": "is empty",
    "ppa_op_not_empty": "is not empty",
    "ppa_op_date_eq": "is on",
    "ppa_op_date_ne": "is not on",
    "ppa_op_date_gt": "is after",
    "ppa_op_date_gte": "is from",
    "ppa_op_date_lt": "is before",
    "ppa_op_date_lte": "is up to",
    "ppa_date_today": "today",
    "ppa_date_now": "now",
    "ppa_date_pick": "a date",
    "ppa_date_days": "days added (negative for before)",
    "ppa_add_condition": "Another condition",
    "ppa_remove_condition": "Remove condition",
    "ppa_mode_all": "all conditions apply",
    "ppa_mode_any": "at least one condition applies",
    "ppa_list_filter_join": "and",
    "ppa_list_values_hint": "Separate several values with commas",
    "ppa_value": "Value",
    "ppa_list_max_prefix": "At most",
    "ppa_list_max_suffix": "entries",
    "ppa_agent_scope": "The page also shows only: {text} – this rule is too nested for the table and can only be changed by a change request.",
    "ppa_agent_filter_hint": "This is how the agent built the page. You can change the filter or set it to \"no filter\".",
    "ppa_s_exposes": "opens the list \"{target}\" to {who}",
    "ppa_who_team": "Your team",
    "ppa_nothing_to_adjust": "Nothing to adjust here.",
    "ppa_new_agent": "New page by the agent",
    "ppa_edit_agent": "Change (agent)",
    "ppa_delete": "Delete",
    "ppa_policy_title": "Adjust fields",
    "ppa_policy_intro": "What visitors see and enter. Changes apply immediately, without rebuilding the page.",
    "ppa_policy_submit_section": "{who} create: {entity}",
    "ppa_policy_list_section": "{who} see: {entity}",
    "ppa_col_field": "Field",
    "ppa_col_visible": "Visible",
    "ppa_col_required": "Required",
    "ppa_col_fixed": "Fixed value",
    "ppa_col_label": "Label",
    "ppa_fixed_none": "no fixed value",
    "ppa_fixed_hint": "A fixed value is filled in automatically. {who} do not see the field then.",
    "ppa_more_fields": "More fields of {entity}",
    "ppa_more_fields_hint": "The page does not ask for these fields. You can give them a fixed value.",
    "ppa_pick_locked": "Selection step, stays visible",
    "ppa_policy_texts": "Page texts",
    "ppa_text_title": "Title",
    "ppa_text_description": "Description",
    "ppa_text_thanks_title": "Heading after submitting",
    "ppa_text_thanks_message": "Text after submitting",
    "ppa_policy_saved": "Saved. Applies immediately to all visitors.",
    "ppa_policy_changed": "{n} adjustments",
    "ppa_yes": "Yes",
    "ppa_no": "No",
    "ppa_back_to_pages": "Back to public pages",
    "ppa_more": "More",
    "ppa_less": "Less",
    "ppa_s_pick": "{who} pick an existing entry here",
    "ppa_s_fixed": "Set automatically to \"{value}\", {who} do not see the field",
    "ppa_s_never": "The page does not ask for this field",
    "ppa_s_hidden": "{who} do not see the field",
    "ppa_s_visitor_enters": "{who} enter",
    "ppa_s_required": "required",
    "ppa_s_optional": "optional",
    "ppa_s_labelled": "labelled \"{label}\"",
    "ppa_s_summary": "{visible} fields visible · {required} required · {hidden} hidden · {fixed} fixed",
    "ppa_unsaved": "{n} unsaved changes",
    "ppa_nothing_unsaved": "Everything saved",
    "ppa_view_page": "View page",
    "ppa_list_hint": "A column you untick is no longer delivered to visitors at all. If the page uses it for its display, e.g. \"Status\" for \"available\", the page changes. Check with \"View page\".",
    "ppa_discard": "Discard",
    "am_title": "Your application",
    "am_beta": "Beta",
    "am_create_heading": "When you add something",
    "am_find": "Find",
    "am_find_placeholder": "Find, for example “invoice” or “6 am”",
    "am_nothing": "Nothing found.",
    "am_as_wish": "Write it down as a wish",
    "am_assumed_tag": "assumed",
    "am_inferred_tag": "added for you",
    "am_inferred_hint": "Not in your description — Klar added it. “Not needed” removes it.",
    "am_instant_hint": "Applies at once.",
    "am_take": "Apply",
    "am_changed": "Changed",
    "am_kept": "Kept as it is.",
    "am_undo": "Undo",
    "am_rebuild": "Rebuild the old way · about {n} min.",
    "am_undone": "undone",
    "am_remaining": "about {n} min. left",
    "am_meanwhile": "Until then the old way applies.",
    "am_job_failed_short": "did not work",
    "am_retry": "Try again · about {n} min.",
    "am_leave": "Leave it",
    "am_view": "View",
    "am_last": "Last",
    "am_history_link": "What has changed",
    "am_more": "More",
    "am_less": "Less",
    "am_good_to_know": "Good to know:",
    "am_other_about": "Change something else about “{label}” …",
    "am_wish_title": "What should be different about “{label}”?",
    "am_wish_title_free": "Write down what should be different.",
    "am_wish_limits_intent": "Possible here: steps, choices, defaults, what happens automatically afterwards. Not possible here: new fields, permissions, other lists.",
    "am_wish_limits_tool": "Possible here: when it runs, which entries it touches and what it changes about them. Not possible here: new fields, permissions, other lists.",
    "am_wish_placeholder": "Say it in one sentence.",
    "am_wish_look": "Show me",
    "am_report_title": "What is wrong?",
    "am_report_placeholder": "One sentence about what is not right.",
    "am_report_send": "Report",
    "am_report_thanks": "Thank you, we will look into it.",
    "am_report_failed": "That did not work just now. Please try again.",
    "am_wish_reading": "Looking at it … {s} s",
    "am_wish_failed": "That did not work: {error}",
    "am_wish_shape": "This is how it would look:",
    "am_before": "Before",
    "am_after": "After",
    "am_new": "New",
    "am_gone": "Goes away",
    "am_stays": "Stays",
    "am_do_it": "Do it",
    "am_do_it_minutes": "Do it · about {n} min.",
    "am_not": "Not now",
    "am_after_now": "This applies at once.",
    "am_after_minutes": "This takes a few minutes. You can keep working; until then the old way applies.",
    "am_accepted_now": "Done. This applies from now on.",
    "am_accepted_work": "Accepted. It will be ready in a few minutes.",
    "am_today": "today",
    "am_yesterday": "yesterday",
    "am_join_and": " and ",
    "pn_failed": "{text} did not work.",
    "pn_view": "View",
    "pn_setup": "Set up",
    "pn_structure": "{text} Should the application do something for it?",
    "wz_adjust": "Adjust",
    "am_nav": "Your application",
    "am_none": "There is nothing to show for this application yet.",
    "am_stale": "The application was rebuilt on {date} without this plan. What you read here may differ from it.",
    "am_readonly": "This shows how the application works. Only administrators can change it.",
    "am_stale_rollback": "The application was set back to an older version on {date}. What you read here may describe the newer one.",
    "am_planning_failed": "On {date} the plan for this application could not be made. It was built without a plan.",
    "am_planning_failed_adopted": "On {date} the plan for this application could not be made. It was built without a plan. What you read here was read off the running application.",
    "am_loading": "Loading …",
    "am_saving": "Applying …",
    "am_upload": "Upload a file (PDF, DOCX)",
    "am_mode_all": "all conditions",
    "am_mode_any": "any condition",
    "am_add_condition": "Condition",
    "am_remove": "Remove",
    "am_all": "Allow all",
    "am_daily_at": "daily at {time}",
    "am_weekly": "every Monday at 8 am",
    "am_monthly": "on the first of the month at 8 am",
    "am_op_eq": "is",
    "am_op_ne": "is not",
    "am_op_in": "is one of",
    "am_op_not_in": "is none of",
    "am_op_gt": "greater than",
    "am_op_gte": "at least",
    "am_op_lt": "less than",
    "am_op_lte": "at most",
    "am_op_empty": "is empty",
    "am_op_not_empty": "is set",
    "am_fits": "Keep it",
    "am_published": "Published.",
    "am_change": "change",
    "am_join_all": " and ",
    "am_join_any": " or ",
    "sel_only_where": "Only where {text}",
    "ss_set_by_flow": "Set by the flow",
    "ss_notice_assumed": "Assumed: {value}.",
    "ss_notice_once": "You see this only once.",
    "ss_notice_ok": "Fine",
    "am_confirm_tool": "The application adapts “{name}” for you. This takes a few minutes; until then the old way applies.",
    "am_confirm_page": "The application adapts the flow “{name}” for you. This takes a few minutes; until then the old way applies.",
    "am_confirm_go": "Have it rebuilt · about {n} min.",
    "am_confirm_cancel": "Cancel",
    "am_job_done": "Done: {text}",
    "am_job_failed": "Did not work: {text}. Nothing changed in the application.",
    "am_job_blocked": "This is being rebuilt right now. You can change it again once that is done.",
    "am_dev_toggle": "For developers: show hidden lines, ids and plan fragments",
    "pn_running": "The application is being rebuilt: {text}. This takes a few minutes.",
    "ia_title": "Flows",
    "ia_subtitle": "Guided flows for your team — built by the agent, managed here.",
    "ia_new": "New flow",
    "ia_manage": "Manage flows",
    "ia_empty": "No flow yet. Describe the first one in a sentence — the agent builds it.",
    "ia_open": "Open",
    "ia_edit": "Change",
    "ia_delete": "Delete",
    "ia_fields_intro": "What your team sees and enters in this flow. Changes apply at once, without a rebuild.",
    "ia_fields_note": "Applies to everyone using the flow in the app. Tools and data management stay untouched.",
    "ia_back_to_flows": "Back to flows",
    "ia_view_flow": "Open flow",
    "ia_fields_legacy": "This flow is older and has no adjustable fields yet. Have the agent change it and they appear here.",
    "ia_policy_saved": "Saved. Applies to your team at once.",
    "ia_plan_title": "From the plan",
    "ia_plan_hint": "This is how the flow was planned. What is listed here it may write – nothing more.",
    "pj_title_create_flow": "New flow",
    "pj_title_edit_flow": "Change flow",
    "pj_title_delete_flow": "Delete flow",
    "pj_title_create_public": "New public page",
    "pj_title_edit_public": "Change public page",
    "pj_title_delete_public": "Delete public page",
    "pj_prompt_label": "What should the page do?",
    "pj_prompt_hint": "One or two sentences are enough. The agent knows your data and starts as soon as you submit.",
    "pj_prompt_placeholder_flow": "e.g. Create a booking: find the guest, pick the stay in the occupancy calendar, assign a room",
    "pj_prompt_placeholder_public": "e.g. Appointment request for customers without a login, with preferred dates and contact details",
    "pj_prompt_edit_placeholder": "e.g. remove the \"Extras\" step",
    "pj_delete_flow_text": "The flow disappears from the sidebar and the dashboard. Existing data is not touched.",
    "pj_delete_public_text": "The page is removed and its shared link stops working. Existing data is not touched.",
    "pj_start": "Build it",
    "pj_start_edit": "Change it",
    "pj_start_delete": "Delete",
    "pj_retry": "Try again",
    "pj_cancel": "Cancel",
    "pj_close": "Close",
    "pj_starting": "Starting …",
    "pj_running": "This takes two to four minutes. You can close this window — the build continues, and the dashboard tells you when the page is there.",
    "pj_done": "Done. Reload the dashboard to see the page.",
    "pj_done_delete": "Removed. Reload the dashboard.",
    "pj_reload": "Reload",
    "pj_state_running_create": "Being created",
    "pj_state_running_edit": "Being changed",
    "pj_state_running_delete": "Being deleted",
    "pj_state_failed": "Failed",
    "pj_dismiss": "Dismiss",
    "pj_failed": "Not built",
    "pj_busy": "Another build is running for this dashboard (for {minutes} min). Please wait a moment and try again.",
    "pj_error_network": "Connection lost. The build may still be running — the dashboard tells you when the page is there.",
    "pj_toast_started": "Building in the background, this takes two to four minutes. Keep working — the dashboard tells you when it is done.",
    "pj_toast_error_hint_flow": "You can try again under “Manage flows”.",
    "pj_toast_error_hint_public": "You can try again under “Manage pages”.",
    "load_error_title": "Error Loading",
    "retry": "Try Again",
    "data_load_failed": "Failed to load data",
    "wizard_back_to_dashboard": "Back to Dashboard",
    "v_required": "“{label}” is required",
    "v_email": "Please enter a valid email address for “{label}”.",
    "v_tel": "Please enter a valid phone number for “{label}”.",
    "v_url": "Please enter a valid web address for “{label}”.",
    "v_number": "Please enter a number for “{label}”.",
    "v_maxlength": "Please shorten “{label}” to at most {max} characters.",
    "v_option": "Please choose one of the offered values for “{label}”.",
    "v_range_order": "“{to}” must be after “{from}”",
    "v_range_blocked": "This period is not available — please choose other days",
    "v_min_nights_one": "Minimum stay: one night",
    "v_min_nights_other": "Minimum stay: {n} nights",
    "v_nights_one": "{n} night",
    "v_nights_other": "{n} nights",
    "v_days_one": "{n} day",
    "v_days_other": "{n} days",
    "v_min_days_one": "At least one day",
    "v_min_days_other": "At least {n} days",
    "v_yes": "Yes",
    "v_record_unnamed": "Selected entry",
    "v_records_unnamed_one": "{n} selected entry",
    "v_records_unnamed_other": "{n} selected entries",
    "v_no": "No",
    "v_ok": "Looks good",
    "es_title_one": "Please fix one entry",
    "es_title_other": "Please fix {n} entries",
    "ss_title": "Check your answers",
    "ss_change": "Change",
    "nf_title": "This page does not exist",
    "nf_message": "Nothing lives at “{path}” — the link is outdated or mistyped.",
    "nf_back": "Back to the dashboard",
    "ss_change_selection": "Change selection",
    "ss_missing": "Still missing:",
    "le_add": "Add",
    "le_edit": "Change",
    "le_remove": "Remove",
    "le_list": "{entity}: entries",
    "le_empty": "No entry yet. Fill in and press “Add”, or take the first one with “Next”.",
    "ss_confirm": "Confirm",
    "ss_submitting": "Saving …",
    "ss_error_title": "That did not work — your entries are still here.",
    "ss_retry": "Try again",
    "ss_offline_title": "No connection — your entries are saved.",
    "ss_offline_text": "We send them automatically as soon as the network is back. You can leave the page open.",
    "ss_limited_title": "Many people right now",
    "ss_limited_text": "Many people are sending right now — we will try again in a moment.",
    "ss_step_done": "created",
    "ss_step_done_updated": "updated",
    "ss_step_running_updated": "updating …",
    "ss_step_failed": "failed",
    "ss_step_running": "creating …",
    "ss_step_idle": "pending",
    "ss_partial": "{done} is saved. Trying again will not create duplicates.",
    "ss_step_of": "Step {n}",
    "sx_reference": "Reference",
    "sx_copy": "Copy",
    "sx_restart": "Once more",
    "wl_more": "Show {n} more",
    "wl_less": "Show less",
    "sx_undo": "Undo",
    "sx_undone": "Undone.",
    "sx_undo_failed": "Undo did not work — please try again.",
    "wz_needs": "This step first needs: {fields}.",
    "wz_needs_back": "Go to step {step}",
    "sx_copied": "Copied",
    "sx_print": "Print confirmation",
    "sx_next_title": "What happens next",
    "sx_default_title": "{entity} created",
    "sx_default_title_updated": "{entity} updated",
    "sx_saved": "Saved",
    "sn_back": "Back",
    "sn_next": "Continue",
    "sn_next_to": "Continue: {step}",
    "sn_to_summary": "Back to the summary",
    "sn_blocked": "Please complete this step first.",
    "wz_progress": "Step {n} of {total}",
    "wz_progress_label": "Step {n} of {total}: {label}",
    "wz_steps_nav": "Progress",
    "up_choose": "Choose file",
    "up_replace": "Other file",
    "up_remove": "Remove file",
    "up_reading": "Reading file …",
    "up_hint": "PDF, image, Word or Excel, at most {mb} MB.",
    "up_too_big": "The file is larger than {mb} MB.",
    "up_bad_type": "This file type is not accepted here — please PDF, image, Word or Excel.",
    "up_empty": "The file is empty.",
    "up_read_failed": "The file could not be read. Please choose it again.",
    "wz_step_done": "done",
    "wz_completed": "Completed",
    "wz_answers": "Your answers so far",
    "wz_draft_resumed": "Draft {when} resumed — your entries are still here.",
    "wz_draft_discard": "Discard",
    "wz_draft_just_now": "from a moment ago",
    "wz_draft_today": "from today",
    "wz_draft_yesterday": "from yesterday",
    "wz_draft_days_ago": "from {n} days ago",
    "wz_intro_start": "Get started",
    "wz_intro_steps": "How it works:",
    "wz_intro_needs": "What you need",
    "wz_intro_eyebrow": "How it works",
    "wz_intro_button": "How it works",
    "wz_intro_close": "Close",
    "wz_intro_steps_count_one": "one step",
    "wz_intro_steps_count_other": "{n} steps",
    "wz_intro_minutes": "about {n} min",
    "wz_intro_autosave": "Your entries are saved automatically as you go.",
    "wz_intro_once": "This introduction shows only the first time.",
    "pf_free": "free",
    "pf_occupied": "booked",
    "pf_pick_resource_first": "Pick “{resource}” first — the calendar then shows which nights are free there.",
    "step_create_new": "Create new",
    "sel_type_to_search": "Type to search …",
    "sel_min_chars": "Enter at least {n} characters",
    "sel_showing_of": "Showing {shown} of {total} – refine your search",
    "sel_search_failed": "Search failed. Please try again.",
    "sel_loading": "Loading entries …",
    "sel_selected_one": "{n} selected",
    "sel_selected_other": "{n} selected",
    "sel_no_hits": "No matches for “{q}”.",
    "sel_clear_search": "Clear search",
    "sel_empty_filtered": "No entry meets the requirement of this step.",
    "sel_empty_entity": "No entries under “{entity}” yet.",
    "sel_create_title": "New entry: {entity}",
    "sel_create_submit": "Create and select",
    "sel_create_failed": "Could not create the entry. Please try again.",
    "budget_none": "No budget defined",
    "budget_booked": "Booked",
    "budget_of": "of",
    "budget_remaining": "Remaining",
    "budget_over": "Over budget!",
    "budget_label": "Budget",
    "cap_label": "Capacity",
    "cap_none": "No capacity set",
    "cap_booked": "Taken",
    "cap_of": "of",
    "cap_remaining": "Free",
    "cap_over": "Over capacity",
    "cap_full": "Fully booked",
    "arp_pick_arrival": "Select arrival",
    "arp_pick_departure": "Select departure",
    "arp_nights_one": "{n} night selected",
    "arp_nights_other": "{n} nights selected",
    "arp_hint_blocked": "This period is already booked.",
    "arp_hint_min_nights": "Minimum stay: {n} nights",
    "arp_pick_start": "Select start",
    "arp_pick_end": "Select end",
    "arp_days_one": "{n} day selected",
    "arp_days_other": "{n} days selected",
    "arp_hint_min_days": "At least {n} days",
    "arp_legend_free": "Available",
    "arp_legend_blocked": "Booked",
    "arp_legend_selected": "Selected",
    "arp_prev_month": "Previous month",
    "arp_next_month": "Next month",
    "arp_clear": "Clear selection",
    "combo_search": "Search…",
    "combo_no_match": "No match",
    "combo_clear_selection": "Clear selection",
    "combo_clear_search": "Clear search",
    "combo_create_new": "Create new entry",
    "combo_create_named": "Create \"{name}\"",
    "combo_create_labeled": "Create {label}",
    "combo_create_prefill_hint": "Uses the search text as a pre-fill",
    "combo_create_inline_hint": "Enter it right in the dialog",
    "combo_add_more": "+ Add",
    "combo_remove_item": "Remove {label}",
    "date_hint_date": "mm/dd/yyyy",
    "date_hint_datetime": "mm/dd/yyyy, hh:mm",
    "date_pick_date": "Pick a date",
    "date_pick_datetime": "Pick date & time",
    "date_clear": "Clear date",
    "date_hours": "Hours",
    "date_minutes": "Minutes",
    "date_now": "Now",
    "date_today": "Today",
    "date_reset": "Reset",
    "address_search": "Search address…",
    "address_none": "No address found",
    "sat_empty": "No {title} yet.",
    "sat_add": "Add {title}",
    "sat_pick": "Choose existing",
    "pick_title": "Link {title}",
    "pick_description": "Choose an existing record and link it to this one.",
    "pick_placeholder": "Search…",
    "pick_empty": "All records are already linked.",
    "pick_confirm": "Link",
    "pick_linked": "linked",
    "intents_heading": "Flows",
    "intents_pending": "Being created …",
    "placeholder_page_desc": "Build your custom {entity} view here.",
    "placeholder_page_box": "Custom UI placeholder — build your {entity} view here",
    "tools_label": "Tools",
    "tools_subtitle_available": "available",
    "tools_empty_title": "No tools yet",
    "tools_empty_desc": "Describe in the chat what you want to automate — that becomes your first tool.",
    "tools_empty_cta": "Create in chat",
    "tools_file_singular": "file",
    "tools_file_plural": "files",
    "chatw_title": "Assistant",
    "chatw_placeholder": "Ask a question or upload an image...",
    "chatw_thinking": "Thinking...",
    "chatw_analyze_image": "Analyze image",
    "chatw_attach_file": "Attach file",
    "chatw_fullscreen": "Fullscreen",
    "chatw_exit_fullscreen": "Exit fullscreen",
    "ctx_error_text": "Execution failed",
    "ctx_action_label": "Action",
    "acd_test_version": "Test v{v}",
    "vc_loading_versions": "Loading versions...",
    "vc_no_previous_versions": "No previous versions",
    "vc_error_text": "An error occurred",
    "vc_label_initial": "Initial build",
    "vc_label_update": "Scaffold update",
    "vc_label_agent": "AI edit",
    "vc_label_main_branch": "Main line",
    "vc_label_alternate_direction": "Alternate direction",
    "vc_version_singular": "version",
    "vc_version_plural": "versions",
    "polish_greeting_morning": "Good morning!",
    "polish_greeting_day": "Good afternoon!",
    "polish_greeting_evening": "Good evening!",
    "polish_greeting_morning_named": "Good morning, {name}!",
    "polish_greeting_day_named": "Good afternoon, {name}!",
    "polish_greeting_evening_named": "Good evening, {name}!",
    "polish_undo": "Undo",
    "attachments_upload_failed": "File could not be uploaded.",
    "scan_error": "Scan failed",
    "scan_header_sub": "Understands photos, documents, and text and fills everything out for you",
    "scan_analyzing": "AI analyzing...",
    "scan_analyzing_sub": "Fields will be filled automatically",
    "scan_success": "Fields filled!",
    "scan_success_sub": "Review the values and adjust if needed",
    "scan_upload": "Drop your photo or document here or browse",
    "scan_camera_btn": "Camera",
    "scan_file_btn": "Choose photo",
    "scan_doc_btn": "Document",
    "useinfo_label": "AI assistant may use my personal information",
    "useinfo_more": "more info",
    "useinfo_loading": "Loading...",
    "useinfo_error": "Could not load profile",
    "profile_preamble": "The following info about you can be used by the AI:",
    "scan_text_placeholder": "Type or paste text, e.g. notes, emails, descriptions...",
    "scan_text_analyze": "Analyze",
    "smart_fill": "AI fill",
    "missing_required": "Please fill out the marked required fields.",
    "paste": "Paste",
    "bulk_edit_title": "Edit field for selected records",
    "details": "Details",
    "relations": "Linked",
    "not_found": "Record not found",
    "required_hint": "Required"
  }
};

// Structure labels (app names, field labels, lookup option labels):
type AppLabels = {
  name: string;
  app_id?: string;
  fields: Record<string, string>;
  lookups: Record<string, Record<string, string>>;
};
type LabelBundle = { appgroup: string; apps: Record<string, AppLabels> };
export const LABELS: Record<CoreLocale, LabelBundle> = {
  "de": {
    "appgroup": "Terminabstimmung",
    "apps": {
      "umfragen": {
        "name": "Umfragen",
        "app_id": "6af6e7330a01dca53569f87d",
        "fields": {
          "finaler_termin": "Finaler Termin",
          "titel": "Titel",
          "beschreibung": "Beschreibung",
          "ort": "Ort",
          "status": "Status"
        },
        "lookups": {
          "status": {
            "offen": "Offen",
            "geschlossen": "Geschlossen"
          }
        }
      },
      "terminvorschlaege": {
        "name": "Terminvorschläge",
        "app_id": "6af6e7378effe68c72d780b5",
        "fields": {
          "beginn": "Beginn",
          "ende": "Ende",
          "umfrage": "Umfrage"
        },
        "lookups": {}
      },
      "antworten": {
        "name": "Antworten",
        "app_id": "6af6e73abcf0cc701ca9a859",
        "fields": {
          "umfrage": "Umfrage",
          "terminvorschlag": "Terminvorschlag",
          "teilnehmer_vorname": "Vorname",
          "teilnehmer_nachname": "Nachname",
          "antwort": "Antwort"
        },
        "lookups": {
          "antwort": {
            "ja": "Ja",
            "vielleicht": "Vielleicht",
            "nein": "Nein"
          }
        }
      }
    }
  },
  "en": {
    "appgroup": "Appointment Scheduling",
    "apps": {
      "umfragen": {
        "name": "Polls",
        "app_id": "6af6e7330a01dca53569f87d",
        "fields": {
          "finaler_termin": "Final Date",
          "titel": "Title",
          "beschreibung": "Description",
          "ort": "Location",
          "status": "Status"
        },
        "lookups": {
          "status": {
            "offen": "Open",
            "geschlossen": "Closed"
          }
        }
      },
      "terminvorschlaege": {
        "name": "Proposed Dates",
        "app_id": "6af6e7378effe68c72d780b5",
        "fields": {
          "beginn": "Start",
          "ende": "End",
          "umfrage": "Poll"
        },
        "lookups": {}
      },
      "antworten": {
        "name": "Responses",
        "app_id": "6af6e73abcf0cc701ca9a859",
        "fields": {
          "umfrage": "Poll",
          "terminvorschlag": "Proposed Date",
          "teilnehmer_vorname": "First Name",
          "teilnehmer_nachname": "Last Name",
          "antwort": "Response"
        },
        "lookups": {
          "antwort": {
            "ja": "Yes",
            "vielleicht": "Maybe",
            "nein": "No"
          }
        }
      }
    }
  }
};

// ── Overlay locales (added post-deploy, no rebuild) ────────────────
// Contract: locales/{lang}.json next to the bundle —
//   { "v": 1, "lang": "ru", "ui": {catalogKey: text},
//     "labels": {appgroup, apps:{key:{name,app_id,fields,lookups}}},
//     "pages": {enSourceText: translatedText} }
// Sections are optional; unknown fields are ignored (tolerant consumer).
type Overlay = {
  v?: number;
  ui?: Record<string, string>;
  labels?: Partial<LabelBundle>;
  pages?: Record<string, string>;
};
const overlays: Record<string, Overlay | null | undefined> = {};

function isCore(l: string): l is CoreLocale {
  return (CORE_LOCALES as string[]).includes(l);
}

async function ensureOverlay(lang: string): Promise<Overlay | null> {
  if (overlays[lang] !== undefined) return overlays[lang] ?? null;
  try {
    const r = await fetch(`./locales/${encodeURIComponent(lang)}.json`, { cache: 'no-cache' });
    overlays[lang] = r.ok ? ((await r.json()) as Overlay) : null;
  } catch {
    overlays[lang] = null;
  }
  return overlays[lang] ?? null;
}

function overlayFor(l: string): Overlay | null {
  return overlays[l] ?? null;
}

// ── Page-text catalog (runtime artifact) ───────────────────────────
// tx source texts resolve through locales/pages.json next to the bundle —
// written by the pipeline, updated WITHOUT a rebuild (a translation change
// never touches the bundle; only code changes do). Absent file = the texts
// render in the build language (fail-open). Fetched once, on demand: only a
// non-build locale ever needs it.
type PagesCatalog = Record<string, Record<string, string>>;
let pagesCatalog: PagesCatalog | null = null;
let pagesRequested = false;
function ensurePages(): void {
  if (pagesRequested) return;
  pagesRequested = true;
  void (async () => {
    try {
      const r = await fetch('./locales/pages.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const data = (await r.json()) as { pages?: PagesCatalog };
      if (data && typeof data.pages === 'object' && data.pages) {
        pagesCatalog = data.pages;
        listeners.forEach((fn) => fn());
      }
    } catch { /* offline/absent — texts render in the build language */ }
  })();
}

// ── Locale state ───────────────────────────────────────────────────
function normalizeLang(raw: string | null | undefined): string | null {
  const lang = (raw ?? '').split(/[-_]/)[0].toLowerCase();
  return /^[a-z]{2,3}$/.test(lang) ? lang : null;
}

function readStored(): string | null {
  try {
    return normalizeLang(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function htmlLang(): string | null {
  return normalizeLang(document.documentElement.getAttribute('lang'));
}

// The PLATFORM header owns the language switcher for the core languages. Its
// contract is <html lang> (the la-widget library resolves and observes the
// same attribute): adopt it at load when present, keep it in sync otherwise.
// A lang the served shell carries for the build language is no platform choice
// (data-lang-source="build", S-14) — read past it once; from here on every
// change of <html lang> that is not our own comes from the platform header.
const shellLang = document.documentElement.getAttribute('data-lang-source') === 'build';
document.documentElement.removeAttribute('data-lang-source');
export let locale: Locale = (shellLang ? null : htmlLang()) ?? readStored() ?? BUILD_LOCALE;
// Baked chrome (widget dictionaries) exists only in the core languages —
// non-core locales read their chrome via the overlay/en fallback chains.
export let coreLocale: CoreLocale = isCore(locale) ? locale : 'en';
document.documentElement.lang = locale;
if (!isCore(locale)) {
  // Overlay locale from a previous session: load it, then re-render; if it
  // is gone, fall back to the build locale and clean the stale cache.
  void ensureOverlay(locale).then((ov) => {
    if (ov) listeners.forEach((fn) => fn());
    else if (!isCore(locale)) {
      try { localStorage.setItem(STORAGE_KEY, BUILD_LOCALE); } catch { /* private mode */ }
      applyLocale(BUILD_LOCALE);
    }
  });
}

const listeners = new Set<() => void>();

// Boot in a non-build locale (stored choice, profile): the page catalog is
// needed right away — the fetch re-renders via the listeners when it lands.
if (locale !== BUILD_LOCALE) ensurePages();

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function applyLocale(next: Locale) {
  if (next === locale) return;
  locale = next;
  coreLocale = isCore(next) ? next : 'en';
  if (next !== BUILD_LOCALE) ensurePages();
  document.documentElement.lang = next;
  listeners.forEach((fn) => fn());
}

// Accept a locale request: core applies immediately, overlay locales apply
// once their file is confirmed to exist (an unknown language is ignored —
// it "exists" only after the service uploaded its overlay).
async function requestLocale(next: string): Promise<boolean> {
  if (isCore(next)) {
    applyLocale(next);
    return true;
  }
  const ov = await ensureOverlay(next);
  if (!ov) return false;
  applyLocale(next);
  return true;
}

export function setLocale(next: Locale) {
  void (async () => {
    if (!(await requestLocale(next))) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
    void persistProfileLanguage(next);
  })();
}

// Follow platform-initiated switches LIVE — same MutationObserver contract
// the la-widgets use. applyLocale is a no-op for our own writes (same value).
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => {
    const next = htmlLang();
    if (next && next !== locale) {
      void (async () => {
        if (await requestLocale(next)) {
          try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
        }
      })();
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

// The /user response fetched below also carries the profile's first name —
// captured for the personalized greeting (gruss() in @/lib/polish). Stays
// null for anonymous/offline visitors and on public routes (which never call
// syncProfileLocale), so consumers must always have a nameless fallback.
let firstname: string | null = null;
const firstnameListeners = new Set<() => void>();
export function profileFirstname(): string | null {
  return firstname;
}
export function onProfileFirstname(fn: () => void): () => void {
  firstnameListeners.add(fn);
  return () => firstnameListeners.delete(fn);
}

// The LA profile is the language's source of truth AT REST: adopt it once
// per page load (LocaleGate calls this on mount). It must NOT re-run on the
// remount a language switch causes — that reverted every header-switcher
// change back to the profile within a second (live-proven). Persisting a
// switch into the profile is the switcher's job.
let profileSyncDone = false;
export async function syncProfileLocale(): Promise<void> {
  if (profileSyncDone) return;
  profileSyncDone = true;
  const before = locale;
  try {
    const r = await restFetch(`${LA_API_URL}/user`, { credentials: 'include' });
    if (!r.ok) return;
    const raw = (await r.json()) as { lang?: unknown; firstname?: unknown };
    if (typeof raw?.firstname === 'string' && raw.firstname.trim()) {
      firstname = raw.firstname.trim();
      firstnameListeners.forEach((fn) => fn());
    }
    const lang = normalizeLang(typeof raw?.lang === 'string' ? raw.lang : null);
    if (!lang) return;
    // A switch that happened while we fetched wins over the profile.
    if (locale !== before) return;
    if (await requestLocale(lang)) {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* private mode */ }
    }
  } catch { /* offline/anonymous — keep the current locale */ }
}

// Write-back of the switcher choice into the LA profile. PATCH is partial
// by definition — unlike a PUT it cannot full-replace the profile, and an
// unsupported endpoint answers 405 without side effects. Fire-and-forget:
// the local switch already happened; localStorage carries it meanwhile.
async function persistProfileLanguage(next: Locale): Promise<void> {
  try {
    await restFetch(`${LA_API_URL}/user`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: next }),
    });
  } catch { /* offline — the choice still lives in localStorage */ }
}

// Public pages follow the visitor's browser language (no profile, no
// persistence — a public visitor must not pin the operator's dashboard
// locale). Call once when mounting a public route.
export function initPublicLocale() {
  const nav = normalizeLang(typeof navigator !== 'undefined' ? navigator.language : null);
  if (nav && isCore(nav)) {
    locale = nav;
    coreLocale = nav;
  } else {
    locale = BUILD_LOCALE;
    coreLocale = BUILD_LOCALE;
  }
  if (locale !== BUILD_LOCALE) ensurePages();
  document.documentElement.lang = locale;
}

// ── Text lookup ────────────────────────────────────────────────────
// Accepts optional values because makeT does — `String(undefined)` renders
// exactly what `${undefined}` in a template literal rendered, so the
// mechanical rewrite stays faithful.
function interpolate(text: string, params?: Record<string, string | number | null | undefined>): string {
  if (!params) return text;
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

function uiText(key: string): string | undefined {
  if (isCore(locale)) return UI_CATALOG[locale][key];
  return overlayFor(locale)?.ui?.[key] ?? UI_CATALOG.en[key];
}

export function t(key: string, params?: Record<string, string | number>): string {
  return interpolate(uiText(key) ?? UI_CATALOG.en[key] ?? key, params);
}

// Plural-aware chrome text: define key_one/key_few/key_many/key_other in the
// catalog (subset ok; key_other is the required base form). `n` is always
// available as {n} in the text.
export function tp(key: string, n: number, params?: Record<string, string | number>): string {
  let category = 'other';
  try {
    category = new Intl.PluralRules(localeTag()).select(n);
  } catch { /* very old runtime — 'other' */ }
  const text = uiText(`${key}_${category}`) ?? uiText(`${key}_other`) ?? uiText(key) ?? key;
  return interpolate(text, { n, ...(params ?? {}) });
}

// ── Page text: tx (the contract for agent-written pages) ───────────
// The SOURCE TEXT is the key. The build language resolves to itself; the
// other core language reads locales/pages.json (runtime catalog, see above);
// overlay locales read locales/{lang}.json. Missing entries fall back to the
// source text — a failed translation degrades, never breaks.
function resolvePage(key: string): string {
  if (locale === BUILD_LOCALE) return key;
  if (isCore(locale)) return pagesCatalog?.[locale]?.[key] ?? key;
  return (
    overlayFor(locale)?.pages?.[key] ??
    pagesCatalog?.[BUILD_LOCALE === 'en' ? 'de' : 'en']?.[key] ??
    key
  );
}

// String form: tx('Auslastung') or tx('Hallo {name}', { name }).
// Tagged form:  tx`${n} Tiere im System` — the STATIC parts form the key
// ('{0} Tiere im System'), the expressions stay values, so a translation can
// reorder them. Params accept null/undefined on purpose: a record field is
// `string | undefined`, and `String(undefined)` renders exactly what the
// template literal it replaces rendered.
export function tx(text: string, params?: Record<string, string | number | null | undefined>): string;
export function tx(text: TemplateStringsArray, ...values: Array<string | number | null | undefined>): string;
export function tx(text: string | TemplateStringsArray, ...values: unknown[]): string {
  if (typeof text === 'string') {
    return interpolate(
      resolvePage(text),
      values[0] as Record<string, string | number | null | undefined> | undefined,
    );
  }
  let key = text[0];
  for (let i = 1; i < text.length; i++) key += `{${i - 1}}` + text[i];
  return resolvePage(key).replace(/\{(\d+)\}/g, (m, i) =>
    Number(i) < values.length ? String(values[Number(i)]) : m,
  );
}

// LEGACY page-local tables ({de,en} defined in the page, rendered via
// tt('key')). Older dashboards carry these; new pages use tx above.
// Overlay locales resolve via the en source text — no code change needed
// when a language is added post-deploy.
export function makeT<K extends string>(
  table: Record<CoreLocale, Record<K, string>> & Partial<Record<string, Record<K, string>>>
) {
  // Optional params are accepted on purpose: the mechanical migration turns
  // `${r.fields.gast_vorname}` into `p0: r.fields.gast_vorname`, and a record
  // field is `string | undefined`. A template literal took that happily, so
  // rejecting it here made a faithful rewrite fail tsc (live: TS2322 in a
  // Restaurant dashboard). interpolate() renders exactly what the template
  // literal did.
  return (key: K, params?: Record<string, string | number | null | undefined>): string => {
    let text: string | undefined = table[locale]?.[key];
    if (text === undefined && !isCore(locale)) {
      const source = table.en?.[key];
      text = source !== undefined ? overlayFor(locale)?.pages?.[source] ?? source : undefined;
    }
    text = text ?? table[BUILD_LOCALE]?.[key] ?? table.en?.[key] ?? key;
    return interpolate(text, params);
  };
}

// ── Structure labels ───────────────────────────────────────────────
function bundle(): Partial<LabelBundle> {
  if (isCore(locale)) return LABELS[locale];
  return overlayFor(locale)?.labels ?? LABELS[BUILD_LOCALE];
}

export function appgroupLabel(): string {
  return bundle().appgroup || LABELS[BUILD_LOCALE].appgroup;
}

export function appLabel(app: string): string {
  return bundle().apps?.[app]?.name ?? LABELS[BUILD_LOCALE].apps[app]?.name ?? app;
}

export function fieldLabel(app: string, field: string): string {
  return (
    bundle().apps?.[app]?.fields?.[field] ??
    LABELS[BUILD_LOCALE].apps[app]?.fields?.[field] ??
    field
  );
}

// All field labels of one app in the active locale (fallback per field).
export function fieldLabels(app: string): Record<string, string> {
  return {
    ...LABELS[BUILD_LOCALE].apps[app]?.fields,
    ...bundle().apps?.[app]?.fields,
  };
}

// Display label for a lookup option key; null when the key is unknown so
// callers can fall back to the enriched record label (build language).
export function lookupLabel(app: string, field: string, key: string | null | undefined): string | null {
  if (key == null) return null;
  return (
    bundle().apps?.[app]?.lookups?.[field]?.[key] ??
    LABELS[BUILD_LOCALE].apps[app]?.lookups?.[field]?.[key] ??
    null
  );
}

// Public pages know their target app only by app_id (their runtime config
// carries no app key) — resolve via the id → key map and fall back to the
// config's stored label when the id is unknown (pages of apps that predate
// the bundle, or foreign apps).
const APP_KEY_BY_ID: Record<string, string> = {};
for (const [appKey, entry] of Object.entries(LABELS[BUILD_LOCALE].apps)) {
  if (entry.app_id) APP_KEY_BY_ID[entry.app_id] = appKey;
}

export function fieldLabelByAppId(appId: string | null | undefined, field: string): string | null {
  const appKey = appId ? APP_KEY_BY_ID[appId] : undefined;
  if (!appKey) return null;
  return (
    bundle().apps?.[appKey]?.fields?.[field] ??
    LABELS[BUILD_LOCALE].apps[appKey]?.fields?.[field] ??
    null
  );
}

export function lookupLabelByAppId(appId: string | null | undefined, field: string, key: string | null | undefined): string | null {
  const appKey = appId ? APP_KEY_BY_ID[appId] : undefined;
  return appKey ? lookupLabel(appKey, field, key) : null;
}

// ── Locale-dependent formatting ────────────────────────────────────
export function localeName(l: Locale): string {
  if (LOCALE_NAMES[l]) return LOCALE_NAMES[l];
  try {
    return new Intl.DisplayNames([l], { type: 'language' }).of(l) ?? l;
  } catch {
    return l;
  }
}

export function localeTag(): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-US';
  return locale; // bare BCP-47 language code — Intl accepts it
}

// date-fns needs an explicit locale object for non-English month/weekday
// names. Overlay locales fall back to the en default (honest degradation —
// the date-fns locale data is not shippable via JSON overlay).
export function dateFnsLocale(): DateFnsLocale | undefined {
  return locale === 'de' ? dfDe : undefined;
}

export function dateFormat(): string {
  return t('date_format');
}

export function dateTimeFormat(): string {
  return t('datetime_format');
}

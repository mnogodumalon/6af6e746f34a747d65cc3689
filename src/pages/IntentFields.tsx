import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FieldPolicyEditor } from '@/components/FieldPolicyEditor';
import { getIntentPolicy, updateIntentPolicy, type IntentPolicyCatalog } from '@/lib/intentsAdmin';
import type { PagePolicy, PolicyCatalog } from '@/lib/publicPagesAdmin';
import { loadIntentPolicies } from '@/lib/journey/intentPolicy';
import { INTENTS, type IntentLink } from '@/config/intents';
import { PLAN_SENTENCES } from '@/config/plan';
import { t, locale } from '@/i18n';

// "Felder anpassen" for ONE flow (Ablauf) — route verwaltung/ablaeufe/:slug/felder.
// Same editor as the public pages; the catalog comes from the flow's deployed
// source (what it binds through the journey layer) and the rules are kept by
// the layer in the app: there is no grant for a flow, so the note says who
// they apply to — the team using the flow, not Werkzeuge or Datenverwaltung.
function labelOf(intent: IntentLink): string {
  return typeof intent.label === 'string'
    ? intent.label
    : (intent.label as Record<string, string | undefined>)[locale] ?? intent.label.de ?? intent.label.en ?? intent.label.cs ?? '';
}

export default function IntentFields() {
  const { slug = '' } = useParams<{ slug: string }>();
  const intent = INTENTS.find(i => i.path.replace(/\/+$/, '').split('/').pop() === slug) ?? null;
  const [legacy, setLegacy] = useState(false);
  const planSentences = PLAN_SENTENCES[slug] ?? [];

  const load = useCallback(() => getIntentPolicy(slug), [slug]);
  const save = useCallback(async (policy: PagePolicy) => {
    const cat = await updateIntentPolicy(slug, policy);
    // The loader caches intent-policies.json per page load — a saved rule
    // must reach the next flow visit without a reload.
    await loadIntentPolicies(true);
    return cat;
  }, [slug]);
  const onLoaded = useCallback((cat: PolicyCatalog) => setLegacy(Boolean((cat as IntentPolicyCatalog).legacy)), []);

  return (
    <FieldPolicyEditor
      load={load}
      save={save}
      onLoaded={onLoaded}
      heading={intent ? labelOf(intent) : slug}
      intro={t('ia_fields_intro')}
      note={t('ia_fields_note')}
      backTo="/verwaltung/ablaeufe"
      backLabel={t('ia_back_to_flows')}
      view={intent ? { to: intent.path, label: t('ia_view_flow') } : undefined}
      emptyText={legacy ? t('ia_fields_legacy') : undefined}
      above={planSentences.length ? (
        <section className="rounded-[27px] bg-card shadow-lg px-6 py-5" data-plan-card>
          <h2 className="text-base font-semibold">{t('ia_plan_title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('ia_plan_hint')}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {planSentences.map(s => <li key={s}>{s}</li>)}
          </ul>
        </section>
      ) : undefined}
      savedText={t('ia_policy_saved')}
      who={t('ppa_who_team')}
    />
  );
}

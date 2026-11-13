/**
 * Umfrage abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Umfrage wählen → 2) Finalen Termin aus den Vorschlägen wählen → 3) Prüfen & schließen.
 * Reads: umfragen, terminvorschlaege. Writes: umfragen (finaler_termin, status=geschlossen) — updates the picked record.
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldLookup } from '@/lib/journey';
import { useUmfrageAbschliessenFlow } from '@/lib/journey/flows/UmfrageAbschliessen';
import { dateFnsLocale, tx } from '@/i18n';

export default function UmfrageAbschliessenPage() {
  const [step, setStep] = useState(1);

  const flow = useUmfrageAbschliessenFlow({
    steps: { umfragen: 1, finaler_termin: 2 },
    items: {
      umfragen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldText(r, 'ort') || undefined,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
      finaler_termin: r => {
        const von = fieldDate(r, 'beginn');
        const bis = fieldDate(r, 'ende');
        const loc = dateFnsLocale();
        const fmt = (iso: string | null) => (iso ? format(parseISO(iso), 'PPP · HH:mm', { locale: loc }) : '—');
        return { id: r.id, title: fmt(von), subtitle: tx`bis ${fmt(bis)}` };
      },
    },
  });

  const umfrageId = flow.pick('umfragen').selectedId ?? null;

  return (
    <IntentWizardShell
      title={tx('Umfrage abschließen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{
        description: tx('Wähle den finalen Termin aus den Vorschlägen und schließe die Umfrage.'),
        needs: [tx('Eine offene Umfrage mit Terminvorschlägen')],
      }}
    >
      <WizardStep label={tx('Umfrage')} description={tx('Welche offene Umfrage möchtest du abschließen?')}>
        <EntitySelectStep
          {...flow.picks.umfragen.select}
          {...flow.pick('umfragen')}
          searchPlaceholder={tx('Titel oder Ort …')}
          emptyText={tx('Es gibt keine offene Umfrage.')}
        />
      </WizardStep>

      <WizardStep label={tx('Finaler Termin')} description={tx('Welcher Terminvorschlag soll gelten?')}>
        {umfrageId ? (
          <>
            <div className="rounded-lg border bg-muted/40 p-3 mb-3 text-sm">
              <span className="text-muted-foreground">{tx('Umfrage')}: </span>
              <span className="font-medium">{flow.picks.umfragen.labelOf(umfrageId) ?? umfrageId}</span>
            </div>
            <EntitySelectStep
              {...flow.picks.finaler_termin.select}
              {...flow.pick('finaler_termin')}
              avatar="none"
              emptyText={tx('Zu dieser Umfrage gibt es noch keine Terminvorschläge.')}
            />
            <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Prüfen')} />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Status'), value: tx('Geschlossen') }]}
            whatHappensNext={tx('Die Umfrage wird geschlossen und der gewählte Termin als finaler Termin gespeichert.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          next={[
            { label: tx('Weitere Umfrage abschließen'), onClick: () => { flow.reset(); setStep(1); } },
            { label: tx('Umfrage mit Terminen anlegen'), href: '#/intents/umfrage-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}

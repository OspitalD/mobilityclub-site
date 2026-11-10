import { OnboardingWizard, type WizardAnswers, type WizardStep } from '../components/10k/web-onboarding-wizard/OnboardingWizard.tsx';
import { T } from '../textes.ts';

const A = T.dossier.assistant;

// Les libellés français passent par les props du composant, jamais en le modifiant. Quatre étapes seulement :
// l'assistant ne sait faire ni listes (couleurs, inspirations) ni zone de texte (écran du matin), qui restent
// dans la fiche.
export const ETAPES: WizardStep[] = [
  {
    id: 'app', kind: 'fields', section: A.app, title: A.appTitre, subtitle: A.appSous,
    fields: [
      { key: 'nom', label: A.nom, required: false, autoComplete: 'off' },
      { key: 'lien', label: A.lien, required: false, autoComplete: 'off' },
    ],
  },
  {
    id: 'type', kind: 'choice', section: A.quoi, title: A.quoiTitre, answerKey: 'type', autoAdvance: true,
    options: [
      { id: 'app', label: T.dossier.types.app },
      { id: 'plateforme', label: T.dossier.types.plateforme },
      { id: 'aucune', label: T.dossier.types.aucune },
    ],
  },
  {
    id: 'pour', kind: 'fields', section: A.pour, title: A.pourTitre,
    fields: [{ key: 'pour_qui', label: A.pourChamp, placeholder: A.pourEx, required: false }],
  },
  {
    id: 'voix', kind: 'fields', section: A.voix, title: A.voixTitre, subtitle: A.voixSous,
    fields: [1, 2, 3].map((n) => ({ key: `voix_${n}`, label: A.mot(n), placeholder: A.motEx[n - 1], required: false })),
  },
];

interface Props {
  reponses: WizardAnswers;
  onChange: (r: WizardAnswers) => void;
  onComplete: () => void;
  onClose: () => void;
}

export function Assistant({ reponses, onChange, onComplete, onClose }: Props) {
  return (
    <OnboardingWizard
      steps={ETAPES}
      initialAnswers={reponses}
      onChange={onChange}
      onComplete={onComplete}
      onClose={onClose}
      labels={{ back: A.back, close: A.close, continue: A.continue, finish: A.finish, incomplete: A.incomplete, step: A.step }}
    />
  );
}

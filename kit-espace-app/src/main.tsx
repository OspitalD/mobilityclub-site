import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/jetons.css';
import './styles/base.css';
import { App } from './App.tsx';
// Après App : les CSS des composants 10K sont tirés par App, et nos adaptations doivent passer APRÈS.
import './styles/adaptations-10k.css';
import './styles/ecrans.css';
import { brancherReseau } from './useReseau.ts';

brancherReseau();
createRoot(document.getElementById('racine') as HTMLElement).render(<StrictMode><App /></StrictMode>);

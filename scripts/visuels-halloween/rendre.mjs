// Rend les visuels d'annonce Halloween en JPEG exacts (Chromium, DPR 1, polices attendues, animations figées).
// Usage : npm run visuels:halloween   (sert le dépôt sur :8766 le temps du rendu)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8766;

async function chargerPlaywright() {
  try { return await import('playwright'); } catch {}
  const repli = process.env.PLAYWRIGHT_PATH || join(homedir(), 'Projects/mobility-dashboard/node_modules/playwright/index.mjs');
  return import(pathToFileURL(repli).href);
}

const visuels = [
  ['story-1', 1080, 1920, 'assets/halloween/stories/story-1.jpg'],
  ['story-2', 1080, 1920, 'assets/halloween/stories/story-2.jpg'],
  ['story-3', 1080, 1920, 'assets/halloween/stories/story-3.jpg'],
  ['story-4', 1080, 1920, 'assets/halloween/stories/story-4.jpg'],
  ['email-1', 1200, 800, 'assets/halloween/email/email-1.jpg'],
  ['email-2', 1200, 600, 'assets/halloween/email/email-2.jpg'],
  ['og', 1200, 630, 'assets/halloween/og.jpg'],
];

const serveur = spawn('npx', ['-y', 'http-server', '-p', String(PORT), '-s', '.'], { cwd: racine, stdio: 'ignore' });
try {
  const { chromium } = await chargerPlaywright();
  await new Promise((r) => setTimeout(r, 3000));
  const browser = await chromium.launch();
  const filtre = process.argv[2];
  for (const [nom, w, h, sortie] of visuels) {
    if (filtre && filtre !== nom) continue;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/scripts/visuels-halloween/${nom}.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.waitForTimeout(400);
    mkdirSync(dirname(join(racine, sortie)), { recursive: true });
    await page.screenshot({ path: join(racine, sortie), type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log('ok', sortie);
  }
  await browser.close();
  if (!filtre || filtre === 'story-1') copyFileSync(join(racine, 'assets/halloween/stories/story-1.jpg'), join(racine, 'assets/halloween/story.jpg'));
} finally {
  serveur.kill();
}

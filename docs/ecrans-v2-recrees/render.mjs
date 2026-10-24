import { chromium } from '/Users/damienospital/Projects/mobility-dashboard/node_modules/playwright/index.mjs';
const dir = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:393,height:852}, deviceScaleFactor:3 });
for (const s of ['send','coach','bilan']) {
  await p.goto('file://'+dir+'/index.html?s='+s); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
  await p.screenshot({ path: dir+'/'+s+'.png' });
}
await b.close(); console.log('ok');

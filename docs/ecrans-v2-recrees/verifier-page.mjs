import { chromium } from '/Users/damienospital/Projects/mobility-dashboard/node_modules/playwright/index.mjs';
const [,, out, w, h, lang] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:+w,height:+h}, deviceScaleFactor:1 });
const errs=[]; p.on('pageerror', e=>errs.push(e.message)); p.on('console', m=>{ if(m.type()==='error' && !/404/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:8811/?t='+Date.now(), { waitUntil:'networkidle' });
if (lang==='en') await p.evaluate(()=>setLang('en'));
const H = await p.evaluate(()=>document.documentElement.scrollHeight);
for (let y=0; y<H; y+=300) { await p.mouse.wheel(0,300); await p.waitForTimeout(90); }
await p.waitForTimeout(1500);
const r = await p.evaluate(()=>{ const all=[...document.querySelectorAll('.reveal,.reveal-lines,.reveal-clip')];
  return { total:all.length, hidden:all.filter(e=>!e.classList.contains('in')).map(e=>(e.closest('section')?.getAttribute('aria-label')||'?')+' > '+e.className.slice(0,30)),
    broken:[...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&!i.closest('.shot-ph')).map(i=>i.getAttribute('src')),
    sw:document.documentElement.scrollWidth };});
// force reveals (transitions) then capture sections
await p.addStyleTag({content:'.reveal,.reveal-lines,.reveal-clip,.ln-i{opacity:1!important;transform:none!important;clip-path:none!important;transition:none!important}'});
await p.evaluate(()=>{ window.lenis?.scrollTo ? lenis.scrollTo(0,{immediate:true}) : scrollTo(0,0); });
await p.screenshot({ path: out, fullPage:true });
console.log(JSON.stringify({errs, ...r}));
await b.close();

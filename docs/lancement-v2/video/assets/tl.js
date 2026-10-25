/* Chronologie partagée 16:9 / 9:16 — mêmes ids, mises en page propres à chaque fichier. */
window.MC_BUILD=function(){
  var vars = (window.__hyperframes && window.__hyperframes.getVariables) ? window.__hyperframes.getVariables() : {};
  var phase = vars.phase === "v2" ? "v2" : "fenetre";
  document.querySelectorAll(".only-fenetre").forEach(function(e){ e.style.display = phase==="fenetre" ? "" : "none"; });
  document.querySelectorAll(".only-v2").forEach(function(e){ e.style.display = phase==="v2" ? "block" : "none"; });

  var L = window.MC_LAYOUT; // {halo:{g:[x,y],v:[x,y],o:[x,y],size}}
  var tl = gsap.timeline({ paused:true });
  var E = "power3.out", I = "power2.in";
  function lines(sel, at, step){ tl.fromTo(sel,{y:46,opacity:0,filter:"blur(10px)"},{y:0,opacity:1,filter:"blur(0px)",duration:.55,ease:E,stagger:step||.28},at); }
  function out(sel, at, d){ tl.to(sel,{opacity:0,y:-24,duration:d||.35,ease:I},at); }
  function stageIn(sel, at){ tl.fromTo(sel,{y:70,scale:.965,opacity:0},{y:0,scale:1,opacity:1,duration:.75,ease:E},at); }

  // Halos : état initial = état final (boucle propre)
  var H = ["g","v","o"];
  H.forEach(function(k){
    gsap.set("#halo-"+k,{width:L.size,height:L.size,x:L.halo[k][0]-L.size/2,y:L.halo[k][1]-L.size/2,opacity:0});
  });
  function halo(k,o,at,d){ tl.to("#halo-"+k,{opacity:o,duration:d||1,ease:"sine.inOut"},at); }
  function drift(k,dx,dy,at,d){ tl.to("#halo-"+k,{x:"+="+dx,y:"+="+dy,duration:d,ease:"sine.inOut"},at); }
  // 0–3 problème : or discret
  halo("o",.28,0,1.2); halo("g",.10,0,1.2);
  // fait a : vert
  halo("g",.42,2.8,1); halo("o",.0,2.8,1);
  // fait b : violet
  halo("v",.42,7,1); halo("g",.12,7,1);
  // fait c : violet + vert
  halo("v",.46,10.4,1); halo("g",.22,10.4,1);
  // preuve : vert
  halo("g",.46,13.8,1); halo("v",.10,13.8,1);
  // fin
  halo("g",.40,16.8,1); halo("o",.20,16.8,1); halo("v",.12,16.8,1);
  // retour à l'état initial (opacité 0, position d'origine) pour boucler
  H.forEach(function(k){ tl.to("#halo-"+k,{opacity:0,duration:.5,ease:"sine.inOut"},19.5); });
  drift("g",L.drift,L.drift*.5,0,10); drift("g",-L.drift,-L.drift*.5,10,10);
  drift("v",-L.drift,L.drift*.4,0,10); drift("v",L.drift,-L.drift*.4,10,10);
  drift("o",L.drift*.6,-L.drift*.3,0,10); drift("o",-L.drift*.6,L.drift*.3,10,10);

  // 0–3 problème
  lines("#p1",.15); lines("#p2",1.15);
  out("#s0 .ln",2.7,.3);

  // 3–7.5 fait a
  lines("#a1",3.15);
  tl.fromTo("#photo",{y:70,scale:.965,opacity:0},{y:0,scale:1,opacity:1,duration:.7,ease:E},3.2);
  var t0=3.5, st=.46;
  [1,2,3,4,5].forEach(function(n,i){
    var at=t0+i*st;
    tl.set("#ph"+n,{opacity:1},at);
    if(n>1) tl.set("#ph"+(n-1),{opacity:0},at);
    tl.to("#tk"+n,{width:"100%",duration:st*.95,ease:"none"},at);
  });
  tl.to("#photo",{opacity:0,scale:.97,y:-20,duration:.4,ease:I},5.95);
  lines("#a2",5.6);
  stageIn("#phone-bilan",5.95);
  out("#s1 .ln",7.05); tl.to("#phone-bilan",{opacity:0,y:-30,duration:.35,ease:I},7.1);

  // 7.2–10.7 fait b
  lines("#b1",7.35);
  stageIn("#phone-coach",7.4);
  out("#s2 .ln",10.3); tl.to("#phone-coach",{opacity:0,y:-30,duration:.35,ease:I},10.3);

  // 10.6–14.1 fait c
  lines("#c1",10.75);
  stageIn("#phone-voice",10.8);
  out("#s3 .ln",13.7); tl.to("#phone-voice",{opacity:0,y:-30,duration:.35,ease:I},13.7);

  // 14–17 preuve (chiffres réels : 330 membres, 52 retours membres dorsiflexion au retest)
  tl.fromTo("#pr1",{y:60,opacity:0,scale:.97},{y:0,opacity:1,scale:1,duration:.7,ease:E},14.05);
  tl.fromTo("#pr2",{y:60,opacity:0,scale:.97},{y:0,opacity:1,scale:1,duration:.7,ease:E},14.2);
  var c1={v:0}, c2={v:0};
  tl.to(c1,{v:330,duration:.7,ease:"power2.out",onUpdate:function(){document.getElementById("n330").textContent=Math.round(c1.v);}},14.15);
  tl.to(c2,{v:52,duration:.65,ease:"power2.out",onUpdate:function(){document.getElementById("n52").textContent=Math.round(c2.v);}},14.3);
  tl.to("#pr1,#pr2",{opacity:0,y:-24,duration:.35,ease:I},16.7);

  // 17–20 fin
  lines("#e1",17.15); 
  tl.fromTo("#e2",{y:40,opacity:0,scale:.97},{y:0,opacity:1,scale:1,duration:.7,ease:E},17.6);
  tl.to("#e1 .ln,#e2",{opacity:0,duration:.4,ease:"sine.in"},19.45);

  return tl;
};

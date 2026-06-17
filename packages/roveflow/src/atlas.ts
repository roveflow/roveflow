// Build the Revyl-style Atlas (self-contained HTML) + per-journey videos from
// roveflow-out/journeys.json + roveflow-out/screens/*.png. Ported from the POC.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

type Screen = { title: string; caption: string };
type Journey = { category: string; title: string; description: string; flow: string[] };
type Manifest = { app: string; platform: string; subtitle: string; screens: Record<string, Screen>; journeys: Journey[] };

const CAT_COLORS: Record<string, string> = {
  Tracking: "#b9f24d", "Food logging": "#ff7a3d", Profile: "#5db0ff", Scenario: "#c084fc",
  Onboarding: "#34d399", Settings: "#fbbf24", Discover: "#22d3ee", Messaging: "#f472b6", Auth: "#a3a3a3",
};
const ACCENT = "#b9f24d";

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const jslug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function makeVideos(outDir: string): void {
  const m: Manifest = JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8"));
  const screens = path.join(outDir, "screens");
  const videos = path.join(outDir, "videos");
  mkdirSync(videos, { recursive: true });
  const SECS = 1.5;
  for (const j of m.journeys) {
    const frames = j.flow.map((s) => path.join(screens, `${s}.png`)).filter(existsSync);
    if (!frames.length) continue;
    const list = path.join(os.tmpdir(), `rf-${jslug(j.title)}.txt`);
    writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${SECS}`).join("\n") + `\nfile '${frames.at(-1)}'\n`);
    const out = path.join(videos, `${jslug(j.title)}.mp4`);
    try {
      execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list,
        "-vf", "scale=560:-2,format=yuv420p", "-r", "30", "-movflags", "+faststart", out], { stdio: "ignore" });
    } catch { /* ffmpeg missing — skip videos */ }
    rmSync(list, { force: true });
  }
}

export function buildAtlas(outDir: string): { html: string; screens: number; paths: number; steps: number } {
  const m: Manifest = JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8"));
  const nScreens = Object.keys(m.screens).length;
  const nPaths = m.journeys.length;
  const nSteps = m.journeys.reduce((a, j) => a + j.flow.length, 0);
  const color = (c: string) => CAT_COLORS[c] ?? ACCENT;

  const node = (id: string) => {
    const s = m.screens[id]; if (!s) return "";
    return `<div class="node"><div class="phone"><img class="zoom" loading="lazy" src="screens/${esc(id)}.png" alt="${esc(s.title)}"></div>
      <div class="ntitle">${esc(s.title)}</div><div class="ncap">${esc(s.caption)}</div></div>`;
  };
  const lane = (j: Journey, i: number) => {
    const nodes = j.flow.map((id, k) => (k ? '<div class="arrow">&#8594;</div>' : "") + node(id)).join("");
    return `<section class="lane" id="lane-${i}"><div class="lane-head">
      <span class="badge" style="--c:${color(j.category)}">${esc(j.category)}</span><h2>${esc(j.title)}</h2>
      <span class="lane-count">${j.flow.length} screens</span></div>
      <p class="lane-desc">${esc(j.description)}</p><div class="flow">${nodes}</div></section>`;
  };
  const card = (j: Journey, i: number) => `<button class="jcard" data-lane="${i}">
      <div class="jcard-top"><span class="badge sm" style="--c:${color(j.category)}">${esc(j.category)}</span>
      <span class="jcount">${j.flow.length} screens</span></div>
      <div class="jtitle">${esc(j.title)}</div><div class="jdesc">${esc(j.description)}</div></button>`;
  const grid = Object.entries(m.screens).map(([id, s]) =>
    `<div class="gcell"><div class="phone"><img class="zoom" loading="lazy" src="screens/${esc(id)}.png"></div>
      <div class="ntitle">${esc(s.title)}</div><div class="ncap">${esc(s.caption)}</div></div>`).join("");
  const recordings = m.journeys.map((j) => `<div class="rec"><div class="rec-head">
      <span class="badge sm" style="--c:${color(j.category)}">${esc(j.category)}</span>
      <span class="jcount">${j.flow.length} screens</span></div><div class="rtitle">${esc(j.title)}</div>
      <video controls preload="metadata" playsinline poster="screens/${esc(j.flow[0])}.png">
      <source src="videos/${jslug(j.title)}.mp4" type="video/mp4"></video>
      <div class="rdesc">${esc(j.description)}</div></div>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.app)} — Screen Map & User Flows · Roveflow Atlas</title><style>
:root{--bg:#0b0b0c;--panel:#161617;--panel2:#1d1d1f;--bd:#2a2a2c;--tx:#ededed;--mut:#8a8a8f;--acc:${ACCENT}}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);
font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
.app{display:flex;flex-direction:column;height:100vh}
header{display:flex;align-items:center;gap:16px;padding:0 18px;height:54px;border-bottom:1px solid var(--bd);background:var(--panel);flex:0 0 auto}
.crumb{display:flex;align-items:center;gap:8px;font-weight:600}.crumb a{color:var(--mut);text-decoration:none}.crumb .sep{color:#444}.crumb .app{color:var(--tx)}
.tag{font-size:11px;color:var(--mut);border:1px solid var(--bd);border-radius:5px;padding:1px 6px;text-transform:uppercase;letter-spacing:.04em}
.tabs{display:flex;gap:4px;margin-left:8px}.tab{background:none;border:0;color:var(--mut);padding:6px 12px;border-radius:7px;cursor:pointer;font:inherit}.tab.active{background:var(--panel2);color:var(--tx)}
.stats{margin-left:auto;display:flex;gap:22px}.stat b{display:block;font-size:15px}.stat span{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.main{display:flex;flex:1;min-height:0}aside{width:330px;flex:0 0 auto;border-right:1px solid var(--bd);background:var(--panel);overflow-y:auto;padding:16px}
.aside-h{font-weight:600;font-size:15px}.aside-sub{color:var(--mut);font-size:12px;margin-bottom:14px}
.jcard{display:block;width:100%;text-align:left;background:var(--panel2);border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;color:var(--tx);font:inherit;transition:.15s}
.jcard:hover{border-color:#3a3a3d;transform:translateY(-1px)}.jcard.active{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
.jcard-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.jcount,.lane-count{color:var(--mut);font-size:11px}
.jtitle{font-weight:600;margin-bottom:3px}.jdesc{color:var(--mut);font-size:12px}
.badge{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--c);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 12%,transparent);border-radius:5px;padding:2px 7px}.badge.sm{font-size:10px}
.canvas{flex:1;overflow:auto;padding:26px 30px 80px;background:radial-gradient(circle at 1px 1px,#18181a 1px,transparent 0) 0 0/26px 26px var(--bg)}
.lane{margin-bottom:40px;padding:18px;border:1px solid var(--bd);border-radius:14px;background:rgba(22,22,23,.55)}.lane.dim{opacity:.35}
.lane-head{display:flex;align-items:center;gap:12px}.lane-head h2{font-size:16px;margin:0}.lane-count{margin-left:auto}.lane-desc{color:var(--mut);margin:6px 0 16px;max-width:760px}
.flow{display:flex;align-items:flex-start;gap:6px;overflow-x:auto;padding-bottom:8px}.node{flex:0 0 auto;width:158px}
.phone{width:158px;aspect-ratio:1206/2622;border-radius:16px;overflow:hidden;border:1px solid var(--bd);background:#000;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.phone img{width:100%;height:100%;object-fit:cover;display:block}.ntitle{font-weight:600;font-size:12.5px;margin-top:9px}.ncap{color:var(--mut);font-size:11px}
.arrow{flex:0 0 auto;align-self:center;color:#4a4a4e;font-size:22px;margin-top:-26px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:24px}.gcell .phone{width:100%}.hidden{display:none}
footer{flex:0 0 auto;border-top:1px solid var(--bd);background:var(--panel);padding:9px 18px;color:var(--mut);font-size:12px;display:flex;gap:8px;align-items:center}footer b{color:var(--acc);font-weight:600}
.report{max-width:720px}.report h3{margin:22px 0 8px}
.recordings{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.rec{background:var(--panel2);border:1px solid var(--bd);border-radius:12px;padding:14px}.rec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.rtitle{font-weight:600;margin-bottom:10px}.rec video{width:100%;border-radius:10px;background:#000;display:block;border:1px solid var(--bd)}.rdesc{color:var(--mut);font-size:12px;margin-top:10px}
.zoom{cursor:zoom-in}#lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:50}#lightbox.show{display:flex}
#lightbox img{max-height:92vh;max-width:92vw;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}#lightbox-x{position:fixed;top:18px;right:26px;font-size:40px;color:#fff;cursor:pointer;line-height:1}
</style></head><body><div class="app">
<header><div class="crumb"><a href="#">ROVEFLOW</a><span class="sep">/</span><a href="#">Atlas</a><span class="sep">/</span><span class="app">${esc(m.app)}</span><span class="tag">${esc(m.platform)}</span></div>
<div class="tabs"><button class="tab active" data-view="map">Map</button><button class="tab" data-view="screens">Screens (${nScreens})</button><button class="tab" data-view="report">Report</button></div>
<div class="stats"><div class="stat"><b>${nScreens}</b><span>Screens</span></div><div class="stat"><b>${nPaths}</b><span>Paths</span></div><div class="stat"><b>${nSteps}</b><span>Steps</span></div></div></header>
<div class="main"><aside><div class="aside-h">User Journeys</div><div class="aside-sub">${nPaths} paths · ${esc(m.subtitle)}</div>
${m.journeys.map(card).join("")}</aside>
<div class="canvas" id="view-map">${m.journeys.map(lane).join("")}</div>
<div class="canvas hidden" id="view-screens"><div class="grid">${grid}</div></div>
<div class="canvas hidden" id="view-report"><div class="report"><h2>${esc(m.app)} — UX map</h2>
<p style="color:var(--mut)">Captured live from a physical iPhone by roving the App Store build via WebDriverAgent, then assembled into this flow map. ${nScreens} unique screens across ${nPaths} user journeys.</p></div>
<h3 style="margin:6px 0 16px">Journey recordings</h3><div class="recordings">${recordings}</div></div></div>
<div id="lightbox"><img id="lightbox-img" src=""><span id="lightbox-x">&times;</span></div>
<footer>Mapped by <b>Roveflow</b> <span class="sep">·</span> ${esc(m.app)} ${esc(m.platform)} <span class="sep">·</span> ${nScreens} screens, captured from physical device</footer></div>
<script>
const tabs=[...document.querySelectorAll('.tab')],views={map:'view-map',screens:'view-screens',report:'view-report'};
tabs.forEach(t=>t.onclick=()=>{tabs.forEach(x=>x.classList.remove('active'));t.classList.add('active');for(const k in views)document.getElementById(views[k]).classList.toggle('hidden',k!==t.dataset.view)});
const cards=[...document.querySelectorAll('.jcard')];
cards.forEach(c=>c.onclick=()=>{const a=c.classList.contains('active');cards.forEach(x=>x.classList.remove('active'));document.querySelectorAll('.lane').forEach(l=>l.classList.remove('dim'));if(!a){c.classList.add('active');document.querySelectorAll('.lane').forEach(l=>{if(l.id!=='lane-'+c.dataset.lane)l.classList.add('dim')});document.getElementById('lane-'+c.dataset.lane).scrollIntoView({behavior:'smooth',block:'start'})}});
const lb=document.getElementById('lightbox'),lbi=document.getElementById('lightbox-img');
document.addEventListener('click',e=>{if(e.target.classList&&e.target.classList.contains('zoom')){lbi.src=e.target.src;lb.classList.add('show')}else if(e.target.id==='lightbox'||e.target.id==='lightbox-x'){lb.classList.remove('show');lbi.src=''}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){lb.classList.remove('show');lbi.src=''}});
</script></body></html>`;

  writeFileSync(path.join(outDir, "atlas.html"), html);
  return { html, screens: nScreens, paths: nPaths, steps: nSteps };
}

// Build the Revyl-style Atlas (self-contained HTML) + per-journey videos from
// roveflow-out/journeys.json + roveflow-out/screens/*.png. Ported from the POC.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { slug } from "./types.js";

type Screen = { title: string; caption: string };
type Journey = { category: string; title: string; description: string; flow: string[] };
type Manifest = { app: string; platform: string; subtitle: string; screens: Record<string, Screen>; journeys: Journey[] };

const CAT_COLORS: Record<string, string> = {
  Tracking: "#b9f24d", "Food logging": "#ff7a3d", Profile: "#5db0ff", Scenario: "#c084fc",
  Onboarding: "#34d399", Settings: "#fbbf24", Discover: "#22d3ee", Messaging: "#f472b6", Auth: "#a3a3a3",
};
const ACCENT = "#b9f24d";

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ffmpeg powers BOTH the screen→JPEG downscale and the journey videos. Resolved by
// name (the desktop puts the bundled engine dir first on PATH); override the path
// with ROVEFLOW_FFMPEG. Tunables: target width + JPEG quality (-q:v 2 best … 31 worst).
const FFMPEG = process.env.ROVEFLOW_FFMPEG ?? "ffmpeg";
const JPEG_WIDTH = Number(process.env.ROVEFLOW_JPEG_WIDTH ?? 1206);
const JPEG_Q = String(process.env.ROVEFLOW_JPEG_Q ?? 2);

// Downscale + JPEG-encode each captured screen so the shared atlas/zip is ~10x
// smaller. Source PNGs stay on disk (lossless; still used for video frames + the
// live capture grid) — only the atlas and the share bundle reference the .jpg.
// Returns the set of slugs that now have a .jpg (so we can fall back to .png when
// ffmpeg is absent). Idempotent: skips a slug whose .jpg is already current.
function transcodeScreens(outDir: string, slugs: string[]): Set<string> {
  const dir = path.join(outDir, "screens");
  const done = new Set<string>();
  for (const s of slugs) {
    const png = path.join(dir, `${s}.png`);
    const jpg = path.join(dir, `${s}.jpg`);
    if (existsSync(jpg) && existsSync(png) && statSync(jpg).mtimeMs >= statSync(png).mtimeMs) { done.add(s); continue; }
    if (!existsSync(png)) continue;
    try {
      execFileSync(FFMPEG, ["-y", "-i", png, "-vf", `scale=${JPEG_WIDTH}:-2`, "-q:v", JPEG_Q, jpg], { stdio: "ignore" });
      if (existsSync(jpg)) done.add(s);
    } catch { /* ffmpeg missing — keep the PNG; the atlas references it instead */ }
  }
  return done;
}

export function makeVideos(outDir: string): void {
  const m: Manifest = JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8"));
  const screens = path.join(outDir, "screens");
  const videos = path.join(outDir, "videos");
  mkdirSync(videos, { recursive: true });
  const SECS = 1.5;
  for (const j of m.journeys) {
    const frames = j.flow.map((s) => path.join(screens, `${slug(s)}.png`)).filter(existsSync);
    if (!frames.length) continue;
    const list = path.join(os.tmpdir(), `rf-${slug(j.title)}.txt`);
    writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${SECS}`).join("\n") + `\nfile '${frames.at(-1)}'\n`);
    const out = path.join(videos, `${slug(j.title)}.mp4`);
    try {
      execFileSync(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list,
        "-vf", "scale=560:-2,format=yuv420p", "-r", "30", "-movflags", "+faststart", out], { stdio: "ignore" });
    } catch { /* ffmpeg missing — skip videos */ }
    rmSync(list, { force: true });
  }
}

// Layered DAG layout (Sugiyama-lite): rank by longest path, order + position
// each rank by barycenter of neighbours to reduce edge crossings. Self-contained,
// deterministic — no graph library, so the atlas stays a single offline HTML file.
const NODE_W = 120, COL_GAP = 46, ROW_H = 384, NODE_BODY_H = 298, PAD = 56;
type Layout = {
  ids: string[]; rank: Map<string, number>; x: Map<string, number>;
  indeg: Map<string, number>; edges: { from: string; to: string; journeys: Set<number> }[];
  gw: number; gh: number;
};
function layoutGraph(m: Manifest, present: Set<string>): Layout {
  const sep = "";
  const edgeMap = new Map<string, { from: string; to: string; journeys: Set<number> }>();
  const nodeIds: string[] = [];
  const seen = new Set<string>();
  m.journeys.forEach((j, ji) => {
    const f = j.flow.filter((id) => present.has(id));
    f.forEach((id, k) => {
      if (!seen.has(id)) { seen.add(id); nodeIds.push(id); }
      if (k && f[k - 1] !== id) {
        const key = f[k - 1] + sep + id;
        let e = edgeMap.get(key);
        if (!e) { e = { from: f[k - 1], to: id, journeys: new Set() }; edgeMap.set(key, e); }
        e.journeys.add(ji);
      }
    });
  });
  const edges = [...edgeMap.values()];
  const outAdj = new Map<string, string[]>(), inAdj = new Map<string, string[]>();
  nodeIds.forEach((id) => { outAdj.set(id, []); inAdj.set(id, []); });
  for (const e of edges) { outAdj.get(e.from)!.push(e.to); inAdj.get(e.to)!.push(e.from); }
  const indeg = new Map(nodeIds.map((id) => [id, inAdj.get(id)!.length]));

  // rank = longest path from a source; relax with an iteration cap so cycles terminate.
  const rank = new Map(nodeIds.map((id) => [id, 0]));
  for (let i = 0; i < nodeIds.length; i++) {
    let changed = false;
    for (const e of edges) {
      const r = rank.get(e.from)! + 1;
      if (r > rank.get(e.to)!) { rank.set(e.to, r); changed = true; }
    }
    if (!changed) break;
  }
  const maxRank = Math.max(0, ...nodeIds.map((id) => rank.get(id)!));
  const ranks: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodeIds.forEach((id) => ranks[rank.get(id)!].push(id));

  // x via a tidy spanning tree: leaves take sequential slots, parents centre
  // over their children. Compact and centred by construction — no drift.
  const COL = NODE_W + COL_GAP;
  const rootList = nodeIds.filter((id) => indeg.get(id) === 0);
  if (!rootList.length && nodeIds.length) rootList.push(nodeIds[0]);
  const treeKids = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  const placed = new Set<string>(rootList);
  const queue = [...rootList];
  while (queue.length) {
    const u = queue.shift()!;
    for (const v of outAdj.get(u)!) if (!placed.has(v)) { placed.add(v); treeKids.get(u)!.push(v); queue.push(v); }
  }
  for (const id of nodeIds) if (!placed.has(id)) {        // nodes only reachable through a cycle
    const p = inAdj.get(id)!.find((n) => placed.has(n)) ?? rootList[0];
    if (p) treeKids.get(p)!.push(id);
    placed.add(id);
  }
  const x = new Map<string, number>();
  let cursor = 0;
  const assign = (u: string) => {
    const ch = treeKids.get(u)!;
    if (!ch.length) { x.set(u, cursor); cursor += COL; return; }
    ch.forEach(assign);
    x.set(u, (x.get(ch[0])! + x.get(ch[ch.length - 1])!) / 2);
  };
  rootList.forEach((r) => { assign(r); cursor += COL; });
  for (const r of ranks) {                                // keep same-rank nodes from overlapping
    r.sort((a, b) => x.get(a)! - x.get(b)!);
    for (let i = 1; i < r.length; i++) { const min = x.get(r[i - 1])! + COL; if (x.get(r[i])! < min) x.set(r[i], min); }
  }
  const minX = Math.min(0, ...nodeIds.map((id) => x.get(id)!));
  nodeIds.forEach((id) => x.set(id, x.get(id)! - minX));
  const maxX = Math.max(0, ...nodeIds.map((id) => x.get(id)!));
  return { ids: nodeIds, rank, x, indeg, edges, gw: maxX + NODE_W + PAD * 2, gh: maxRank * ROW_H + NODE_BODY_H + PAD * 2 };
}

export function buildAtlas(outDir: string): { html: string; screens: number; paths: number; steps: number } {
  const m: Manifest = JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8"));
  const nScreens = Object.keys(m.screens).length;
  const nPaths = m.journeys.length;
  const nSteps = m.journeys.reduce((a, j) => a + j.flow.length, 0);
  const color = (c: string) => CAT_COLORS[c] ?? ACCENT;

  // Downscale screens to JPEG, then reference .jpg where it exists (else .png).
  // Filenames go through the SAME slug as capture (see types.ts) so refs resolve
  // regardless of how the id was written in journeys.json.
  const jpgSet = transcodeScreens(outDir, [...new Set(Object.keys(m.screens).map(slug))]);
  const img = (id: string) => `screens/${slug(id)}.${jpgSet.has(slug(id)) ? "jpg" : "png"}`;

  // --- Map: layered node graph (Revyl-style) ---
  const present = new Set(Object.keys(m.screens));
  const L = layoutGraph(m, present);
  const nodeJourneys = new Map<string, Set<number>>();
  m.journeys.forEach((j, ji) => j.flow.forEach((id) => {
    if (present.has(id)) (nodeJourneys.get(id) ?? nodeJourneys.set(id, new Set()).get(id)!).add(ji);
  }));
  const cx = (id: string) => PAD + L.x.get(id)! + NODE_W / 2;
  const topY = (id: string) => PAD + L.rank.get(id)! * ROW_H;
  const botY = (id: string) => topY(id) + NODE_BODY_H;
  const edgesSvg = L.edges.map((e) => {
    const x1 = cx(e.from), y1 = botY(e.from), x2 = cx(e.to), y2 = topY(e.to);
    const dy = Math.max(40, (y2 - y1) * 0.5);
    const dj = [...e.journeys].sort((a, b) => a - b).join(",");
    return `<path class="gedge" data-j="${dj}" d="M ${x1} ${y1} C ${x1} ${(y1 + dy).toFixed(1)} ${x2} ${(y2 - dy).toFixed(1)} ${x2} ${y2}"/>`;
  }).join("");
  const gnodes = L.ids.map((id) => {
    const s = m.screens[id];
    const dj = [...(nodeJourneys.get(id) ?? [])].sort((a, b) => a - b).join(",");
    return `<div class="gnode" data-j="${dj}" style="left:${PAD + L.x.get(id)!}px;top:${topY(id)}px">
      <div class="glabel">${esc(s.title)}</div>
      <div class="phone"><img class="zoom" loading="lazy" src="${img(id)}" alt="${esc(s.title)}"></div></div>`;
  }).join("");
  const startPills = L.ids.filter((id) => L.indeg.get(id) === 0)
    .map((id) => `<div class="gstart" style="left:${cx(id)}px;top:${topY(id) - 26}px">Start</div>`).join("");
  const graph = `<svg class="gedges" width="${L.gw}" height="${L.gh}" viewBox="0 0 ${L.gw} ${L.gh}">${edgesSvg}</svg>${startPills}${gnodes}`;

  const card = (j: Journey, i: number) => `<button class="jcard" data-lane="${i}">
      <div class="jcard-top"><span class="badge sm" style="--c:${color(j.category)}">${esc(j.category)}</span>
      <span class="jcount">${j.flow.length} screens</span></div>
      <div class="jtitle">${esc(j.title)}</div><div class="jdesc">${esc(j.description)}</div></button>`;
  const grid = Object.entries(m.screens).map(([id, s]) =>
    `<div class="gcell"><div class="phone"><img class="zoom" loading="lazy" src="${img(id)}"></div>
      <div class="ntitle">${esc(s.title)}</div><div class="ncap">${esc(s.caption)}</div></div>`).join("");
  const recordings = m.journeys.map((j) => `<div class="rec"><div class="rec-head">
      <span class="badge sm" style="--c:${color(j.category)}">${esc(j.category)}</span>
      <span class="jcount">${j.flow.length} screens</span></div><div class="rtitle">${esc(j.title)}</div>
      <video controls preload="metadata" playsinline poster="${img(j.flow[0])}">
      <source src="videos/${slug(j.title)}.mp4" type="video/mp4"></video>
      <div class="rdesc">${esc(j.description)}</div></div>`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.app)} — Screen Map & User Flows · Roveflow</title><style>
:root{--bg:#0b0b0c;--panel:#161617;--panel2:#1d1d1f;--bd:#2a2a2c;--tx:#ededed;--mut:#8a8a8f;--acc:${ACCENT}}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--tx);
font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
.app{display:flex;flex-direction:column;height:100vh}
header{display:flex;align-items:center;gap:16px;padding:0 18px;height:54px;border-bottom:1px solid var(--bd);background:var(--panel);flex:0 0 auto}
.crumb{display:flex;align-items:center;gap:8px;font-weight:600}.crumb a{color:var(--mut);text-decoration:none}.crumb .sep{color:#444}.crumb .app{color:var(--tx)}
.brand{display:inline-flex;align-items:center;gap:7px;color:var(--tx)!important;text-decoration:none}.brand:hover{opacity:.85}
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
.phone{aspect-ratio:1206/2622;border-radius:16px;overflow:hidden;border:1px solid var(--bd);background:#000;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.phone img{width:100%;height:100%;object-fit:cover;display:block}.ntitle{font-weight:600;font-size:12.5px;margin-top:9px}.ncap{color:var(--mut);font-size:11px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:24px}.gcell .phone{width:100%}.hidden{display:none}
/* Map: layered node graph */
#view-map{flex:1;position:relative;overflow:hidden;padding:0;cursor:grab;touch-action:none;background:radial-gradient(circle at 1px 1px,#161618 1px,transparent 0) 0 0/26px 26px var(--bg)}
#view-map.grabbing{cursor:grabbing}
#graphpan{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
.gedges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none}
.gedge{fill:none;stroke:#3b3b3e;stroke-width:1.6;transition:stroke .15s,stroke-width .15s}
.dimmed .gedge{stroke:#202022}.gedge.hot{stroke:var(--acc);stroke-width:2.6}
.gnode{position:absolute;width:120px;display:flex;flex-direction:column;align-items:center;transition:opacity .15s}
.gnode .phone{width:120px}
.glabel{font-size:11px;font-weight:600;line-height:1.2;text-align:center;height:28px;overflow:hidden;margin-bottom:7px;color:var(--tx);word-break:break-word}
.dimmed .gnode{opacity:.26}.gnode.hot{opacity:1}.gnode.hot .phone{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc),0 10px 28px rgba(0,0,0,.55)}
.gstart{position:absolute;transform:translateX(-50%);font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#0b0b0c;background:var(--acc);border-radius:20px;padding:3px 10px;white-space:nowrap}
.gcontrols{position:absolute;left:16px;bottom:16px;display:flex;flex-direction:column;gap:7px;z-index:5}
.gcontrols button{width:34px;height:34px;border-radius:9px;border:1px solid var(--bd);background:var(--panel2);color:var(--tx);font-size:17px;line-height:1;cursor:pointer}
.gcontrols button:hover{border-color:#3a3a3d;color:var(--acc)}
.ghint{position:absolute;right:16px;bottom:15px;color:var(--mut);font-size:11px;z-index:5;pointer-events:none}
footer{flex:0 0 auto;border-top:1px solid var(--bd);background:var(--panel);padding:9px 18px;color:var(--mut);font-size:12px;display:flex;gap:8px;align-items:center}footer b{color:var(--acc);font-weight:600}footer a{color:inherit;text-decoration:none}footer a:hover b{text-decoration:underline}
.report{max-width:720px}.report h3{margin:22px 0 8px}
.recordings{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}
.rec{background:var(--panel2);border:1px solid var(--bd);border-radius:12px;padding:14px}.rec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.rtitle{font-weight:600;margin-bottom:10px}.rec video{width:100%;border-radius:10px;background:#000;display:block;border:1px solid var(--bd)}.rdesc{color:var(--mut);font-size:12px;margin-top:10px}
.zoom{cursor:zoom-in}#lightbox{position:fixed;inset:0;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;z-index:50}#lightbox.show{display:flex}
#lightbox img{max-height:92vh;max-width:92vw;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6)}#lightbox-x{position:fixed;top:18px;right:26px;font-size:40px;color:#fff;cursor:pointer;line-height:1}
</style></head><body><div class="app">
<header><div class="crumb"><a class="brand" href="https://roveflow.dev" target="_blank" rel="noopener"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.75"/><rect x="12" y="7" width="5" height="5" rx="1" fill="var(--acc)"/></svg><span>roveflow</span></a><span class="sep">/</span><a href="https://roveflow.dev/#flows" target="_blank" rel="noopener">Flows</a><span class="sep">/</span><span class="app">${esc(m.app)}</span><span class="tag">${esc(m.platform)}</span></div>
<div class="tabs"><button class="tab active" data-view="map">Map</button><button class="tab" data-view="screens">Screens (${nScreens})</button><button class="tab" data-view="report">Report</button></div>
<div class="stats"><div class="stat"><b>${nScreens}</b><span>Screens</span></div><div class="stat"><b>${nPaths}</b><span>Paths</span></div><div class="stat"><b>${nSteps}</b><span>Steps</span></div></div></header>
<div class="main"><aside><div class="aside-h">User Journeys</div><div class="aside-sub">${nPaths} paths · ${esc(m.subtitle)}</div>
${m.journeys.map(card).join("")}</aside>
<div id="view-map"><div id="graphpan">${graph}</div>
<div class="gcontrols"><button id="zin" title="Zoom in">+</button><button id="zout" title="Zoom out">&minus;</button><button id="zfit" title="Fit to screen">&#9974;</button></div>
<div class="ghint">scroll to zoom · drag to pan · click a journey to trace it</div></div>
<div class="canvas hidden" id="view-screens"><div class="grid">${grid}</div></div>
<div class="canvas hidden" id="view-report"><div class="report"><h2>${esc(m.app)} — UX map</h2>
<p style="color:var(--mut)">Captured live from a physical iPhone by roving the App Store build via WebDriverAgent, then assembled into this flow map. ${nScreens} unique screens across ${nPaths} user journeys.</p></div>
<h3 style="margin:6px 0 16px">Journey recordings</h3><div class="recordings">${recordings}</div></div></div>
<div id="lightbox"><img id="lightbox-img" src=""><span id="lightbox-x">&times;</span></div>
<footer>Mapped by <a href="https://roveflow.dev" target="_blank" rel="noopener"><b>Roveflow</b></a> <span class="sep">·</span> ${esc(m.app)} ${esc(m.platform)} <span class="sep">·</span> ${nScreens} screens, captured from physical device</footer></div>
<script>
const tabs=[...document.querySelectorAll('.tab')],views={map:'view-map',screens:'view-screens',report:'view-report'};
tabs.forEach(t=>t.onclick=()=>{tabs.forEach(x=>x.classList.remove('active'));t.classList.add('active');for(const k in views)document.getElementById(views[k]).classList.toggle('hidden',k!==t.dataset.view);if(t.dataset.view==='map'&&window.__fit)window.__fit()});

// --- graph pan / zoom ---
const pane=document.getElementById('view-map'),pan=document.getElementById('graphpan');
const GW=${L.gw},GH=${L.gh};let s=1,tx=0,ty=0;
const apply=()=>pan.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';
const clampS=v=>Math.max(0.08,Math.min(2.5,v));
function fit(){const r=pane.getBoundingClientRect();if(!r.width)return;s=clampS(Math.min(r.width/GW,r.height/GH)*0.92);tx=(r.width-GW*s)/2;ty=Math.max(8,(r.height-GH*s)/2);apply();}
function zoomAt(px,py,ns){ns=clampS(ns);const r=pane.getBoundingClientRect();const gx=(px-r.left-tx)/s,gy=(py-r.top-ty)/s;s=ns;tx=px-r.left-gx*s;ty=py-r.top-gy*s;apply();}
pane.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,s*(e.deltaY<0?1.12:0.89));},{passive:false});
let drag=null;
pane.addEventListener('pointerdown',e=>{if(e.target.classList.contains('zoom'))return;drag={x:e.clientX,y:e.clientY,tx,ty};pane.classList.add('grabbing');pane.setPointerCapture(e.pointerId);});
pane.addEventListener('pointermove',e=>{if(!drag)return;tx=drag.tx+(e.clientX-drag.x);ty=drag.ty+(e.clientY-drag.y);apply();});
const endDrag=()=>{drag=null;pane.classList.remove('grabbing');};
pane.addEventListener('pointerup',endDrag);pane.addEventListener('pointercancel',endDrag);
const ctr=()=>{const r=pane.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2];};
document.getElementById('zin').onclick=()=>{const[a,b]=ctr();zoomAt(a,b,s*1.25);};
document.getElementById('zout').onclick=()=>{const[a,b]=ctr();zoomAt(a,b,s*0.8);};
document.getElementById('zfit').onclick=fit;
window.__fit=fit;window.addEventListener('resize',()=>{if(!document.getElementById('view-map').classList.contains('hidden'))fit();});
requestAnimationFrame(fit);

// --- journey highlight ---
const cards=[...document.querySelectorAll('.jcard')],gnodes=[...document.querySelectorAll('.gnode')],gedges=[...document.querySelectorAll('.gedge')];
const inJ=(el,ji)=>(el.dataset.j||'').split(',').indexOf(ji)>=0;
function clearHi(){pane.classList.remove('dimmed');gnodes.forEach(n=>n.classList.remove('hot'));gedges.forEach(e=>e.classList.remove('hot'));}
cards.forEach(c=>c.onclick=()=>{const a=c.classList.contains('active');cards.forEach(x=>x.classList.remove('active'));if(a){clearHi();return;}c.classList.add('active');const ji=c.dataset.lane;pane.classList.add('dimmed');gnodes.forEach(n=>n.classList.toggle('hot',inJ(n,ji)));gedges.forEach(e=>e.classList.toggle('hot',inJ(e,ji)));});
const lb=document.getElementById('lightbox'),lbi=document.getElementById('lightbox-img');
document.addEventListener('click',e=>{if(e.target.classList&&e.target.classList.contains('zoom')){lbi.src=e.target.src;lb.classList.add('show')}else if(e.target.id==='lightbox'||e.target.id==='lightbox-x'){lb.classList.remove('show');lbi.src=''}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){lb.classList.remove('show');lbi.src=''}});
</script></body></html>`;

  writeFileSync(path.join(outDir, "atlas.html"), html);
  return { html, screens: nScreens, paths: nPaths, steps: nSteps };
}

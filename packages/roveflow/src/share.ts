// Share a built Atlas two ways: a self-contained .zip (open atlas.html offline)
// and a web upload to an unlisted, unguessable URL. Both reuse one bundler.
//
// The zip writer is dependency-free on purpose (keeps roveflow's zero-runtime-dep
// footprint): it uses Node's built-in zlib for real DEFLATE compression, so PNGs
// and MP4s store as-is while atlas.html/journeys.json shrink.

import { deflateRawSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { slug } from "./types.js";

type Entry = { name: string; data: Buffer };

// Root files that make up a shareable Atlas. atlas.html references screens/ + videos/
// with relative paths, so the bundle opens (offline) and serves (web) unchanged.
const ROOT_FILES = ["atlas.html", "journeys.json"];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function contentType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return ext === ".html" ? "text/html; charset=utf-8"
    : ext === ".json" ? "application/json"
    : ext === ".png" ? "image/png"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".mp4" ? "video/mp4"
    : "application/octet-stream";
}

/** A minimal store-or-deflate ZIP (no central-dir extras, no zip64) — plenty for
 *  an Atlas bundle, and every OS unarchiver opens it. */
function makeZip(entries: Entry[], when: Date): Buffer {
  const { time, date } = dosDateTime(when);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const comp = deflateRawSync(e.data);
    const store = comp.length >= e.data.length;     // already-compressed media: store as-is
    const method = store ? 0 : 8;
    const body = store ? e.data : comp;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);                          // version needed
    lh.writeUInt16LE(0x0800, 6);                      // flag: UTF-8 filenames
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);                          // version made by
    ch.writeUInt16LE(20, 6);                          // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += 30 + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, end]);
}

/** Gather exactly what atlas.html references — its root files, the screens named in
 *  the manifest (preferring the downscaled .jpg), and every journey video. Ships only
 *  referenced screens, so stray/removed captures on disk never bloat the bundle. */
export function collectEntries(outDir: string): Entry[] {
  const entries: Entry[] = [];
  for (const f of ROOT_FILES) {
    const p = path.join(outDir, f);
    if (existsSync(p)) entries.push({ name: f, data: readFileSync(p) });
  }

  // Screens: one image per manifest screen, .jpg if the transcode produced it else .png.
  const screensDir = path.join(outDir, "screens");
  let referenced: string[] | null = null;
  try {
    const m = JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8"));
    referenced = [...new Set(Object.keys(m.screens ?? {}).map(slug))];
  } catch { referenced = null; }

  if (referenced && existsSync(screensDir)) {
    for (const s of referenced.sort()) {
      const jpg = path.join(screensDir, `${s}.jpg`);
      const png = path.join(screensDir, `${s}.png`);
      const pick = existsSync(jpg) ? jpg : existsSync(png) ? png : null;
      if (pick) entries.push({ name: `screens/${path.basename(pick)}`, data: readFileSync(pick) });
    }
  } else if (existsSync(screensDir)) {
    // No manifest — fall back to shipping the whole screens dir (jpg supersedes its png).
    const files = readdirSync(screensDir).filter((f) => statSync(path.join(screensDir, f)).isFile());
    const jpgBases = new Set(files.filter((f) => f.toLowerCase().endsWith(".jpg")).map((f) => f.slice(0, -4)));
    for (const f of files.sort()) {
      if (f.toLowerCase().endsWith(".png") && jpgBases.has(f.slice(0, -4))) continue;
      entries.push({ name: `screens/${f}`, data: readFileSync(path.join(screensDir, f)) });
    }
  }

  // Videos: ship all (named by journey slug, all referenced by the atlas).
  const videosDir = path.join(outDir, "videos");
  if (existsSync(videosDir)) {
    for (const f of readdirSync(videosDir).filter((f) => statSync(path.join(videosDir, f)).isFile()).sort()) {
      entries.push({ name: `videos/${f}`, data: readFileSync(path.join(videosDir, f)) });
    }
  }
  return entries;
}

function ensureAtlas(outDir: string): void {
  if (existsSync(path.join(outDir, "atlas.html"))) return;
  throw new Error(`no atlas.html in ${outDir} — run \`roveflow atlas\` first`);
}

/** Write a self-contained .zip of the Atlas. Recipient unzips and opens atlas.html. */
export function buildShareZip(outDir: string, zipPath: string): { files: number; bytes: number } {
  ensureAtlas(outDir);
  const entries = collectEntries(outDir);
  const zip = makeZip(entries, new Date());
  writeFileSync(zipPath, zip);
  return { files: entries.length, bytes: zip.length };
}

function readManifest(outDir: string): any {
  try { return JSON.parse(readFileSync(path.join(outDir, "journeys.json"), "utf8")); }
  catch { return {}; }
}

/** Upload the Atlas to the share service and return its unlisted public URL.
 *  Protocol (see apps/website/app/api/share): POST meta -> {id, token, url};
 *  PUT each file under that id with the token; POST finalize. */
export async function uploadShare(
  outDir: string,
  apiBase = process.env.ROVEFLOW_SHARE_API ?? "https://roveflow.dev/api/share",
  log: (s: string) => void = () => {},
): Promise<{ url: string; id: string }> {
  ensureAtlas(outDir);
  const m = readManifest(outDir);
  const entries = collectEntries(outDir);
  const meta = {
    app: m.app ?? "App",
    platform: m.platform ?? "ios",
    subtitle: m.subtitle ?? "",
    screens: Object.keys(m.screens ?? {}).length,
    paths: (m.journeys ?? []).length,
    steps: (m.journeys ?? []).reduce((a: number, j: any) => a + (j.flow?.length ?? 0), 0),
    files: entries.map((e) => e.name),
  };

  const init = await fetch(apiBase, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(meta),
  });
  if (!init.ok) throw new Error(`share init failed (${init.status}): ${await init.text()}`);
  const { id, token, url } = (await init.json()) as { id: string; token: string; url: string };

  let done = 0;
  for (const e of entries) {
    const put = await fetch(`${apiBase}/${id}/${e.name}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType(e.name) },
      body: new Uint8Array(e.data),
    });
    if (!put.ok) throw new Error(`upload ${e.name} failed (${put.status})`);
    log(`uploaded ${++done}/${entries.length} ${e.name}`);
  }

  const fin = await fetch(`${apiBase}/${id}/finalize`, {
    method: "POST", headers: { authorization: `Bearer ${token}` },
  });
  if (!fin.ok) throw new Error(`finalize failed (${fin.status}): ${await fin.text()}`);
  return { url, id };
}

// WDA signing + (un)install lifecycle. Roveflow can discover the right
// provisioning profile + signing identity and run the install, but it CANNOT
// export your private key (Claude Code blocks that). `keygen` prints the one
// command you run yourself to produce the single-identity p12.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ios, udid } from "./ios.js";

const WDA_BUNDLE = process.env.ROVEFLOW_WDA_BUNDLE ?? "com.facebook.WebDriverAgentRunner.xctrunner";
const OUT = process.env.ROVEFLOW_OUT ?? path.resolve("roveflow-out");
const P12 = path.join(OUT, "wda-signing.p12");
const PROFILE = path.join(OUT, "wda.mobileprovision");
const PROFILE_DIRS = [
  path.join(os.homedir(), "Library/Developer/Xcode/UserData/Provisioning Profiles"),
  path.join(os.homedir(), "Library/MobileDevice/Provisioning Profiles"),
];

let _seq = 0;
function decode(file: string): { appId: string; hasDevice: boolean; cn: string } | null {
  try {
    const tmp = path.join(os.tmpdir(), `rf-prof-${_seq++}.plist`);
    execSync(`security cms -D -i ${JSON.stringify(file)} > ${JSON.stringify(tmp)} 2>/dev/null`);
    const plistText = execSync(`cat ${JSON.stringify(tmp)}`, { encoding: "utf8" });
    const raw = (k: string) => {
      try { return execFileSync("plutil", ["-extract", k, "raw", "-o", "-", tmp], { encoding: "utf8" }).trim(); }
      catch { return ""; }
    };
    const appId = raw("Entitlements.application-identifier");
    const hasDevice = plistText.includes(udid());        // device UUIDs are listed verbatim
    const certB64 = raw("DeveloperCertificates.0");
    let cn = "";
    if (certB64) {
      try {
        const subj = execSync(`echo ${JSON.stringify(certB64)} | base64 -d | openssl x509 -inform DER -noout -subject 2>/dev/null`, { encoding: "utf8" });
        cn = (subj.match(/CN ?= ?([^,/\n]+)/) || [])[1]?.trim() ?? "";
      } catch { /* */ }
    }
    return { appId, hasDevice, cn };
  } catch { return null; }
}

/** Find a profile that includes this device; prefer a wildcard (`TEAM.*`) app id. */
export function findProfile(): { path: string; appId: string; cn: string } | null {
  const u = udid();
  const cands: { path: string; appId: string; cn: string; wild: boolean }[] = [];
  for (const dir of PROFILE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".mobileprovision"))) {
      const full = path.join(dir, f);
      const d = decode(full);
      if (d && d.hasDevice && d.appId) cands.push({ path: full, appId: d.appId, cn: d.cn, wild: d.appId.endsWith(".*") });
    }
  }
  cands.sort((a, b) => Number(b.wild) - Number(a.wild));
  return cands[0] ?? null;
}

/** Find any installed WebDriverAgent runner, whoever signed it (Roveflow's own
 *  signing keeps Facebook's id; a Sideloadly/AltStore free-sign uses the user's
 *  team, e.g. com.<them>.WebDriverAgentRunner.xctrunner). Returns the bundle id. */
export function detectInstalledWda(): string | null {
  const out = ios(["apps", "--list"], { quiet: true });
  const m = out.match(/[\w.-]*WebDriverAgentRunner[\w.-]*xctrunner/i);
  return m ? m[0] : null;
}

export function wdaInstalled(): boolean {
  return detectInstalledWda() !== null;
}

/** Package the prebuilt WDA runner as an unsigned .ipa that the user can sign
 *  with Sideloadly / AltStore (free Apple ID) — no Xcode, no Roveflow ever
 *  touching their password. Returns the .ipa path. */
export function exportWda(): string {
  const appPath = downloadWdaApp();
  mkdirSync(OUT, { recursive: true });
  const work = path.join(OUT, "wda-export");
  execSync(`rm -rf ${JSON.stringify(work)} && mkdir -p ${JSON.stringify(path.join(work, "Payload"))}`);
  execSync(`cp -R ${JSON.stringify(appPath)} ${JSON.stringify(path.join(work, "Payload") + "/")}`);
  // strip debug symbols (Roveflow's own signer drops these too)
  execSync(`find ${JSON.stringify(path.join(work, "Payload"))} -name "*.dSYM" -prune -exec rm -rf {} +`);
  const ipa = path.join(OUT, "WebDriverAgent.ipa");
  execSync(`rm -f ${JSON.stringify(ipa)} && cd ${JSON.stringify(work)} && zip -qry ${JSON.stringify(ipa)} Payload`);
  return ipa;
}

export function uninstall(opts: { full?: boolean } = {}): void {
  console.log("Roveflow uninstall\n──────────────────");
  for (const p of ["ios runwda", "ios forward", "ios tunnel"]) {
    try { execSync(`pkill -f ${JSON.stringify(p)}`, { stdio: "ignore" }); } catch { /* */ }
  }
  console.log("• stopped tunnel / WDA / forward");
  const installed = detectInstalledWda();
  if (installed) { ios(["uninstall", installed], { quiet: true }); console.log(`• uninstalled ${installed} from device`); }
  else console.log("• WebDriverAgent was not installed");
  for (const f of [P12, PROFILE, path.join(OUT, "_all-identities.p12")]) if (existsSync(f)) { execSync(`rm -f ${JSON.stringify(f)}`); console.log(`• removed ${path.basename(f)}`); }
  console.log("✓ uninstalled.");
}

const NEW_DEV_HELP =
  "WebDriverAgent isn't signed for this iPhone yet (one-time, per Apple's rules).\n" +
  "  Easiest (no Xcode): run `roveflow export-wda`, sign the .ipa with Sideloadly or\n" +
  "  AltStore using a free Apple ID, then re-run `roveflow setup` (it auto-detects it).\n" +
  "  Or with Xcode: Settings → Accounts → add your Apple ID → Run a throwaway app to\n" +
  "  this iPhone once, then re-run `roveflow setup`.";

/** Resolve the codesign identity (SHA-1) for the cert id, e.g. "66NN76CBQ2". */
function codesignSha1(certId: string): string {
  const out = execSync("security find-identity -v -p codesigning", { encoding: "utf8" });
  for (const line of out.split("\n")) {
    if (line.includes(certId)) { const m = line.match(/\b([0-9A-Fa-f]{40})\b/); if (m) return m[1]; }
  }
  throw new Error(`Signing identity for ${certId} not found in your keychain.\n  ${NEW_DEV_HELP}`);
}

/** Download the prebuilt WDA runner and return the .app path. */
function downloadWdaApp(): string {
  const out = ios(["ui", "download"], { quiet: true });
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const e = (j.downloaded ?? []).find((x: any) => x.target === "wda");
  if (!e?.appPath) throw new Error("could not locate the downloaded WDA app");
  return e.appPath;
}

/** Concrete entitlements for one bundle under a development (wildcard) profile. */
function entitlementsXml(team: string, bundleId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>application-identifier</key><string>${team}.${bundleId}</string>
  <key>com.apple.developer.team-identifier</key><string>${team}</string>
  <key>get-task-allow</key><true/>
  <key>keychain-access-groups</key><array><string>${team}.*</string></array>
</dict></plist>`;
}

function bundleId(infoPlist: string): string {
  return execSync(`plutil -extract CFBundleIdentifier raw ${JSON.stringify(infoPlist)}`, { encoding: "utf8" }).trim();
}

/** Sign WDA in place with one keychain identity (no p12 export), then install.
 *  Each nested bundle is signed with its own CONCRETE application-identifier. */
function signAndInstall(appPath: string, sha1: string, team: string): void {
  copyFileSync(PROFILE, path.join(appPath, "embedded.mobileprovision"));
  const A = JSON.stringify(appPath);
  // drop debug symbols BEFORE signing (so the app seal doesn't include them)
  execSync(`rm -rf ${A}/PlugIns/*.dSYM`);
  console.log('  ↳ macOS may ask to sign with your key — click "Always Allow" (once).');
  // 1) nested frameworks / dylibs, deepest first (no entitlements)
  execSync(`find ${A} \\( -name "*.framework" -o -name "*.dylib" \\) -print0 | while IFS= read -r -d '' f; do codesign -f -s ${sha1} --timestamp=none "$f"; done`, { stdio: ["ignore", "ignore", "inherit"] });
  // 2) the .xctest plugin, with ITS concrete app-id
  const xctest = execSync(`ls -d ${A}/PlugIns/*.xctest 2>/dev/null | head -1`, { encoding: "utf8" }).trim();
  if (xctest) {
    const xe = path.join(OUT, "xctest.entitlements");
    writeFileSync(xe, entitlementsXml(team, bundleId(path.join(xctest, "Info.plist"))));
    execSync(`codesign -f -s ${sha1} --timestamp=none --entitlements ${JSON.stringify(xe)} ${JSON.stringify(xctest)}`, { stdio: ["ignore", "ignore", "inherit"] });
  }
  // 3) the runner app, with its concrete app-id
  const ae = path.join(OUT, "app.entitlements");
  writeFileSync(ae, entitlementsXml(team, bundleId(path.join(appPath, "Info.plist"))));
  execSync(`codesign -f -s ${sha1} --timestamp=none --entitlements ${JSON.stringify(ae)} ${A}`, { stdio: ["ignore", "ignore", "inherit"] });
  execSync(`codesign --verify --strict ${A}`, { stdio: ["ignore", "ignore", "inherit"] }); // local sanity check
  // 4) install (capture stderr — go-ios logs the real reason there)
  let out = "";
  try { out = execSync(`ios install --path=${A} 2>&1`, { encoding: "utf8" }); }
  catch (e: any) { out = (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? ""); }
  if (!wdaInstalled()) throw new Error("install rejected:\n  " + out.split("\n").filter((l) => l.includes("ERROR") || l.includes("err")).slice(-3).join("\n  ") || out.slice(-400));
}

/** Diagnostic: report which profile/identity Roveflow will sign WDA with. */
export function keygen(): void {
  const prof = findProfile();
  console.log("Roveflow signing\n────────────────");
  if (!prof) { console.log("✗ " + NEW_DEV_HELP); return; }
  console.log(`• profile:  ${prof.appId} (covers this device)`);
  console.log(`• identity: ${prof.cn}`);
  console.log("`roveflow setup` signs + installs WDA automatically with this identity —");
  console.log("one macOS “Always Allow” + the on-device passcode, nothing else.");
}

/** One call: discover profile → codesign WDA with that one identity → install. */
export function installWda(): void {
  if (wdaInstalled()) { console.log("• WebDriverAgent already installed."); return; }
  const prof = findProfile();
  if (!prof) throw new Error(NEW_DEV_HELP);
  mkdirSync(OUT, { recursive: true });
  copyFileSync(prof.path, PROFILE);
  const certId = (prof.cn.match(/\(([^)]+)\)/) || [])[1] ?? prof.cn;
  const team = prof.appId.split(".")[0];
  const sha1 = codesignSha1(certId);
  console.log(`• signing WebDriverAgent with “${prof.cn}” (key stays in your keychain) …`);
  signAndInstall(downloadWdaApp(), sha1, team);
  console.log("• WebDriverAgent installed.");
}

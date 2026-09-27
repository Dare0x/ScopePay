// Records real ScopePay sessions on Arbitrum Sepolia as HD clips for the demo video:
// a visible cursor with a click ripple, human-speed typing, eased mouse moves and
// scrolls, and a real wallet (tools/wallet-shim.mjs with the demo keys in ../.env)
// that signs every transaction you see. Frames come from Chrome's screencast and are
// stitched to constant 30 fps; each clip also writes <clip>.json with its cue times.
//   node record.mjs              all clips
//   node record.mjs story claim  some clips
// SITE defaults to the local preview (npm start), which serves the same files as production.
import puppeteer from "puppeteer-core";
import { ethers } from "ethers";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installWallet } from "./wallet-shim.mjs";
import { NETWORK, readEnv } from "../scripts/network.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG = process.env.FFMPEG || "C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe";
const OUT = process.env.OUT || join(import.meta.dirname, "recordings");
mkdirSync(OUT, { recursive: true });
// LOCAL=1 rehearses on the Ganache chain from local-chain.mjs (serve it with SCOPEPAY_CONFIG_DIR=tools/local PORT=4174).
const LOCAL = !!process.env.LOCAL;
const local = LOCAL ? JSON.parse(readFileSync(join(import.meta.dirname, "local", "contract.json"), "utf8")) : null;
const net = LOCAL ? local.network : NETWORK;
const env = readEnv();
const GANACHE = "myth like bonus scare over problem client lizard pioneer submit female collect";
const keyAt = (i) => ethers.HDNodeWallet.fromPhrase(GANACHE, undefined, `m/44'/60'/0'/0/${i}`).privateKey;
const keys = LOCAL ? { client: keyAt(0), worker: keyAt(1), arbiter: keyAt(2) } : { client: env.CLIENT_KEY, worker: env.WORKER_KEY, arbiter: env.ARBITER_KEY };
const accounts = Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, new ethers.Wallet(key).address]));
const demo = JSON.parse(readFileSync(LOCAL ? join(import.meta.dirname, "local", "demo-deals.json") : join(import.meta.dirname, "..", "deployments", "demo-deals.json"), "utf8")).deals;
const SITE_URL = process.env.SITE || (LOCAL ? "http://localhost:4174" : "http://localhost:4173");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// Cursor overlay injected into every document.
const CURSOR = () => {
  const init = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="24" height="24" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25 L16.5 23.5 L13 15.8 L20 15.8 Z" fill="#ffffff" stroke="#0d0e0c" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0px", top: "0px", width: "24px", height: "24px", zIndex: 2147483647, pointerEvents: "none", marginLeft: "-4px", marginTop: "-2px", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.55))" });
    const r = document.createElement("div");
    r.id = "__rip";
    Object.assign(r.style, { position: "fixed", width: "36px", height: "36px", marginLeft: "-18px", marginTop: "-18px", borderRadius: "50%", border: "2px solid rgba(197,240,74,.95)", zIndex: 2147483646, pointerEvents: "none", opacity: "0" });
    document.documentElement.append(r, c);
    const xy = window.__startXY || [900, 520];
    c.style.left = xy[0] + "px";
    c.style.top = xy[1] + "px";
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px";
      r.animate([{ opacity: 1, transform: "scale(.35)" }, { opacity: 0, transform: "scale(1.5)" }], { duration: 480, easing: "ease-out" });
      c.animate([{ transform: "scale(1)" }, { transform: "scale(.86)" }, { transform: "scale(1)" }], { duration: 220 });
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
};

async function session(name, run) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
    args: ["--hide-scrollbars", "--window-size=1280,720", "--force-color-profile=srgb", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  let pos = [900, 520];
  await page.evaluateOnNewDocument(CURSOR);
  await page.evaluateOnNewDocument((xy) => { window.__startXY = xy; }, pos);
  const provider = new ethers.JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true });
  const clockOffset = LOCAL ? Number((await provider.getBlock("latest")).timestamp) - Math.floor(Date.now() / 1000) : 0;
  const wallet = await installWallet(page, { rpc: net.rpc, chainId: net.chainId, accounts, keys, clockOffset });
  const marks = [];
  const a = {
    page, wallet, sleep,
    mark(n) { marks.push({ n, t: Date.now() / 1000 }); },
    async goto(path) {
      await page.goto(`${SITE_URL}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 30000 });
      await page.evaluate((xy) => { window.__startXY = xy; }, pos);
      await page.mouse.move(pos[0], pos[1]);
      await sleep(600);
    },
    async moveTo(x, y, ms = 900) {
      const [x0, y0] = pos;
      const n = Math.max(2, Math.round(ms / 16));
      for (let i = 1; i <= n; i++) { const k = ease(i / n); await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k); await sleep(16); }
      pos = [x, y];
    },
    async box(sel) { return page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.top, r.bottom]; }); },
    async moveToSel(sel, ms = 900, dx = 0, dy = 0) {
      await page.$eval(sel, (e) => e.scrollIntoView({ block: "nearest" }));
      const [x, y] = await a.box(sel);
      await a.moveTo(x + dx, y + dy, ms);
    },
    async click(ms = 110) { await page.mouse.down(); await sleep(ms); await page.mouse.up(); },
    async clickSel(sel, ms = 900) { await a.moveToSel(sel, ms); await sleep(120); await a.click(); },
    async actionButton(label) {
      const handle = await page.waitForFunction((label) => [...document.querySelectorAll("#moveActions button")].find((b) => b.textContent.includes(label) && !b.disabled), { timeout: 30000 }, label);
      const [x, y] = await handle.evaluate((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await a.moveTo(x, y, 850); await sleep(150); await a.click();
    },
    async type(text, delay = 70) { for (const ch of text) { await page.keyboard.type(ch); await sleep(delay + Math.round(25 * Math.sin(ch.charCodeAt(0)))); } },
    async replace(sel, text, delay = 90) { await a.clickSel(sel, 500); await page.$eval(sel, (e) => e.select()); await sleep(120); await a.type(text, delay); },
    async scrollTo(y, ms = 1300) {
      await page.evaluate((to, dur) => new Promise((res) => {
        const s = scrollY, d = to - s, t0 = performance.now();
        const e = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
        const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); scrollTo(0, s + d * e(k)); k < 1 ? requestAnimationFrame(step) : res(); };
        requestAnimationFrame(step);
      }), y, ms);
    },
    async scrollToSel(sel, offset = 90, ms = 1300) { const top = await page.$eval(sel, (e) => e.getBoundingClientRect().top + scrollY); await a.scrollTo(Math.max(0, top - offset), ms); },
    async waitTx() {
      await page.waitForFunction(() => /: done|cancelled|Too early|isn't allowed|changed before|went wrong|failed|needs a little/i.test(document.querySelector("#txStatus")?.textContent || ""), { timeout: 90000 });
      const text = await page.$eval("#txStatus", (e) => e.textContent);
      if (!/: done/.test(text)) throw new Error(`${name}: transaction did not finish: ${text}`);
    },
    async as(role) {
      wallet.connectSilently();
      if (page.url() === "about:blank") { wallet.state.role = role; return; }
      await wallet.use(role);
      await sleep(700);
    },
  };

  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => { frames.push({ data: f.data, t: f.metadata.timestamp }); await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await run.prepare?.(a);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
  const started = Date.now();
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  try { await run.act(a); } catch (error) {
    await page.screenshot({ path: join(OUT, `${name}-error.png`) }).catch(() => {});
    const seen = await page.evaluate(() => ({ tx: document.querySelector("#txStatus")?.textContent, toast: document.querySelector("#toast")?.textContent, notice: document.querySelector("#notice")?.textContent, dialogs: [...document.querySelectorAll("dialog[open]")].map((d) => d.id) })).catch(() => ({}));
    console.error(`✖ ${name}:`, error.message, seen, logs.slice(-8), wallet.state.sent);
    throw error;
  } finally {
    await sleep(1200);
    await cdp.send("Page.stopScreencast").catch(() => {});
    await browser.close();
  }

  const dir = join(OUT, `${name}-frames`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let list = "";
  frames.forEach((f, i) => {
    const file = join(dir, `${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    const d = i + 1 < frames.length ? Math.max(0.001, frames[i + 1].t - f.t) : 1.0;
    list += `file '${file.replace(/\\/g, "/")}'\nduration ${d.toFixed(4)}\n`;
  });
  list += `file '${join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`).replace(/\\/g, "/")}'\n`;
  writeFileSync(join(dir, "list.txt"), list);
  execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", "fps=30,scale=2560:1440:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", join(OUT, `${name}.mp4`)]);
  rmSync(dir, { recursive: true, force: true });
  const cues = Object.fromEntries(marks.map((m) => [m.n, Math.round((m.t - frames[0].t) * 1000) / 1000]));
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ ...cues, sent: wallet.state.sent }, null, 2));
  console.log(`✓ ${name}.mp4  ${frames.length} frames, ${((Date.now() - started) / 1000).toFixed(1)}s`, cues);
}

const clips = {
  // Client funds a new deal from the form, freelancer delivers, client approves.
  story: {
    async prepare(a) { await a.as("client"); await a.goto(`/?deal=${demo.completed}`); await a.scrollTo(0, 10); },
    async act(a) {
      a.mark("start");
      await a.sleep(500);
      await a.clickSel("#newDealButton", 800);
      await a.page.waitForSelector("#newDealDialog[open]");
      a.mark("form");
      await a.sleep(700);
      await a.clickSel("#ndWorker", 600); await a.type(accounts.worker, 11);
      await a.clickSel("#ndArbiter", 500); await a.type(accounts.arbiter, 11);
      a.mark("token");
      await a.moveToSel("#ndToken", 500);
      await a.sleep(700);
      a.mark("amounts");
      const amounts = ["1.5", "2", "1.5"];
      for (let i = 0; i < 3; i++) await a.replace(`#ndMilestones .ms-row:nth-child(${i + 1}) .ms-amount`, amounts[i], 90);
      await a.sleep(300);
      await a.clickSel("#ndSubmit", 700);
      a.mark("lock");
      await a.waitTx();
      a.mark("funded");
      await a.sleep(900);
      await a.scrollToSel("#deal", 80, 900);
      await a.sleep(1500);

      a.mark("worker");
      await a.as("worker");
      await a.sleep(500);
      await a.actionButton("Submit delivery");
      await a.page.waitForSelector("#submitDialog[open]");
      await a.sleep(300);
      await a.clickSel("#sdText", 400);
      await a.type("Design direction v2: homepage, menu and order flow.", 16);
      await a.sleep(250);
      await a.clickSel("#sdSubmit", 600);
      a.mark("submit");
      await a.waitTx();
      a.mark("delivered");
      await a.sleep(1800);

      a.mark("client");
      await a.as("client");
      await a.sleep(400);
      await a.actionButton("Approve and pay");
      await a.page.waitForSelector("#approveDialog[open]");
      await a.sleep(500);
      await a.clickSel("#adSubmit", 600);
      a.mark("release");
      await a.waitTx();
      a.mark("paid");
      await a.moveTo(520, 250, 800);
      await a.sleep(2200);
      a.mark("end");
    },
  },
  // Client went quiet past the review window: the freelancer claims.
  claim: {
    async prepare(a) { await a.as("worker"); await a.goto(`/?deal=${demo.claim}`); await a.scrollToSel("#deal", 80, 10); },
    async act(a) {
      a.mark("start");
      await a.sleep(2000);
      await a.actionButton("Claim");
      a.mark("click");
      await a.waitTx();
      a.mark("claimed");
      await a.sleep(1200);
      await a.moveTo(430, 420, 800);
      await a.sleep(2400);
      a.mark("end");
    },
  },
  // Freelancer missed the due date: the client takes back what's left.
  reclaim: {
    async prepare(a) { await a.as("client"); await a.goto(`/?deal=${demo.overdue}`); await a.scrollToSel("#deal", 80, 10); },
    async act(a) {
      a.mark("start");
      await a.sleep(1800);
      await a.actionButton("Reclaim");
      a.mark("click");
      await a.waitTx();
      a.mark("reclaimed");
      await a.sleep(3000);
      a.mark("end");
    },
  },
  // The arbiter splits a disputed milestone.
  arbiter: {
    async prepare(a) { await a.as("arbiter"); await a.goto(`/?deal=${demo.arbiter}`); await a.scrollToSel("#deal", 80, 10); },
    async act(a) {
      a.mark("start");
      await a.sleep(1300);
      await a.actionButton("Settle the dispute");
      await a.page.waitForSelector("#resolveDialog[open]");
      await a.sleep(700);
      await a.replace("#rdAmount", "1.25", 110);
      await a.sleep(600);
      await a.clickSel("#rdSubmit", 700);
      a.mark("settle");
      await a.waitTx();
      a.mark("settled");
      await a.sleep(3200);
      a.mark("end");
    },
  },
  // A frozen deal with the arbiter's 14-day clock running.
  frozen: {
    async prepare(a) { await a.goto(`/?deal=${demo.frozen}`); await a.scrollToSel("#deal", 80, 10); },
    async act(a) {
      a.mark("start");
      await a.moveToSel("#moveClock", 1200);
      await a.sleep(3500);
      a.mark("end");
    },
  },
  // The freelancer's portable work record, then every deal on the contract.
  record: {
    async prepare(a) { await a.goto(`/?deal=${demo.completed}`); await a.scrollToSel("#deal", 80, 10); },
    async act(a) {
      a.mark("start");
      await a.sleep(600);
      await a.clickSel("#openWorkerRecord", 900);
      await a.page.waitForFunction(() => !document.querySelector("#recordList").textContent.includes("Reading"), { timeout: 30000 });
      a.mark("record");
      await a.sleep(2600);
      await a.scrollToSel("#recordList", 160, 1400);
      await a.sleep(2200);
      a.mark("deals");
      await a.scrollToSel("#deals", 80, 1600);
      await a.sleep(2600);
      a.mark("end");
    },
  },
};

const pick = process.argv.slice(2);
for (const [name, run] of Object.entries(clips)) {
  if (pick.length && !pick.includes(name)) continue;
  await session(name, run);
}

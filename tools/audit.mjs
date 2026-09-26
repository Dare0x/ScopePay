// Walks every ScopePay screen in a clean Chrome profile at desktop and phone
// widths: full-page screenshots, open panels and dialogs, console errors,
// toasts, and anything wider than the viewport.
//   node audit.mjs [baseUrl] [outDir]
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.argv[2] || "http://localhost:4173";
const OUT = process.argv[3] || join(process.cwd(), "audit-out");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
const log = (...a) => { const line = a.join(" "); report.push(line); console.log(line); };

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false },
  { name: "phone", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2, hasTouch: true },
];

async function overflow(page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > w + 1 || r.left < -1) && getComputedStyle(el).position !== "fixed") {
        wide.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} [${Math.round(r.left)}..${Math.round(r.right)}]`);
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: w, wide: wide.slice(0, 12) };
  });
}

async function toastText(page) {
  return page.$eval("#toast", (t) => (t.classList.contains("show") ? t.textContent : "")).catch(() => "");
}

async function shot(page, name, full = false) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
}

async function run(vp) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport(vp);
  const errors = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) errors.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

  const t0 = Date.now();
  await page.goto(`${BASE}/?deal=0`, { waitUntil: "domcontentloaded" });
  await sleep(150);
  log(`[${vp.name}] first paint crumb:`, await page.$eval("#dealCrumb", (e) => e.textContent));
  await shot(page, `${vp.name}-00-first-paint`);
  await page.waitForFunction(() => document.querySelector("#dealCrumb")?.textContent.includes("LIVE"), { timeout: 30000 }).catch(() => log("  deal never loaded"));
  log(`[${vp.name}] live deal loaded after ${Date.now() - t0} ms`);
  await sleep(800);
  await shot(page, `${vp.name}-01-home`, true);
  log(`[${vp.name}] overflow:`, JSON.stringify(await overflow(page)));
  log(`[${vp.name}] page text:`, (await page.$eval("main", (m) => m.innerText)).replace(/\s+/g, " ").slice(0, 1800));

  // Activity panel
  await page.click("#activityNav");
  await sleep(1200);
  await shot(page, `${vp.name}-02-activity`);
  log(`[${vp.name}] activity:`, (await page.$eval("#activityList", (m) => m.innerText)).replace(/\s+/g, " "));

  // Records panel
  await page.click("#passportNav");
  await page.waitForFunction(() => !document.querySelector("#passportDeals").innerText.includes("Reading"), { timeout: 30000 }).catch(() => log("  records never loaded"));
  await sleep(800);
  await shot(page, `${vp.name}-03-records`);
  log(`[${vp.name}] records:`, (await page.$eval("#passportPanel", (m) => m.innerText)).replace(/\s+/g, " "));
  log(`[${vp.name}] overflow w/ panels:`, JSON.stringify(await overflow(page)));

  // Dialogs
  for (const [btn, dlg] of [["#setupButton", "setupDialog"], ["#loadDealButton", "loadDealDialog"], ["#copyLink", "shareDialog"]]) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.click(btn);
    await sleep(700);
    const open = await page.$eval(`#${dlg}`, (d) => d.open);
    log(`[${vp.name}] ${btn} -> ${dlg} open=${open} toast="${await toastText(page)}"`);
    await shot(page, `${vp.name}-dlg-${dlg}`);
    await page.evaluate((id) => document.getElementById(id).close(), dlg);
  }
  await page.click("#copyProofLink");
  await sleep(700);
  log(`[${vp.name}] copyProofLink open=${await page.$eval("#shareDialog", (d) => d.open)} toast="${await toastText(page)}"`);
  await shot(page, `${vp.name}-dlg-proof`);
  await page.evaluate(() => document.getElementById("shareDialog").close());
  await page.click("#newDealButton");
  await sleep(700);
  log(`[${vp.name}] newDeal (no wallet) toast="${await toastText(page)}" dialogOpen=${await page.$eval("#newDealDialog", (d) => d.open)}`);
  await page.click("#walletButton");
  await sleep(700);
  log(`[${vp.name}] connect (no wallet) toast="${await toastText(page)}"`);

  // Worker record link, fresh profile
  const ctx = await browser.createBrowserContext();
  const p2 = await ctx.newPage();
  await p2.setViewport(vp);
  p2.on("pageerror", (e) => errors.push(`pageerror(worker): ${e.message}`));
  await p2.goto(`${BASE}/?worker=0x267b2e30C842abfb581B202037B79479d01d908D`, { waitUntil: "domcontentloaded" });
  await p2.waitForFunction(() => document.querySelector("#passportEarned")?.textContent !== "—", { timeout: 30000 }).catch(() => log("  worker link never loaded"));
  await sleep(1000);
  await shot(p2, `${vp.name}-04-worker-link`);
  log(`[${vp.name}] worker link:`, (await p2.$eval("#passportPanel", (m) => m.innerText)).replace(/\s+/g, " ").slice(0, 600));

  // Bad inputs
  const p3 = await ctx.newPage();
  await p3.setViewport(vp);
  await p3.goto(`${BASE}/?deal=99`, { waitUntil: "domcontentloaded" });
  await sleep(6000);
  log(`[${vp.name}] ?deal=99 crumb="${await p3.$eval("#dealCrumb", (e) => e.textContent)}" toast="${await toastText(p3)}"`);
  await shot(p3, `${vp.name}-05-missing-deal`);
  await p3.goto(`${BASE}/?contract=0x0000000000000000000000000000000000000001&deal=0`, { waitUntil: "domcontentloaded" });
  await sleep(6000);
  log(`[${vp.name}] bad contract crumb="${await p3.$eval("#dealCrumb", (e) => e.textContent)}" mode="${await p3.$eval("#modeLabel", (e) => e.textContent)}" toast="${await toastText(p3)}"`);
  await shot(p3, `${vp.name}-06-bad-contract`);
  // After visiting a bad contract, does the plain URL recover?
  await p3.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await sleep(7000);
  log(`[${vp.name}] plain URL after bad contract: crumb="${await p3.$eval("#dealCrumb", (e) => e.textContent)}" mode="${await p3.$eval("#modeLabel", (e) => e.textContent)}"`);

  log(`[${vp.name}] console/page errors:`, errors.length ? "\n  " + errors.join("\n  ") : "none");
  await browser.close();
}

for (const vp of VIEWPORTS) await run(vp);
writeFileSync(join(OUT, "report.txt"), report.join("\n"));

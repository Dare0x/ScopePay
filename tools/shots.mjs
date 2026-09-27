// Quick screenshots of the local app: node shots.mjs <outDir> [query] — desktop top + phone full page.
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { installWallet } from "./wallet-shim.mjs";

const OUT = process.argv[2];
const QUERY = process.argv[3] || "";
const BASE = process.env.BASE || "http://localhost:4174";
mkdirSync(OUT, { recursive: true });
const config = JSON.parse(readFileSync(join(import.meta.dirname, "local", "contract.json"), "utf8"));
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
for (const [name, vp, full] of [["desktop", { width: 1440, height: 900 }, false], ["phone", { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }, true]]) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await installWallet(page, { rpc: config.network.rpc, chainId: config.network.chainId, accounts: config.local.accounts, clockOffset: config.local.clockOffset });
  await page.goto(`${BASE}/${QUERY}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  await page.close();
}
await browser.close();

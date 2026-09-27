// Measures element boxes (CSS px) in the 1280x720 recording viewport for camera targets.
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installWallet } from "./wallet-shim.mjs";
const config = JSON.parse(readFileSync(join(import.meta.dirname, "local", "contract.json"), "utf8"));
const demo = JSON.parse(readFileSync(join(import.meta.dirname, "local", "demo-deals.json"), "utf8")).deals;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", defaultViewport: { width: 1280, height: 720 } });
const page = await browser.newPage();
const wallet = await installWallet(page, { rpc: config.network.rpc, chainId: config.network.chainId, accounts: config.local.accounts });
wallet.connectSilently();
const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }).catch(() => null);
const show = async (label, sels) => { const o = {}; for (const s of sels) o[s] = await box(s); console.log(label, JSON.stringify(o)); };
await page.goto(`http://localhost:4174/?deal=${demo.completed}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"));
await new Promise((r) => setTimeout(r, 800));
await page.click("#newDealButton"); await page.waitForSelector("#newDealDialog[open]"); await new Promise((r) => setTimeout(r, 600));
await show("dialog", ["#newDealDialog", "#ndTitle", "#ndWorker", "#ndArbiter", "#ndToken", "#ndWindow", "#ndMilestones", ".ms-row:nth-child(1) .ms-amount", ".ms-row:nth-child(3) .ms-amount", "#ndSum", "#ndSubmit"]);
await page.evaluate(() => document.getElementById("newDealDialog").close());
for (const [name, id] of Object.entries({ completed: demo.completed, claim: demo.claim, arbiter: demo.arbiter, frozen: demo.frozen })) {
  await page.goto(`http://localhost:4174/?deal=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((id) => document.querySelector("#dealEyebrow")?.textContent.startsWith(`Deal #${id} `), {}, id);
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => { const top = document.querySelector("#deal").getBoundingClientRect().top + scrollY; scrollTo(0, top - 80); });
  await new Promise((r) => setTimeout(r, 300));
  await show(name, [".money", "#mPaid", "#milestones", "#milestones li:nth-child(1)", "#milestones li:nth-child(2)", "#moveCard", "#moveTitle", "#moveClock", "#moveActions", "#history", ".terms"]);
}
await page.evaluate(() => { const top = document.querySelector("#deals").getBoundingClientRect().top + scrollY; scrollTo(0, top - 80); });
await show("deals", [".deal-table", "#dealRows tr:nth-child(1)"]);
await browser.close();

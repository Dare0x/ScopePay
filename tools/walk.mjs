// Clicks through every ScopePay flow against the local test chain, as each role,
// saving screenshots and failing loudly on console errors or wrong outcomes.
//   node local-chain.mjs &   SCOPEPAY_CONFIG_DIR=tools/local PORT=4174 npm start &   node walk.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { installWallet } from "./wallet-shim.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE || "http://localhost:4174";
const OUT = process.argv[2] || join(import.meta.dirname, "audit-out");
mkdirSync(OUT, { recursive: true });
const config = JSON.parse(readFileSync(join(import.meta.dirname, "local", "contract.json"), "utf8"));
const { accounts, deals, clockOffset } = config.local;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (ok, message) => { console.log(`${ok ? "  ok " : "  FAIL"} ${message}`); if (!ok) failures.push(message); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
const wallet = await installWallet(page, { rpc: config.network.rpc, chainId: config.network.chainId, accounts, clockOffset });

const text = (sel) => page.$eval(sel, (e) => e.innerText.replace(/\s+/g, " ").trim()).catch(() => "");
const shot = async (name, full = false) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
async function open(id) {
  await page.goto(`${BASE}/?deal=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((id) => document.querySelector("#dealEyebrow")?.textContent.startsWith(`Deal #${id} `), { timeout: 20000 }, id);
  await sleep(400);
}
async function act(label) {
  const buttons = await page.$$("#moveActions button");
  for (const b of buttons) if ((await b.evaluate((e) => e.textContent)).includes(label)) { await b.click(); return true; }
  check(false, `no "${label}" button (have: ${await text("#moveActions")})`);
  return false;
}
async function waitTx() {
  await page.waitForFunction(() => /: done|cancelled|Too early|isn't allowed|changed before|went wrong|failed/i.test(document.querySelector("#txStatus")?.innerText || ""), { timeout: 30000 });
  await sleep(500);
  return text("#txStatus");
}
async function scrollTo(sel) { await page.$eval(sel, (e) => e.scrollIntoView({ block: "start" })); await sleep(350); }

console.log("Guest view");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await sleep(120);
check(!(await text("#dealTitle")).includes("storefront"), "no fake demo deal on first paint");
await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 20000 });
await sleep(800);
await shot("01-guest-home", true);
check((await text("#dealEyebrow")).startsWith(`Deal #${deals.review} `), "featured deal opens by default");
check((await text("#dealRows")).split("#").length - 1 >= 7, "all seeded deals listed");
check((await text("#moveFine")).includes("Connect"), "guest is told how to act");

for (const [name, id] of Object.entries(deals)) {
  await open(id);
  await scrollTo("#deal");
  await shot(`02-deal-${name}`);
  console.log(`  ${name}: ${await text("#dealEyebrow")} | ${await text("#moveTitle")} | ${await text("#moveClock")}`);
}
await open(deals.split);
check((await text("#milestones")).includes("Split · 30.00 paid · 15.00 returned"), "disputed milestone shows its own split, not the whole refund");
check((await text("#mReturned")).startsWith("35.00"), "returned total = rest of milestone + future milestone");

console.log("Client approves a delivery");
await open(deals.review);
await page.click("#walletButton");
await page.waitForFunction(() => document.querySelector("#walletButton").innerText.includes("Client"), { timeout: 10000 });
check((await text("#moveEyebrow")).includes("Client"), "client sees their move");
await scrollTo("#deal");
await shot("03-client-review");
await act("Approve and pay");
await page.waitForSelector("#approveDialog[open]");
await shot("04-approve-dialog");
await page.click("#adSubmit");
check((await waitTx()).includes("done"), "approval confirmed");
check((await text("#milestones")).includes("Paid on approval"), "milestone 1 shows paid");
await shot("05-after-approve");

console.log("Freelancer delivers milestone 2");
await wallet.use("worker");
await page.waitForFunction(() => document.querySelector("#walletButton").innerText.includes("Freelancer"), { timeout: 10000 });
check((await text("#moveTitle")).startsWith("Deliver"), "worker asked to deliver");
await act("Submit delivery");
await page.waitForSelector("#submitDialog[open]");
await page.type("#sdText", "https://staging.example.com/coffee-landing");
await page.click("#sdSubmit");
check((await waitTx()).includes("done"), "delivery confirmed");
check((await text("#milestones")).includes("Matches on-chain hash"), "own evidence verified against hash");
check((await text("#moveClock")).includes("review closes"), "review clock shown to worker");
await shot("06-after-deliver");

console.log("Freelancer claims after the client went quiet");
await open(deals.claimable);
check((await text("#moveTitle")).startsWith("Claim"), "claim offered once the window closed");
await act("Claim");
check((await waitTx()).includes("done"), "claim confirmed");
check((await text("#milestones")).includes("claimed after review window"), "claim labelled in milestones");
check((await text("#history")).includes("after the review window closed"), "claim labelled in history");
await shot("07-after-claim");

console.log("Client reclaims an overdue deal");
await wallet.use("client");
await open(deals.overdue);
check((await text("#moveTitle")).startsWith("Take back"), "reclaim offered when overdue");
await act("Reclaim");
check((await waitTx()).includes("done"), "reclaim confirmed");
check((await text("#dealEyebrow")).includes("Deadline missed"), "outcome says deadline missed");
await shot("08-after-reclaim");

console.log("Arbiter settles the frozen deal");
await wallet.use("arbiter");
await open(deals.frozen);
check((await text("#moveTitle")).startsWith("Decide"), "arbiter asked to decide");
await act("Settle the dispute");
await page.waitForSelector("#resolveDialog[open]");
await page.click('#rdQuick [data-share="50"]');
check((await text("#rdSplit")).includes("Freelancer gets 10.00 USDC"), "half button fills the split");
await shot("09-resolve-dialog");
await page.click("#rdSubmit");
check((await waitTx()).includes("done"), "resolution confirmed");
check((await text("#dealEyebrow")).includes("Arbiter decided"), "outcome says arbiter decided");
await shot("10-after-resolve");

console.log("Client cancels an unstarted deal");
await wallet.use("client");
await open(deals.fresh);
await act("Cancel and refund");
check((await waitTx()).includes("done"), "cancel confirmed");

console.log("Wrong wallet is told to switch");
await wallet.use("stranger");
await open(deals.review);
check((await text("#tRole")) === "Not a party", "stranger shown as not a party");
check((await text("#moveActions")) === "", "stranger gets no action buttons");

console.log("Client creates a new deal from the form");
await wallet.use("client");
await page.evaluate(() => window.scrollTo(0, 0));
await page.click("#newDealButton");
await page.waitForSelector("#newDealDialog[open]");
await sleep(600);
await page.$eval("#ndTitle", (e) => { e.value = ""; });
await page.type("#ndTitle", "Newsletter templates");
await page.type("#ndWorker", accounts.worker);
await page.type("#ndArbiter", accounts.arbiter);
await sleep(300);
await shot("11-new-deal-form");
await page.click("#ndSubmit");
check((await waitTx()).includes("done"), "new deal funded");
await sleep(800);
check((await text("#dealTitle")) === "Newsletter templates", "new deal opens with its readable title");
check((await text("#termsTag")) === "Verified", "creator's own terms verified");
await shot("12-new-deal", true);

console.log("Work record");
await page.click("#openWorkerRecord");
await page.waitForFunction(() => !document.querySelector("#recordList").innerText.includes("Reading"), { timeout: 15000 });
await sleep(700);
await scrollTo("#record");
await shot("13-work-record");
console.log("  " + (await text(".record-stats")));

console.log("Bad links");
await page.goto(`${BASE}/?deal=999`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 20000 });
check((await text("#notice")).includes("no deal #999"), "missing deal explained");
await page.goto(`${BASE}/?contract=0x0000000000000000000000000000000000000001`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 20000 });
check((await text("#notice")).includes("isn't a ScopePay v2 contract"), "bad contract explained and ignored");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#dealEyebrow")?.textContent.startsWith("Deal #"), { timeout: 20000 });
check((await text("#notice")) === "", "plain URL recovers after a bad link");

console.log("Phone layout");
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await open(deals.split);
await sleep(600);
await shot("14-phone-deal", true);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 0, `no sideways scroll on phones (overflow ${overflow}px)`);

check(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 5).join(" | ") : ""}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILURES` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);

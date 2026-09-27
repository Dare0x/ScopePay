// Puts the public demo deals on Arbitrum Sepolia with the three demo wallets in ../.env,
// and publishes their readable terms and delivery notes to dist/registry.json (the app
// checks every one of them against the hashes on-chain before calling it verified).
//   node seed-live.mjs gas       give the freelancer and arbiter wallets a little ETH for gas
//   node seed-live.mjs stories   create the demo deals (each one shows a different outcome)
//   node seed-live.mjs finish    fallback: the arbiter split, claim and reclaim if the recording didn't do them
//   node seed-live.mjs status    print balances and what has been done
import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { NETWORK, TOKENS, readEnv } from "../scripts/network.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
// SEED_TARGET=local rehearses everything on the Ganache chain from local-chain.mjs.
const LOCAL = process.env.SEED_TARGET === "local";
const local = LOCAL ? JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "local", "contract.json"), "utf8")) : null;
const net = LOCAL ? local.network : NETWORK;
const tokens = LOCAL ? local.tokens : TOKENS;
const deployment = LOCAL ? local.deployment : JSON.parse(fs.readFileSync(path.join(ROOT, "deployments", "arbitrum-sepolia.json"), "utf8"));
const abi = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "ScopePay.json"), "utf8")).abi;
const STATE_FILE = LOCAL ? path.join(import.meta.dirname, "local", "demo-deals.json") : path.join(ROOT, "deployments", "demo-deals.json");
const REGISTRY_FILE = LOCAL ? path.join(import.meta.dirname, "local", "registry.json") : path.join(ROOT, "dist", "registry.json");
const env = readEnv();
const provider = new ethers.JsonRpcProvider(net.rpc, net.chainId, { staticNetwork: true });
const GANACHE = "myth like bonus scare over problem client lizard pioneer submit female collect";
const keyFor = (role, i) => (LOCAL ? ethers.HDNodeWallet.fromPhrase(GANACHE, undefined, `m/44'/60'/0'/0/${i}`).privateKey : env[`${role}_KEY`]);
const wallets = Object.fromEntries(["CLIENT", "WORKER", "ARBITER"].map((r, i) => [r.toLowerCase(), new ethers.NonceManager(new ethers.Wallet(keyFor(r, i), provider))]));
const address = Object.fromEntries(["CLIENT", "WORKER", "ARBITER"].map((r, i) => [r.toLowerCase(), new ethers.Wallet(keyFor(r, i)).address]));
const escrow = (role) => new ethers.Contract(deployment.address, abi, wallets[role]);
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"];
const token = (symbol, role = "client") => new ethers.Contract(tokens.find((t) => t.symbol === symbol).address, ERC20, wallets[role]);
const u = (v) => ethers.parseUnits(String(v), 6);
const HOUR = 3600, DAY = 86400;

const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { contract: deployment.address, deals: {} };
const registryAll = fs.existsSync(REGISTRY_FILE) ? JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8")) : {};
const registry = (registryAll[deployment.address.toLowerCase()] ||= {});
function save() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registryAll, null, 2) + "\n");
}
async function send(label, promise) {
  const tx = await promise;
  const receipt = await tx.wait();
  console.log(`  ${label}: ${net.explorer}/tx/${receipt.hash}`);
  return receipt;
}

async function status() {
  for (const role of ["client", "worker", "arbiter"]) {
    const balances = await Promise.all(tokens.map((t) => new ethers.Contract(t.address, ERC20, provider).balanceOf(address[role])));
    console.log(role.padEnd(8), address[role], "ETH", ethers.formatEther(await provider.getBalance(address[role])), ...tokens.flatMap((t, i) => [t.symbol, ethers.formatUnits(balances[i], 6)]));
  }
  console.log("deals:", state.deals);
}

async function gas() {
  for (const role of ["worker", "arbiter"]) {
    const have = await provider.getBalance(address[role]);
    if (have >= ethers.parseEther("0.0015")) { console.log(`  ${role} already has ${ethers.formatEther(have)} ETH`); continue; }
    await send(`gas to ${role}`, wallets.client.sendTransaction({ to: address[role], value: ethers.parseEther("0.002") }));
  }
}

/** Creates a deal from the client wallet and records its public terms. */
async function create(key, { symbol, title, milestones, reviewWindow, dueIn }) {
  if (state.deals[key] !== undefined) { console.log(`  ${key} already exists as deal #${state.deals[key]}`); return state.deals[key]; }
  const now = Number((await provider.getBlock("latest")).timestamp);
  const amounts = milestones.map(([, a]) => u(a));
  const total = amounts.reduce((a, b) => a + b, 0n);
  const terms = { v: 2, title, token: symbol, milestones: milestones.map(([name, a]) => ({ name, amount: String(a) })) };
  const t = token(symbol);
  if ((await t.allowance(address.client, deployment.address)) < total) await send(`allow ${symbol}`, t.approve(deployment.address, total));
  const receipt = await send(`create "${title}"`, escrow("client").createDeal(t.target, address.worker, address.arbiter, amounts, dueIn.map((d) => now + Math.round(d)), reviewWindow, ethers.id(JSON.stringify(terms))));
  const event = receipt.logs.map((l) => { try { return escrow("client").interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "DealCreated");
  const id = Number(event.args.dealId);
  state.deals[key] = id;
  registry[id] = { terms, evidence: [] };
  save();
  return id;
}
async function deliver(id, index, text) {
  await send(`deliver #${id}.${index + 1}`, escrow("worker").submitMilestone(id, index, ethers.id(text)));
  registry[id].evidence = [...registry[id].evidence.filter((e) => e.milestone !== index), { milestone: index, text }];
  save();
}
const approve = (id, index) => send(`approve #${id}.${index + 1}`, escrow("client").approveMilestone(id, index));

async function stories() {
  const has = async (symbol, need) => (await token(symbol).balanceOf(address.client)) >= u(need);
  const alt = (await has("USDG", 10)) ? "USDG" : "USDC";
  if (alt === "USDC") console.log("  No USDG in the client wallet yet, so the USDG stories use USDC.");

  const shipped = await create("completed", {
    symbol: "USDC", title: "Checkout flow for a Lagos food store", reviewWindow: 3 * DAY, dueIn: [3 * DAY, 7 * DAY, 10 * DAY],
    milestones: [["Wireframes", 1], ["Working checkout", 2], ["Launch and handoff", 1.5]],
  });
  const notes = [
    "Wireframes v2: cart, delivery address, Paystack payment and receipt screens. Figma file shared with the client.",
    "Working checkout on staging: card and bank-transfer payments tested with 12 sample orders.",
    "Live on the store's domain. Handoff doc covers the admin panel, refunds and the order export.",
  ];
  const items = await escrow("client").getMilestones(shipped);
  for (let i = 0; i < 3; i += 1) {
    if (Number(items[i].status) === 0) await deliver(shipped, i, notes[i]);
    if (Number((await escrow("client").getMilestones(shipped))[i].status) === 1) await approve(shipped, i);
  }

  const split = await create("arbiter", {
    symbol: alt, title: "Brand video for a fintech launch", reviewWindow: 3 * DAY, dueIn: [2 * DAY, 6 * DAY, 9 * DAY],
    milestones: [["Storyboard", 1.5], ["Final video", 4], ["Social cut-downs", 2]],
  });
  let deal = await escrow("client").getDeal(split);
  if (!deal.closed) {
    if (Number(deal.currentMilestone) === 0) {
      await deliver(split, 0, "Storyboard v3: 14 frames, voice-over script and music reference, approved on the call.");
      await approve(split, 0);
    }
    const m1 = (await escrow("client").getMilestones(split))[1];
    if (Number(m1.status) === 0) await deliver(split, 1, "Final video v1: 1:20 master in 16:9, exported at 4K.");
    deal = await escrow("client").getDeal(split);
    // Left frozen: the arbiter settles it on camera (or `finish` does it if the recording can't).
    if (!deal.disputedAt) await send("client opens dispute", escrow("client").openDispute(split, ethers.id("The brief asked for a two-minute video with captions. This one is 1:20 and has no captions.")));
  }

  const claim = await create("claim", {
    symbol: "USDC", title: "Podcast edit, episodes 4 to 6", reviewWindow: HOUR, dueIn: [DAY, 3 * DAY],
    milestones: [["Rough cut", 1], ["Final mix", 1.5]],
  });
  if (Number((await escrow("client").getMilestones(claim))[0].status) === 0) await deliver(claim, 0, "Rough cut of episodes 4 to 6: ums and long pauses removed, 2 hours 10 minutes total.");

  await create("overdue", {
    symbol: alt, title: "Logo refresh for a bakery", reviewWindow: HOUR, dueIn: [15 * 60, 2 * DAY],
    milestones: [["Three directions", 1], ["Final files", 1.5]],
  });

  const frozen = await create("frozen", {
    symbol: "USDC", title: "Patient dashboard for a clinic", reviewWindow: 3 * DAY, dueIn: [4 * DAY, 9 * DAY],
    milestones: [["Data model", 1], ["Dashboard", 2]],
  });
  deal = await escrow("client").getDeal(frozen);
  if (!deal.disputedAt && !deal.closed) {
    if (Number((await escrow("client").getMilestones(frozen))[0].status) === 0) await deliver(frozen, 0, "Data model and import script for appointments, visits and invoices. Pull request #3.");
    await send("freelancer opens dispute", escrow("worker").openDispute(frozen, ethers.id("The client now wants three extra charts that were not in the agreed scope.")));
  }
  console.log("Stories created:", state.deals);
}

// Fallback for anything the recording didn't do on camera.
async function finish() {
  const claim = state.deals.claim, overdue = state.deals.overdue, split = state.deals.arbiter;
  const s = await escrow("arbiter").getDeal(split);
  if (!s.closed && s.disputedAt) await send("arbiter splits milestone 2", escrow("arbiter").resolveDispute(split, u(2.5)));
  const c = await escrow("worker").getDeal(claim);
  if (!c.closed && Number(c.currentMilestone) === 0) await send("freelancer claims after the review window", escrow("worker").claimAfterReviewWindow(claim));
  const o = await escrow("client").getDeal(overdue);
  if (!o.closed) await send("client reclaims after the missed due date", escrow("client").reclaimAfterMissedDeadline(overdue));
}

const command = process.argv[2] || "status";
await ({ status, gas, stories, finish }[command] ?? (() => { throw new Error(`Unknown command ${command}`); }))();

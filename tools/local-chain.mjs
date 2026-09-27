// A private test chain for trying every ScopePay screen without spending test tokens.
// Starts Ganache on :8545 (pretending to be Arbitrum Sepolia's chain id), deploys the
// contract with two mock stablecoins, seeds deals in every state, and writes
// tools/local/contract.json + registry.json for `SCOPEPAY_CONFIG_DIR=tools/local npm start`.
// Chain time is pushed two hours ahead; the harness shifts the browser clock to match.
import { createRequire } from "node:module";
import { ethers } from "ethers";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compile } from "../scripts/compile.mjs";
import { NETWORK } from "../scripts/network.mjs";

const ganache = createRequire(new URL("../package.json", import.meta.url))("ganache");
const PORT = 8545;
const OUT = join(import.meta.dirname, "local");
const HOUR = 3600, DAY = 86400;
const server = ganache.server({
  logging: { quiet: true },
  chain: { chainId: NETWORK.chainId, hardfork: "shanghai" },
  wallet: { deterministic: true, totalAccounts: 6, defaultBalance: 1000 },
  miner: { blockGasLimit: 30_000_000 },
});
await new Promise((resolve, reject) => server.listen(PORT, (error) => (error ? reject(error) : resolve())));
const provider = new ethers.JsonRpcProvider(`http://127.0.0.1:${PORT}`, NETWORK.chainId, { staticNetwork: true });
const accounts = await provider.send("eth_accounts", []);
const [client, worker, arbiter, client2, stranger] = await Promise.all(accounts.slice(0, 5).map((a) => provider.getSigner(a)));
const art = compile();
const TX = { gasLimit: 3_000_000 };

async function deploy(name, signer, ...args) {
  const c = await new ethers.ContractFactory(art[name].abi, art[name].bytecode, signer).deploy(...args, TX);
  await c.waitForDeployment();
  return c;
}
const usdc = await deploy("MockUSDC", client);
const usdg = await deploy("MockUSDC", client);
const escrow = await deploy("ScopePay", client, [await usdc.getAddress(), await usdg.getAddress()]);
const tokens = { USDC: usdc, USDG: usdg };
for (const who of [client, client2]) for (const t of [usdc, usdg]) {
  await (await t.connect(who).mint(await who.getAddress(), 10_000n * 10n ** 6n, TX)).wait();
  await (await t.connect(who).approve(await escrow.getAddress(), ethers.MaxUint256, TX)).wait();
}
const chainNow = async () => Number((await provider.getBlock("latest")).timestamp);
const travel = async (s) => { await provider.send("evm_increaseTime", [s]); await provider.send("evm_mine", []); };
const u = (v) => ethers.parseUnits(String(v), 6);
const registry = {};
const evidenceOf = {};

async function create({ by = client, symbol = "USDC", title, milestones, window = 3 * DAY, dueDays }) {
  const now = await chainNow();
  const terms = { v: 2, title, token: symbol, milestones: milestones.map(([name, amount]) => ({ name, amount: String(amount) })) };
  const id = Number(await escrow.nextDealId());
  const args = [await tokens[symbol].getAddress(), await worker.getAddress(), await arbiter.getAddress(),
    milestones.map(([, a]) => u(a)), dueDays.map((d) => now + Math.round(d * DAY)), window, ethers.id(JSON.stringify(terms))];
  try { await escrow.connect(by).createDeal.staticCall(...args); } catch (e) { throw new Error(`createDeal "${title}" would revert: ${e.revert?.name ?? e.shortMessage}`); }
  await (await escrow.connect(by).createDeal(...args, TX)).wait();
  registry[id] = { terms, evidence: [] };
  return id;
}
async function deliver(id, index, text) {
  await (await escrow.connect(worker).submitMilestone(id, index, ethers.id(text), TX)).wait();
  registry[id].evidence.push({ milestone: index, text });
}
const approve = async (id, i) => (await escrow.connect(client).approveMilestone(id, i, TX)).wait();

// Deals whose clocks must already have run out: made first, then the chain jumps ahead.
const claimable = await create({ title: "Podcast edit, episodes 4–6", milestones: [["Rough cut", 12], ["Final mix", 18]], window: HOUR, dueDays: [1, 3] });
await deliver(claimable, 0, "https://drive.example.com/podcast/rough-cut-v2");
const overdue = await create({ symbol: "USDG", title: "Logo refresh", milestones: [["Three directions", 20], ["Final files", 30]], window: HOUR, dueDays: [0.02, 1.5] });
await travel(2 * HOUR);

const done = await create({ title: "Checkout flow for a Lagos food store", milestones: [["Wireframes", 10], ["Working checkout", 25], ["Launch and handoff", 15]], dueDays: [2, 5, 8] });
for (const [i, text] of ["https://figma.example.com/checkout-wireframes", "https://staging.example.com/checkout", "Deployed to production; handoff notes in the shared folder"].entries()) { await deliver(done, i, text); await approve(done, i); }

const split = await create({ symbol: "USDG", title: "Brand video for a fintech launch", milestones: [["Storyboard", 15], ["Final video", 45], ["Cut-downs", 20]], dueDays: [2, 6, 9] });
await deliver(split, 0, "https://frame.example.com/storyboard-v3"); await approve(split, 0);
await deliver(split, 1, "https://frame.example.com/final-video-v1");
await (await escrow.connect(client).openDispute(split, ethers.id("Video is 40 seconds shorter than agreed and missing captions"), TX)).wait();
await (await escrow.connect(arbiter).resolveDispute(split, u(30), TX)).wait();

const review = await create({ title: "Landing page for a coffee brand", milestones: [["Design direction", 10], ["Working build", 25], ["Launch and handoff", 15]], window: 2 * DAY, dueDays: [3, 7, 10] });
await deliver(review, 0, "https://figma.example.com/coffee-landing-direction");
const fresh = await create({ symbol: "USDG", title: "Mobile app onboarding screens", milestones: [["User flow", 8], ["High-fidelity screens", 22]], dueDays: [4, 9] });
const frozen = await create({ by: client, title: "Data dashboard for a clinic", milestones: [["Data model", 20], ["Dashboard", 40]], dueDays: [3, 8] });
await deliver(frozen, 0, "https://github.com/example/clinic-dashboard/pull/3");
await (await escrow.connect(worker).openDispute(frozen, ethers.id("Client asked for three extra charts outside the agreed scope"), TX)).wait();

const offset = (await chainNow()) - Math.floor(Date.now() / 1000);
mkdirSync(OUT, { recursive: true });
const config = {
  version: 2,
  network: { ...NETWORK, rpc: `http://127.0.0.1:${PORT}` },
  tokens: [
    { symbol: "USDC", name: "Circle USD Coin (local mock)", address: await usdc.getAddress(), decimals: 6, faucet: "https://faucet.circle.com" },
    { symbol: "USDG", name: "Paxos Global Dollar (local mock)", address: await usdg.getAddress(), decimals: 6, faucet: "https://faucet.paxos.com" },
  ],
  deployment: { address: await escrow.getAddress(), deployBlock: 0, transactionHash: null },
  featuredDealId: review,
  abi: art.ScopePay.abi,
  local: { clockOffset: offset, accounts: { client: accounts[0], worker: accounts[1], arbiter: accounts[2], client2: accounts[3], stranger: accounts[4] },
    deals: { claimable, overdue, done, split, review, fresh, frozen } },
};
writeFileSync(join(OUT, "contract.json"), JSON.stringify(config, null, 2));
writeFileSync(join(OUT, "registry.json"), JSON.stringify({ [config.deployment.address.toLowerCase()]: registry }, null, 2));
console.log(`Local chain ready on :${PORT}. Escrow ${config.deployment.address}. Clock offset ${offset}s. Deals:`, config.local.deals);

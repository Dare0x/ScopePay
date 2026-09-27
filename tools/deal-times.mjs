// Prints when the timed demo deals can settle, and checks the on-camera deals' terms against the chain.
import { ethers } from "ethers";
import fs from "node:fs";
import { NETWORK } from "../scripts/network.mjs";
const dep = JSON.parse(fs.readFileSync(new URL("../deployments/arbitrum-sepolia.json", import.meta.url)));
const abi = JSON.parse(fs.readFileSync(new URL("../artifacts/ScopePay.json", import.meta.url))).abi;
const p = new ethers.JsonRpcProvider(NETWORK.rpc, NETWORK.chainId, { staticNetwork: true });
const c = new ethers.Contract(dep.address, abi, p);
const now = Number((await p.getBlock("latest")).timestamp);
const claim = (await c.getMilestones(2))[0], d2 = await c.getDeal(2);
console.log("claim #2 ready in", Number(claim.submittedAt) + Number(d2.reviewWindow) - now, "s");
console.log("reclaim #3 ready in", Number(await c.missedDeadlineAt(3)) - now + 1, "s");
const terms = { v: 2, title: "Landing page for a coffee brand", token: "USDC", milestones: [{ name: "Design direction", amount: "1.5" }, { name: "Working build", amount: "2.0" }, { name: "Launch and handoff", amount: "1.5" }] };
for (const id of [5, 6]) console.log(`deal #${id} terms match:`, (await c.getDeal(id)).termsCommitment === ethers.id(JSON.stringify(terms)), "next id", Number(await c.nextDealId()));

// Prints Arbitrum Sepolia ETH, USDC and USDG balances for the demo wallets in ../.env.
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split("=")));
const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc", 421614, { staticNetwork: true });
const erc20 = ["function balanceOf(address) view returns (uint256)"];
const USDC = new ethers.Contract("0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d", erc20, provider);
const USDG = new ethers.Contract("0xFFC95faa3d63Cde504a05B567C600B78C0b41892", erc20, provider);
for (const role of ["CLIENT", "WORKER", "ARBITER"]) {
  const a = env[`${role}_ADDRESS`];
  const [eth, u, g] = await Promise.all([provider.getBalance(a), USDC.balanceOf(a), USDG.balanceOf(a)]);
  console.log(role.padEnd(8), a, "ETH", ethers.formatEther(eth), "USDC", ethers.formatUnits(u, 6), "USDG", ethers.formatUnits(g, 6));
}

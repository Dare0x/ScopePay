// Looks for test USDG at the demo client address on Arbitrum Sepolia and Ethereum Sepolia.
import { ethers } from "ethers";
const who = "0x4D8BC77d5962eAF978Ee98Ea34911AbD2a7043BA";
const nets = [
  ["Arbitrum Sepolia", "https://sepolia-rollup.arbitrum.io/rpc", 421614, "0xFFC95faa3d63Cde504a05B567C600B78C0b41892"],
  ["Ethereum Sepolia", "https://ethereum-sepolia-rpc.publicnode.com", 11155111, "0xfBb2A78CceEb415b00300925e464C3E44E6e06b0"],
];
for (const [name, rpc, id, token] of nets) {
  try {
    const p = new ethers.JsonRpcProvider(rpc, id, { staticNetwork: true });
    const bal = await new ethers.Contract(token, ["function balanceOf(address) view returns (uint256)"], p).balanceOf(who);
    console.log(name.padEnd(18), "USDG", ethers.formatUnits(bal, 6));
  } catch (e) { console.log(name.padEnd(18), "error:", e.shortMessage ?? e.message); }
}

// Exits as soon as the demo client holds test USDG on Arbitrum Sepolia (checks every 30 s, up to 40 min).
import { ethers } from "ethers";
const p = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc", 421614, { staticNetwork: true });
const usdg = new ethers.Contract("0xFFC95faa3d63Cde504a05B567C600B78C0b41892", ["function balanceOf(address) view returns (uint256)"], p);
for (let i = 0; i < 80; i++) {
  try { const b = await usdg.balanceOf("0x4D8BC77d5962eAF978Ee98Ea34911AbD2a7043BA"); if (b > 0n) { console.log("USDG arrived:", ethers.formatUnits(b, 6)); process.exit(0); } } catch {}
  await new Promise((r) => setTimeout(r, 30000));
}
console.log("no USDG after 40 minutes"); process.exit(1);

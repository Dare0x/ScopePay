// Moves test USDC between the demo wallets (testnet only): node move-usdc.mjs <fromRole> <toRole> <amount>
import { ethers } from "ethers";
import { NETWORK, TOKENS, readEnv } from "../scripts/network.mjs";
const [from, to, amount] = process.argv.slice(2);
const env = readEnv();
const provider = new ethers.JsonRpcProvider(NETWORK.rpc, NETWORK.chainId, { staticNetwork: true });
const signer = new ethers.Wallet(env[`${from.toUpperCase()}_KEY`], provider);
const usdc = new ethers.Contract(TOKENS[0].address, ["function transfer(address,uint256) returns (bool)"], signer);
const tx = await usdc.transfer(env[`${to.toUpperCase()}_ADDRESS`], ethers.parseUnits(amount, 6));
console.log(`moved ${amount} USDC ${from} → ${to}: ${NETWORK.explorer}/tx/${(await tx.wait()).hash}`);

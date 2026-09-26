// Writes dist/contract.json: the ABI, network, accepted tokens and the recorded deployment.
import fs from 'node:fs';
import path from 'node:path';
import {compile, root} from './compile.mjs';
import {NETWORK, TOKENS} from './network.mjs';

const {ScopePay} = compile();
const deploymentFile = path.join(root, 'deployments', 'arbitrum-sepolia.json');
const deployment = fs.existsSync(deploymentFile) ? JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) : null;
const config = {
  version: 2,
  network: NETWORK,
  tokens: TOKENS,
  deployment: deployment && {address: deployment.address, deployBlock: deployment.deployBlock, transactionHash: deployment.transactionHash},
  featuredDealId: deployment?.featuredDealId,
  archive: {version: 1, address: '0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af', note: 'ScopePay v1 (USDC only, no deadlines). Deal #0 there is the original end-to-end test.'},
  abi: ScopePay.abi,
};
fs.writeFileSync(path.join(root, 'dist', 'contract.json'), JSON.stringify(config, null, 2) + '\n');
console.log(`Exported dist/contract.json (${deployment ? `deployment ${deployment.address}` : 'no deployment yet'}).`);

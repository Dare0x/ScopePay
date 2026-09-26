// Deploys ScopePay v2 to Arbitrum Sepolia with Circle test USDC and Paxos test USDG,
// records the deployment, then asks Sourcify to verify the exact source.
//   node scripts/deploy.mjs            (deploy + verify)
//   node scripts/deploy.mjs --verify   (verify the recorded deployment again)
import fs from 'node:fs';
import path from 'node:path';
import {ethers} from 'ethers';
import {compile, root, standardInput} from './compile.mjs';
import {NETWORK, TOKENS, readEnv} from './network.mjs';

const deploymentFile = path.join(root, 'deployments', 'arbitrum-sepolia.json');
const verifyOnly = process.argv.includes('--verify');

async function deploy() {
  const env = readEnv();
  if (!env.CLIENT_KEY) throw new Error('Missing CLIENT_KEY in .env');
  const provider = new ethers.JsonRpcProvider(NETWORK.rpc, NETWORK.chainId, {staticNetwork: true});
  const deployer = new ethers.Wallet(env.CLIENT_KEY, provider);
  const {ScopePay} = compile();
  const tokens = TOKENS.map(token => token.address);
  console.log(`Deploying ScopePay v2 from ${deployer.address} with tokens ${TOKENS.map(t => t.symbol).join(', ')}…`);
  const contract = await new ethers.ContractFactory(ScopePay.abi, ScopePay.bytecode, deployer).deploy(tokens);
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  const record = {
    network: NETWORK.name,
    chainId: NETWORK.chainId,
    address,
    deployBlock: receipt.blockNumber,
    transactionHash: receipt.hash,
    deployer: deployer.address,
    tokens: TOKENS,
    compiler: ScopePay.compiler,
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(deploymentFile), {recursive: true});
  fs.writeFileSync(deploymentFile, JSON.stringify(record, null, 2) + '\n');
  console.log(`Deployed at ${address} in block ${receipt.blockNumber} (${receipt.hash})`);
  return record;
}

async function verify(record) {
  const {ScopePay} = compile();
  const body = {
    stdJsonInput: standardInput(),
    compilerVersion: ScopePay.compiler.replace('.Emscripten.clang', ''),
    contractIdentifier: `contracts/ScopePay.sol:ScopePay`,
    creationTransactionHash: record.transactionHash,
  };
  const response = await fetch(`https://sourcify.dev/server/v2/verify/${record.chainId}/${record.address}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  const submitted = await response.json();
  if (!response.ok) throw new Error(`Sourcify refused the job: ${JSON.stringify(submitted)}`);
  console.log(`Sourcify job ${submitted.verificationId} submitted; waiting…`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 3000));
    const job = await (await fetch(`https://sourcify.dev/server/v2/verify/${submitted.verificationId}`)).json();
    if (!job.isJobCompleted) continue;
    if (job.error) throw new Error(`Sourcify could not verify: ${JSON.stringify(job.error)}`);
    console.log(`Sourcify: ${job.contract?.match ?? job.contract?.runtimeMatch} match — https://repo.sourcify.dev/${record.chainId}/${record.address}`);
    return;
  }
  throw new Error('Sourcify did not finish in time; run again with --verify.');
}

const record = verifyOnly ? JSON.parse(fs.readFileSync(deploymentFile, 'utf8')) : await deploy();
await verify(record);

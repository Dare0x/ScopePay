import fs from 'node:fs';
import path from 'node:path';
import {root} from './compile.mjs';

export const NETWORK = {
  name: 'Arbitrum Sepolia',
  chainId: 421614,
  chainHex: '0x66eee',
  rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
  explorer: 'https://sepolia.arbiscan.io',
};

// Test stablecoins on Arbitrum Sepolia. Both have 6 decimals.
export const TOKENS = [
  {symbol: 'USDC', name: 'Circle USD Coin (test)', address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', decimals: 6, faucet: 'https://faucet.circle.com'},
  {symbol: 'USDG', name: 'Paxos Global Dollar (test)', address: '0xFFC95faa3d63Cde504a05B567C600B78C0b41892', decimals: 6, faucet: 'https://faucet.paxos.com'},
];

/** Reads KEY=value lines from the git-ignored .env file. */
export function readEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.includes('=') && !line.startsWith('#'))
      .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
  );
}

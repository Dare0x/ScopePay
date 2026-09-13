import fs from 'node:fs';import path from 'node:path';import {compile,root} from './compile.mjs';
const {ScopePay}=compile();
const featuredTerms={title:'Product launch site',names:['Direction','Working delivery','Final handoff'],details:['Agree the approach and scope','Deliver the working result','Complete revisions and handoff'],amounts:['1','2','1']};
fs.writeFileSync(path.join(root,'dist/contract.json'),JSON.stringify({abi:ScopePay.abi,bytecode:ScopePay.bytecode,network:{chainId:421614,chainHex:'0x66eee',name:'Arbitrum Sepolia',rpc:'https://sepolia-rollup.arbitrum.io/rpc',explorer:'https://sepolia.arbiscan.io'},usdc:{address:'0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',decimals:6,symbol:'USDC'},deployment:{address:'0xcD7C1C0529A19C36941e1Bd6679ae4d4580151af',featuredDealId:'0',startBlock:10360000,featuredTerms}},null,2));
console.log('Exported browser contract artifact.');

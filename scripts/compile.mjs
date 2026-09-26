import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCES={ScopePay:'contracts/ScopePay.sol',MockUSDC:'contracts/mocks/MockUSDC.sol',MockFeeToken:'contracts/mocks/MockFeeToken.sol',MockReentrantToken:'contracts/mocks/MockReentrantToken.sol'};
const SETTINGS={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai'};
const OUTPUT={'*':{'*':['abi','evm.bytecode','evm.deployedBytecode','metadata']}};
const read=name=>fs.readFileSync(path.join(root,name.startsWith('@')?'node_modules':'',name),'utf8');
let cached;
export function compile(){
 if(cached)return cached;
 const input={language:'Solidity',sources:Object.fromEntries(Object.values(SOURCES).map(file=>[file,{content:read(file)}])),settings:{...SETTINGS,outputSelection:OUTPUT}};
 const output=JSON.parse(solc.compile(JSON.stringify(input),{import:name=>({contents:read(name)})}));
 const errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});const artifacts={};
 for(const [name,source] of Object.entries(SOURCES)){const c=output.contracts[source][name];artifacts[name]={contractName:name,sourceName:source,compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object,metadata:c.metadata};fs.writeFileSync(path.join(root,`artifacts/${name}.json`),JSON.stringify(artifacts[name],null,2));}
 return cached=artifacts;
}
/** The exact standard-JSON input behind a contract's metadata, for public source verification. */
export function standardInput(name='ScopePay'){
 const metadata=JSON.parse(compile()[name].metadata);
 return {language:'Solidity',sources:Object.fromEntries(Object.keys(metadata.sources).map(file=>[file,{content:read(file)}])),settings:{...SETTINGS,outputSelection:OUTPUT}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Compiled ${Object.keys(compile()).join(', ')}`);

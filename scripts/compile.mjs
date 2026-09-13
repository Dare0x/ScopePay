import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function compile(){
 const input={language:'Solidity',sources:{'ScopePay.sol':{content:fs.readFileSync(path.join(root,'contracts/ScopePay.sol'),'utf8')},'MockUSDC.sol':{content:fs.readFileSync(path.join(root,'contracts/MockUSDC.sol'),'utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode','evm.deployedBytecode']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input),{import:name=>({contents:fs.readFileSync(path.join(root,'node_modules',name),'utf8')})}));
 const errors=(output.errors??[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});const artifacts={};
 for(const [source,name] of [['ScopePay.sol','ScopePay'],['MockUSDC.sol','MockUSDC']]){const c=output.contracts[source][name];artifacts[name]={contractName:name,compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object};fs.writeFileSync(path.join(root,`artifacts/${name}.json`),JSON.stringify(artifacts[name],null,2));}
 return artifacts;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Compiled ${Object.keys(compile()).join(' and ')}`);

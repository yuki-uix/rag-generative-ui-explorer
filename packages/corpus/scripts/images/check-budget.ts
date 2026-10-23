import { resolve } from 'node:path';
import { directoryBytes, ImageConfig, readJSON } from '../../src/image-experiment.js';
const root=resolve(import.meta.dirname,'../../../../eval/images');
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--max-bytes' || !/^\d+$/.test(args[1]!))) throw new Error('Usage: check-budget.ts [--max-bytes POSITIVE_INTEGER]');
const limit=args.length?Number(args[1]):ImageConfig.parse(readJSON(resolve(root,'config.json'))).artifactBudgetBytes;
if(!Number.isSafeInteger(limit)||limit<=0) throw new Error('Budget must be a positive safe integer.');
const bytes=directoryBytes(root);
console.log(JSON.stringify({bytes,limit,excludes:['model cache','uncommitted replay runs']}));
if(bytes>limit) { console.error('Image experiment artifact budget exceeded.');process.exitCode=1; }

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { cpus } from 'node:os';
import { createRequire } from 'node:module';
import { AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import { verifyFreeze, sha } from '../../src/image-experiment.ts';
const root=resolve(import.meta.dirname,'../../../../eval/images');
const output=process.argv[2];
if (!output || process.argv.length!==3) throw new Error('Usage: node --import tsx encode.mjs FRESH_OUTPUT_JSON');
const {config,figures,questions,freezeSha256,freeze}=verifyFreeze(root);
const startedAt=new Date().toISOString(), began=performance.now();
const cache=resolve(root,'.cache'); env.cacheDir=cache; env.allowLocalModels=false;
const options={revision:config.revision,device:config.device,dtype:config.dtype,session_options:{intraOpNumThreads:1,interOpNumThreads:1}};
const loadStart=performance.now();
const tokenizer=await AutoTokenizer.from_pretrained(config.model,{revision:config.revision});
const processor=await AutoProcessor.from_pretrained(config.model,{revision:config.revision});
const text=await CLIPTextModelWithProjection.from_pretrained(config.model,options);
const vision=await CLIPVisionModelWithProjection.from_pretrained(config.model,options);
const loadMs=performance.now()-loadStart;
const inputs=questions.map(q=>({q,tokens:tokenizer(q.question,{padding:false,truncation:false})}));
for(const {q,tokens} of inputs) if(tokens.input_ids.dims.at(-1)>config.maxTokens) throw new Error(`Query exceeds CLIP context: ${q.id}`);
const normalize=vector=>{
  if(vector.length!==512 || vector.some(x=>!Number.isFinite(x))) throw new Error('Invalid CLIP embedding');
  const norm=Math.sqrt(vector.reduce((s,x)=>s+x*x,0));
  if(!norm) throw new Error('Zero CLIP embedding');
  return vector.map(x=>x/norm);
};
const passes=[];
for(let repetition=1;repetition<=config.repetitions;repetition++) {
  const images=[], queries=[];
  for(const f of figures) {
    const start=performance.now();
    const pixels=await RawImage.read(resolve(root,f.image));
    const result=await vision(await processor(pixels));
    images.push({id:f.id,vector:normalize(result.image_embeds.tolist()[0]),elapsedMs:performance.now()-start});
  }
  for(const {q,tokens} of inputs) {
    // Include query tokenization in query encoding timing. Preflight tokens are
    // used only for the no-truncation check, not as a timed inference cache.
    const start=performance.now();
    const result=await text(tokenizer(q.question,{padding:false,truncation:false}));
    queries.push({id:q.id,vector:normalize(result.text_embeds.tolist()[0]),elapsedMs:performance.now()-start});
  }
  passes.push({repetition,images,queries});
  console.log(JSON.stringify({repetition,images:images.length,queries:queries.length}));
}
const files=path=>readdirSync(path,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(resolve(path,f.name)):[resolve(path,f.name)]);
const modelFiles=files(cache).sort().map(path=>({path:relative(cache,path),sha256:sha(readFileSync(path)),bytes:statSync(path).size}));
const processorFile=modelFiles.find(f=>f.path.endsWith('preprocessor_config.json'));
const require=createRequire(import.meta.url);
const runtimePath=createRequire(require.resolve('@huggingface/transformers')).resolve('onnxruntime-node/package.json');
const encoding={version:'image-encoding-1',freezeSha256,model:config.model,revision:config.revision,dtype:config.dtype,device:config.device,dimensions:512,
  runtime:{transformers:'3.8.1',node:process.version,platform:process.platform,arch:process.arch,cpu:cpus()[0]?.model??'unknown',onnxruntime:JSON.parse(readFileSync(runtimePath,'utf8')).version},
  startedAt,completedAt:new Date().toISOString(),loadMs,totalMs:performance.now()-began,peakRssKiB:process.resourceUsage().maxRSS,providerApiCalls:0,modelFiles,
  processor:JSON.parse(readFileSync(resolve(cache,processorFile.path),'utf8')),passes};
if(Date.parse(freeze.frozenAt)>Date.parse(startedAt)) throw new Error('Inputs were frozen after observation');
writeFileSync(resolve(output),JSON.stringify(encoding)+'\n',{flag:'wx'});
await text.dispose(); await vision.dispose();
console.log(JSON.stringify({output,loadMs,totalMs:encoding.totalMs,modelBytes:modelFiles.reduce((s,f)=>s+f.bytes,0)}));

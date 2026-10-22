// REDACTED historical derivative (AK7403), not byte-identical original evidence.
// AK7207 offline TEMPLATE, not a runnable public proof or current implementation/adoption.
// NOT executed during redaction; see README.md. Private originals and pinned source required.
// Restore pseudonymous entry IDs only in a separately admitted PRIVATE copy before use.
// Inputs are bounded jq projections, NOT raw session JSONL. Original recipe loads no auth/settings/extensions.
// Output contains sensitive content hashes/IDs/times: PRIVATE, not publication-safe without redaction.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
throw new Error('Historical template only: requires separately admitted private originals, restored entry IDs and pinned source; see README.md');
const P=process.env.PI_HISTORICAL_PACKAGE;
const A=P+'/node_modules/@earendil-works/pi-ai';
const {buildSessionContext}=await import(P+'/dist/core/session-manager.js');
const {convertToLlm}=await import(P+'/dist/core/messages.js');
const {stream}=await import(A+'/dist/api/openai-codex-responses.js');
const catalog=JSON.parse(readFileSync(A+'/dist/providers/data/openai-codex.json','utf8'));
const model={...catalog['openai-codex-responses']['chat:gpt-6-astra'],provider:'openai-codex-2'};
let networkAttempts=0;
globalThis.fetch=()=>{networkAttempts++; throw new Error('NETWORK FORBIDDEN');};
const token='synthetic.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'offline-fixture'}})).toString('base64')+'.synthetic';
const hash=(x)=>{const b=Buffer.from(typeof x==='string'?x:JSON.stringify(x));return {bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};};
const summary=(body)=>({keys:Object.keys(body),instructions:hash(body.instructions),tools:hash(body.tools??[]),toolOrder:(body.tools??[]).map(x=>x.name),cacheKey:hash(body.prompt_cache_key),inputItems:body.input.length,input:hash(body.input),body:hash(body),itemStructure:body.input.map((x,i)=>({i,type:x.type??'message',role:x.role??null,...hash(x)}))});
const fixture=(name)=>JSON.parse(readFileSync(process.argv[2]+'/'+name+'.extracted.json','utf8'));
const parent=fixture('parent'),child=fixture('child');
async function capture(entries,responseId,override={}) {
 const response=entries.find(e=>e.id===responseId); assert(response);
 const projection=buildSessionContext(entries.filter(e=>e.type!=='session'),response.parentId);
 const messages=convertToLlm(projection.messages);
 let body;
 const events=stream(model,{messages},{apiKey:token,sessionId:entries[0].id,transport:'sse',reasoningEffort:projection.thinkingLevel,...override,onPayload:b=>{body=b;throw new Error('OFFLINE_CAPTURE_COMPLETE');}});
 await events.result();assert(body,'onPayload was not reached');
 return {body,response:{id:response.id,timestamp:response.timestamp,usage:response.message.usage},projection:{messages:messages.length,roles:messages.map(x=>x.role),thinkingLevel:projection.thinkingLevel,systemSections:messages.filter(x=>x.role==='system').map(x=>Object.fromEntries(Object.entries(x.sections??{}).map(([k,v])=>[k,hash(v)])))},summary:summary(body)};
}
const cases={parentBefore:await capture(parent,'entry-parent-before'),parentAfter:await capture(parent,'entry-parent-after'),childFirst:await capture(child,'entry-child-first'),childSecond:await capture(child,'entry-child-second')};
function compare(a,b){
 let n=0;while(n<Math.min(a.input.length,b.input.length)&&JSON.stringify(a.input[n])===JSON.stringify(b.input[n]))n++;
 const x=Buffer.from(JSON.stringify(a.input)),y=Buffer.from(JSON.stringify(b.input));let k=0;while(k<Math.min(x.length,y.length)&&x[k]===y[k])k++;
 return {instructionsEqual:a.instructions===b.instructions,toolsEqual:JSON.stringify(a.tools)===JSON.stringify(b.tools),keyEqual:a.prompt_cache_key===b.prompt_cache_key,commonInputItems:n,inputJsonCommonBytes:k,firstDifferentItem:{a:a.input[n]?{type:a.input[n].type??'message',role:a.input[n].role??null,...hash(a.input[n])}:null,b:b.input[n]?{type:b.input[n].type??'message',role:b.input[n].role??null,...hash(b.input[n])}:null},equalOtherFields:Object.keys(a).filter(key=>key!=='input'&&key!=='prompt_cache_key').every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]))};
}
const sameKey=await capture(child,'entry-child-first',{sessionId:parent[0].id});
assert.deepEqual({...sameKey.body,prompt_cache_key:cases.childFirst.body.prompt_cache_key},cases.childFirst.body);
assert.equal(cases.childFirst.body.input[144].output,'No result provided');
assert.equal(cases.childFirst.body.input[144].call_id,cases.parentAfter.body.input[144].call_id);
const inherited=child.filter(e=>e.type!=='session'&&e.timestamp<child[0].timestamp);
const byId=new Map(parent.map(e=>[e.id,e]));
const inheritedMatches=inherited.filter(e=>JSON.stringify(e)===JSON.stringify(byId.get(e.id))).length;
assert.equal(inheritedMatches,inherited.length);
for(const entries of [parent,child]) assert.equal(new Set(entries.map(e=>e.id)).size,entries.length,'duplicate entry id');
assert.equal(child.filter(e=>e.type!=='session'&&e.timestamp===child[0].timestamp).length,0);
const childNew=child.filter(e=>e.type==='message'&&e.message.role==='assistant'&&e.timestamp>child[0].timestamp);
assert(childNew.every(e=>!byId.has(e.id)));
const parentEarlyWarm=await capture(parent,'entry-parent-early-warm'),parentEarlyMiss=await capture(parent,'entry-parent-early-miss'),parentEarlyNext=await capture(parent,'entry-parent-early-next');
const result={kind:'offline-current-adapter-reconstruction-not-historical-wire',assumptions:['Current installed dist adapter/catalog; alias provider name retained; no historical remote catalog overlay or onPayload/context hooks reconstructed','SSE full-body capture before transport; historical websocket delta/headers/response IDs unknown','No tokenizer/backend inference; JSON byte LCP is NOT token-prefix proof'],networkAttempts,childBoundaryChecks:{uniqueEntryIds:true,noBirthEqualEntries:true,newAssistantIdsAbsentFromParent:true,newAssistantCount:childNew.length},sameSessionCounterexample:{warm:parentEarlyWarm.summary,miss:parentEarlyMiss.summary,next:parentEarlyNext.summary,warmVsMiss:compare(parentEarlyWarm.body,parentEarlyMiss.body),missVsNext:compare(parentEarlyMiss.body,parentEarlyNext.body)},syntheticMissingToolResult:{verified:true,inputIndex:144,output:'No result provided',sameCallAsParentResult:true},inheritedEntries:inherited.length,inheritedByteEquivalentObjects:inheritedMatches,model:{id:model.id,provider:model.provider,api:model.api,compat:model.compat},cases:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,{response:v.response,projection:v.projection,...v.summary}])),comparisons:{parentBeforeVsChildFirst:compare(cases.parentBefore.body,cases.childFirst.body),parentAfterVsChildFirst:compare(cases.parentAfter.body,cases.childFirst.body),childFirstVsSecond:compare(cases.childFirst.body,cases.childSecond.body)},oneFactorSameKey:{onlyCacheKeyChanged:true,body:hash(sameKey.body)},sourceDigests:Object.fromEntries(['dist/core/session-manager.js','dist/core/messages.js','node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js','node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js','node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json'].map(p=>[p,hash(readFileSync(P+'/'+p,'utf8'))]))};
assert.equal(networkAttempts,0);console.log(JSON.stringify(result,null,2));

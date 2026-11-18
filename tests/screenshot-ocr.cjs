'use strict';
const a=require('node:assert/strict'), {createHash}=require('node:crypto');
const {expect}=require('playwright/test');
const texts=['公司名称：合成甲科技有限公司\n岗位名称：软件工程师\n岗位职责：编写测试程序','公司名称：合成乙商贸有限公司\n岗位名称：采购专员\n岗位职责：采购合成原料'];
async function image(p,i=0){
 const url=await p.evaluate(i=>{const c=document.createElement('canvas');c.width=80;c.height=32;const g=c.getContext('2d');g.fillStyle=i?'red':'blue';g.fillRect(0,0,80,32);g.fillStyle='white';for(let x=i?0:5;x<80;x+=10)g.fillRect(x,0,5,32);g.fillText(String(i),10,20);return c.toDataURL()},i);
 return {name:'fixture'+i+'.png',mimeType:'image/png',buffer:Buffer.from(url.split(',')[1],'base64')};
}
const hash=f=>'sha256:'+createHash('sha256').update(f.buffer).digest('hex');
async function setup(p,mode){
 p.setDefaultTimeout(6000);
 await p.evaluate(({texts,mode})=>{
 window.calls=[];window.sends=[];
 Tesseract.createWorker=async()=>({terminate:async()=>{},recognize:async file=>{calls.push(file.name);return {data:{text:mode==='blank'?'':texts[file.name==='fixture1.png'?1:0],confidence:90}}}});
 jobAiService.connected=()=>mode==='ai';
 jobAiService.request=async(task,prompt)=>{sends.push({task,prompt});throw Error('simulated offline response')};
 if(mode==='read')jobBatchStore.getRecognition=async()=>{throw Error('synthetic read failure')};
 if(['write','history'].includes(mode))jobBatchStore.saveRecognition=async()=>{throw Error('synthetic write failure')};
 },{texts,mode});
 await p.locator('#screenshot-job-button').click();await p.locator('#job-screenshot-batch-direction').fill('其他');
}
async function upload(p,fs){await p.locator('#job-screenshot-files').setInputFiles(fs)}
async function start(p){await p.locator('#recognize-job-screenshots').click()}
const snapshot=p=>p.evaluate(()=>jobBatchStore.exportRecords().then(x=>({b:x.stores.batches.map(r=>r.batch),c:x.stores.recognitionCache,s:x.stores.screenshots.map(r=>[r.batchId,r.index,r.name,r.blob.size])})));
async function saved(p){await expect(p.locator('#job-batch-save-notice-0 p')).toContainText('原始截图已保存');}
async function cache(p,mode){
 const f=await image(p);const h=hash(f);const record={contentHash:h,recognitionStatus:'success',text:mode==='corrupt'?{bad:true}:'synthetic cached text'};
 if(['corrupt','hit'].includes(mode)) await p.evaluate(r=>jobBatchStore.saveRecognition(r),record);
 await setup(p,mode);await upload(p,f);await start(p);await saved(p);
 const result=await snapshot(p);const expected=mode==='hit'?record.text:texts[0];
 a.equal(result.b.length,1);a.equal(result.b[0].results[0].text,expected);a.equal(result.b[0].results[0].imageHash,h);
 a.deepEqual(await p.evaluate(()=>calls),mode==='hit'?[]:[f.name]);
 const msg={read:'缓存读取失败',corrupt:'缓存内容格式异常',write:'缓存未保存'}[mode];if(msg)await expect(p.locator('#job-ocr-cache-notice')).toContainText(msg);
 if(mode==='corrupt')a.deepEqual(result.c[0].text,record.text);else if(['read','write'].includes(mode))a.equal(result.c.length,0);else a.equal(result.c[0].text,expected);
 await p.reload();a.deepEqual(await snapshot(p),result);
 const bytes=await p.evaluate(async()=>Array.from(new Uint8Array(await (await jobBatchStore.exportRecords()).stores.screenshots[0].blob.arrayBuffer())));a.deepEqual(Buffer.from(bytes),f.buffer);
}
async function group(p,ai){
 const fs=[await image(p),await image(p,1)];await setup(p,ai?'ai':'normal');await upload(p,fs);await start(p);await saved(p);
 let {b}=await snapshot(p);a.deepEqual(b[0].results.map(x=>x.text),texts);a.deepEqual(b[0].groups.map(g=>g.screenshotIndexes),[[0],[1]]);a.equal(b[0].groupingConfirmed,false);a.equal(await p.evaluate(()=>jobWorkspace.getJobs().length),0);
 const preview=p.locator('#job-group-send-preview');
 if(ai){
 await expect(preview).toBeVisible();a.deepEqual(await p.evaluate(()=>sends),[]);await p.locator('#job-group-send-cancel').click();a.deepEqual(await p.evaluate(()=>sends),[]);
 await p.locator('#job-ai-group').click();await expect(preview).toBeVisible();const prompt=await p.locator('#job-group-send-prompt').inputValue();a.ok(prompt.includes(texts[0].split('\n')[0]));a.deepEqual(await p.evaluate(()=>sends),[]);
 await p.locator('#job-group-send-confirm').click();a.deepEqual(await p.evaluate(()=>sends),[{task:'group',prompt}]);await p.locator('#job-ai-group').click();await expect(preview).toBeVisible();
 }
 const move=p.locator('[data-batch-action="move-screenshot"][data-result-index="1"]');const detail=move.locator('xpath=ancestor::details[1]');if(!await move.isVisible())await detail.locator('summary').click();await move.selectOption(b[0].groups[0].id);
 if(ai){await expect(preview).toBeHidden();a.equal(await p.evaluate(()=>sends.length),1)}
 await expect.poll(async()=>(await snapshot(p)).b[0].groups.map(g=>g.screenshotIndexes)).toEqual([[0,1]]);
 // Moving two distinct job descriptions into one group requires an explicit identity review.
 await p.locator('[data-batch-action="inspect-group"]').click();
 await p.getByRole('button',{name:'修改信息',exact:true}).click();
 await p.locator('#job-import-position').fill('合成联合岗位');
 p.on('dialog',d=>d.message().includes('确属同一个岗位')?d.accept():d.dismiss());
 await p.locator('#save-job-import').click();
 await expect.poll(async()=>(await snapshot(p)).b[0].groups[0].confirmed).toBe(true);
 await p.locator('#confirm-job-screenshot-groups').click();await expect.poll(async()=>(await snapshot(p)).b[0].groupingConfirmed).toBe(true);
 const final=await snapshot(p);await p.reload();a.deepEqual(await snapshot(p),final);
}
async function inject(p){await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.breakShot=true;IDBObjectStore.prototype.put=function(...args){if(this.name==='screenshots'&&window.breakShot)throw Error('synthetic image write failure');return put.apply(this,args)}})}
async function createBatch(p,index,mode){
 await setup(p,mode);await upload(p,await image(p,index));await start(p);await saved(p);
 const matches=(await snapshot(p)).b.filter(b=>b.results.length===1 && b.results[0].text===texts[index]);
 a.equal(matches.length,1);return matches[0];
}
function previewData(prompt){return JSON.parse(prompt.split('\n数据：').at(-1))}
async function switchBatch(p){
 const second=await createBatch(p,1,'normal');
 await p.locator('#close-job-import-dialog').click();
 // Start fixture A with an empty upload queue. Do not reload between its preview and the switch to B.
 await p.reload();await p.locator('[data-module="找工作"]').click();
 const first=await createBatch(p,0,'ai');a.notEqual(first.id,second.id);
 const panel=p.locator('#job-group-send-preview'),field=p.locator('#job-group-send-prompt');
 await expect(panel).toBeVisible();const original=await field.inputValue();
 a.equal(previewData(original).batchId,first.id);a.equal(previewData(original).screenshots[0].text,texts[0]);
 const staleButton=await p.locator('#job-group-send-confirm').elementHandle();
 await p.locator('#close-job-import-dialog').click();await p.locator('[data-job-tab="history"]').click();
 await p.locator('[data-job-batch-history-action="open"][data-batch-id="'+second.id+'"]').click();
 await expect(p.locator('#job-screenshot-file-list')).toContainText('fixture1.png');
 await expect(panel).toBeHidden();
 // Replay a late activation on the original control even though a real user can no longer click it.
 await staleButton.evaluate(el=>el.click());
 a.deepEqual(await p.evaluate(()=>sends),[]);await expect(field).toHaveValue('');
 await p.locator('#job-ai-group').click();await expect(panel).toBeVisible();
 const current=previewData(await field.inputValue());a.equal(current.batchId,second.id);
 a.deepEqual(current.screenshots.map(r=>r.text),[texts[1]]);a.deepEqual(await p.evaluate(()=>sends),[]);
}
async function doubleConfirm(p){
 const batch=await createBatch(p,0,'ai');const initial=batch.groupingHistory||[];
 const prompt=await p.locator('#job-group-send-prompt').inputValue();
 await p.evaluate(()=>{jobAiService.request=(task,prompt)=>{sends.push({task,prompt});return new Promise(resolve=>{window.finishMock=resolve})}});
 const confirm=p.locator('#job-group-send-confirm');await confirm.dblclick({delay:15});
 await expect(confirm).toBeDisabled();a.deepEqual(await p.evaluate(()=>sends),[{task:'group',prompt}]);
 await p.evaluate(b=>finishMock({batchId:b.id,groups:[{screenshotIds:[b.results[0].id],uncertain:false,reason:'合成测试',fields:{position:'软件工程师',company:'合成甲科技有限公司'}}]}),batch);
 await expect(p.locator('#job-group-send-preview')).toBeHidden();await expect(confirm).toBeEnabled();
 await expect(p.locator('#job-ai-status')).toContainText('AI已整理为1个岗位');
 await saved(p);a.deepEqual(await p.evaluate(()=>sends),[{task:'group',prompt}]);
 await p.reload();const state=await snapshot(p);a.equal(state.b.length,1);a.equal(state.s.length,1);
 const stored=state.b[0];a.equal(stored.id,batch.id);a.equal(stored.groups.length,1);
 a.equal(stored.groups[0].groupingSource,'ai');a.equal(stored.groupingConfirmed,false);
 a.deepEqual(stored.groups[0].screenshotIndexes,[0]);a.equal(stored.groupingHistory.length,initial.length+1);
 a.deepEqual(stored.groupingHistory.at(-1).groups,batch.groups);a.equal(await p.evaluate(()=>jobWorkspace.getJobs().length),0);
}
module.exports={
 shotSwitchPreview:switchBatch,shotDoubleConfirm:doubleConfirm,
 shotEmpty:async p=>{await setup(p,'blank');await upload(p,{name:'empty.png',mimeType:'image/png',buffer:Buffer.alloc(0)});await start(p);await expect(p.locator('#job-screenshot-warning')).toContainText('识别失败');a.equal((await snapshot(p)).b.length,0)},
 shotHistorical:async p=>{const f=await image(p);await setup(p,'normal');await upload(p,f);await start(p);await saved(p);
 await p.evaluate(async h=>{const b=(await jobBatchStore.exportRecords()).stores.batches[0].batch;jobWorkspace.replaceJobs([{id:'fixture-job',sourceBatchId:b.id,company:'合成甲',position:'合成岗位'}]);const k='careerWorkbench.jobsToolkit.v1';const t=JSON.parse(localStorage.getItem(k)||'{}');t.screenshotHistory=[{id:'old',contentHash:h,jobId:'fixture-job',jobIds:['fixture-job']}];localStorage.setItem(k,JSON.stringify(t))},hash(f));
 await p.reload();await p.locator('[data-module="找工作"]').click();await setup(p,'history');await p.evaluate(()=>jobBatchStore.getRecognition=async()=>null);await upload(p,f);await start(p);await saved(p);a.deepEqual(await p.evaluate(()=>calls),[]);await expect(p.locator('#job-ocr-cache-notice')).toContainText('缓存未保存');const batches=(await snapshot(p)).b;a.equal(batches.length,2);a.ok(batches.some(b=>b.results[0].recognitionMode==='cache'&&b.results[0].text===texts[0]))},
 shotMissing:async p=>{await setup(p,'normal');await upload(p,await image(p));await start(p);await saved(p);
 const id=await p.evaluate(async()=>{const b=(await jobBatchStore.exportRecords()).stores.batches[0].batch;await jobBatchStore.saveScreenshots(b.id,[]);return b.id});await p.reload();await p.locator('[data-module="找工作"]').click();await p.locator('[data-job-tab="history"]').click();await p.locator('[data-job-batch-history-action="open"][data-batch-id="'+id+'"]').click();await expect(p.locator('#job-screenshot-warning')).toContainText('旧截图文件缺失');await expect(p.locator('#job-batch-save-notice-0 p')).toContainText('历史截图缺失');a.equal((await snapshot(p)).s.length,0)},
 shotMiss:p=>cache(p,'miss'),shotHit:p=>cache(p,'hit'),shotRead:p=>cache(p,'read'),shotWrite:p=>cache(p,'write'),shotCorrupt:p=>cache(p,'corrupt'),
 shotInvalid:async p=>{await setup(p,'blank');await upload(p,{name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('test')});await expect(p.locator('#job-screenshot-warning')).toContainText('格式不支持');await expect(p.locator('#recognize-job-screenshots')).toBeDisabled();await upload(p,await image(p));await start(p);await expect(p.locator('#job-screenshot-warning')).toContainText('没有从图片中识别到可用文字');a.equal((await snapshot(p)).b.length,0)},
 shotGroup:p=>group(p,false),shotAi:p=>group(p,true),
 shotRetry:async p=>{await setup(p,'normal');await inject(p);await upload(p,await image(p));await start(p);const r=p.locator('#job-batch-save-notice-0 button');await expect(r).toBeVisible();let v=await snapshot(p);a.equal(v.b.length,0);a.equal(v.s.length,0);await p.evaluate(()=>window.breakShot=false);await r.click();await saved(p);a.equal((await snapshot(p)).b[0].results[0].text,texts[0]);a.equal(await p.evaluate(()=>calls.length),1)},
 shotTransaction:async p=>{const f=await image(p);await setup(p,'normal');await upload(p,f);await start(p);await saved(p);const before=await snapshot(p);await inject(p);
 await p.evaluate(async()=>{const batch=(await jobBatchStore.exportRecords()).stores.batches[0].batch;batch.results[0].text='replacement';try{await jobBatchStore.saveBatchWithScreenshots(batch,{mode:'replace',files:[new File(['replacement'],'new.png')]})}catch(e){if(!e.message.includes('synthetic image write failure'))throw e;return}throw Error('unexpected commit')});
 a.deepEqual(await snapshot(p),before);
 await p.evaluate(async()=>{let b=(await jobBatchStore.exportRecords()).stores.batches[0].batch;b.results[0].text='updated';await jobBatchStore.saveBatchWithScreenshots(b,{mode:'preserve'});b.id='another-batch';await jobBatchStore.saveBatchWithScreenshots(b,{mode:'clear',files:[],confirmClear:true})});
 const after=await snapshot(p);a.deepEqual(after.s,before.s);a.equal(after.b.find(b=>b.id===before.b[0].id).results[0].text,'updated');a.equal(after.b.length,2);
 }
};

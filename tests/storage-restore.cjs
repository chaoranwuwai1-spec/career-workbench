'use strict';
const a=require('node:assert/strict'), fs=require('node:fs/promises');
const key=n=>'careerWorkbench.'+n+'.v1';
const raw=(p,n)=>p.evaluate(k=>localStorage.getItem(k),key(n));
const read=async(p,n)=>JSON.parse(await raw(p,n));
const backup=(app='careerWorkbench')=>({app,section:'找工作',version:2,exportedAt:new Date().toISOString(),jobs:[{id:'imported',company:'Example'}],toolkit:{resumeVersions:[{id:'new-version'}]}});
async function seed(p){
 await p.evaluate(async()=>{
   interviewWorkspace.addConfirmedExperience({id:'exp',title:'Demo',situation:'Synthetic',action:'Example',confirmedByUser:true});
   jobResumeStore.saveVersions([{id:'resume',name:'Synthetic',content:'sample'}]);
   jobWorkspace.replaceJobs([{id:'job',company:'Example',position:'test',resumeVersionId:'resume'}]);
   await jobBatchStore.saveBatchWithScreenshots({id:'batch',results:[{}],groups:[]},{mode:'replace',files:[new File(['synthetic image bytes'],'sample.png')]});
 });
}
async function restore(p,pack,answers){
 const seen=[]; const h=async d=>{seen.push(d.message()); if(answers[seen.length-1])await d.accept();else await d.dismiss()};
 p.on('dialog',h);
 try {
   const [chooser]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#import-job-backup').click()]);
   await chooser.setFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
   await p.waitForFunction(()=>document.querySelector('#job-backup-file').value==='');
   a.equal(seen.length,answers.length);
 }finally{p.off('dialog',h)}
}
async function failed(p,mode){
 await seed(p); const before=await Promise.all(['jobs','jobsToolkit'].map(n=>raw(p,n)));
 await p.evaluate(n=>window.failure=n,mode); await restore(p,backup(),[true]);
 const marker=await read(p,'jobsRestoreState'), protection=await read(p,'jobsRestoreProtection');
 a.equal(marker.operationId,protection.operationId);a.equal(marker.protectionKey,key('jobsRestoreProtection'));
 a.deepEqual([protection.rawJobs,protection.rawToolkit],before);
 a.equal(marker.phase,mode===1?'rolled-back':'in-progress');
 a.match(await p.locator('#jobs-message').innerText(),/恢复失败/);
 if(mode===1)a.deepEqual(await Promise.all(['jobs','jobsToolkit'].map(n=>raw(p,n))),before);
 else {await p.reload();a.match(await p.locator('#job-restore-status').textContent(),/未完成恢复/);a.equal(await p.evaluate(()=>jobWorkspace.updateJob('job',{position:'unsafe'})),false);a.deepEqual(await read(p,'jobsRestoreProtection'),protection)}
}
module.exports={
 empty:async p=>{a.deepEqual(await p.evaluate(()=>jobWorkspace.getJobs()),[]);a.deepEqual(await p.evaluate(()=>jobResumeStore.read().resumeVersions),[]);a.equal((await p.evaluate(()=>jobBatchStore.exportRecords())).stores.screenshots.length,0)},
 persist:async p=>{await seed(p);await p.reload();a.equal(await p.evaluate(()=>jobWorkspace.getJobs()[0].resumeVersionId),'resume');a.equal(await p.evaluate(()=>jobResumeStore.read().resumeVersions[0].id),'resume');a.equal(await p.evaluate(()=>interviewWorkspace.getExperience('exp').id),'exp');const shot=await p.evaluate(async()=>{const s=(await jobBatchStore.exportRecords()).stores.screenshots[0];return [s.batchId,await s.blob.text()]});a.deepEqual(shot,['batch','synthetic image bytes'])},
 native:async p=>{await seed(p);const [d]=await Promise.all([p.waitForEvent('download'),p.locator('#export-job-data').click()]);const pack=JSON.parse(await fs.readFile(await d.path(),'utf8'));a.equal(pack.app,'careerWorkbench');a.equal(pack.jobs[0].id,'job');await p.evaluate(()=>jobWorkspace.replaceJobs([]));await restore(p,pack,[true]);a.equal((await read(p,'jobsRestoreState')).phase,'completed');await p.reload();a.equal(await p.evaluate(()=>jobWorkspace.getJobs()[0].resumeVersionId),'resume')},
 cancel:async p=>{await seed(p);for(const answers of [[false],[true,false]]){await p.evaluate(()=>events.length=0);await restore(p,backup('个人AI工作台'),answers);a.equal(await p.evaluate(()=>events.filter(([m])=>['setItem','removeItem'].includes(m)).length),0)}},
 legacy:async p=>{await seed(p);const iv=await raw(p,'interview');await restore(p,backup('个人AI工作台'),[true,true]);a.equal((await read(p,'jobs'))[0].id,'imported');a.ok((await read(p,'jobsToolkit')).resumeVersions.some(v=>v.id==='new-version'));a.equal(await raw(p,'interview'),iv);a.equal(await p.evaluate(async()=>(await jobBatchStore.exportRecords()).stores.screenshots[0].batchId),'batch')},
 array:async p=>{await seed(p);const before=await raw(p,'jobsToolkit');await restore(p,[{id:'array-job'}],[true,true]);a.equal((await read(p,'jobs'))[0].id,'array-job');a.equal(await raw(p,'jobsToolkit'),before)},
 rollback:p=>failed(p,1),interrupted:p=>failed(p,2)
};

'use strict';
const a=require('node:assert/strict');
const {expect}=require('playwright/test');
const K='careerWorkbench.interview.v1';
const read=p=>p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}'),K);
const tab=(p,t)=>p.locator('[data-interview-tab="'+t+'"]').click();
const submit=(p,id)=>p.locator('#'+id+' [type=submit]').click();
const act=(p,x,id)=>p.locator('[data-interview-action="'+x+'"]'+(id?'[data-id="'+id+'"]':''));
async function independent(p,t){p.setDefaultTimeout(5000);await p.locator('[data-module="工作与面试"]').click();await tab(p,t)}
async function add(p,title){await p.locator('#add-interview-experience').click();await p.locator('#interview-exp-title').fill(title);await p.locator('#interview-exp-situation').fill('fixture context');await p.locator('#interview-exp-action').fill('fixture action');await submit(p,'interview-experience-form');await expect(p.locator('#interview-experience-form')).toBeHidden()}
function fixture(){
 const experiences=['ok','sim','no','demo','synth'].map(id=>({id,title:'TOKEN_'+id+'_EXP',action:'sample action',situation:'sample context',targetRoles:['通用'],confirmedByUser:id!=='no',isDemo:id==='demo',isSynthetic:id==='synth',sourceType:id==='sim'?'jobInterviewSimulation':'manual'}));
 return {experiences,projectCases:[{id:'p',projectName:'TOKEN_unconfirmed_PROJECT'}],starCases:[{id:'s',title:'TOKEN_unconfirmed_STAR',experienceId:'ok',targetRole:'通用'}],questions:[{id:'q',question:'合成面试问题',targetRole:'通用',experienceIds:experiences.map(e=>e.id),projectCaseIds:['p'],answerDraft:'sample answer'}]};
}
async function seed(p){await p.evaluate(({iv,k})=>{localStorage.setItem(k,JSON.stringify(iv));localStorage.setItem('careerWorkbench.jobs.v1',JSON.stringify([{id:'j',company:'合成公司',position:'运营',jobDirection:'通用',jd:'合成需求',resumeDraft:{id:'r',content:'synthetic resume',resumeName:'测试简历'}}]))},{iv:fixture(),k:K});await p.reload()}
function policy(s){for(const id of ['ok','sim'])a.ok(s.includes('TOKEN_'+id+'_EXP'),id);for(const x of ['no_EXP','demo_EXP','synth_EXP','unconfirmed_PROJECT','unconfirmed_STAR'])a.ok(!s.includes('TOKEN_'+x),x)}
async function reveal(p,id){const el=p.locator('#'+id), parents=el.locator('xpath=ancestor::details');for(const parent of await parents.all())if(!await parent.evaluate(e=>e.open))await parent.locator(':scope > summary').click();return el}
async function job(p){p.setDefaultTimeout(5000);await p.locator('[data-module="找工作"]').click();await p.locator('[data-job-tab="interview"]').click();await p.locator('#job-interview-select').selectOption('j');await p.locator('#job-interview-resume-select').selectOption('draft:r');await p.locator('#confirm-interview-resume').click()}
async function createProject(p){
 await independent(p,'experiences');
 await p.locator('#add-video-project-case').click();
 await expect(p.getByLabel('关联个人经历',{exact:true})).toHaveValue('');
 await p.locator('#video-project-name').fill('CASE_ONLY_P');
 await p.locator('#video-project-workflow').fill('测试流程一');
 await submit(p,'video-project-form');
 const project=(await read(p)).projectCases.find(x=>x.projectName==='CASE_ONLY_P');
 a.ok(project?.id,'项目没有保存');return project;
}
async function projectEditReload(p){
 const created=await createProject(p);
 await act(p,'edit-project',created.id).click();
 await p.locator('#video-project-workflow').fill('测试流程二');
 await submit(p,'video-project-form');await p.reload();await independent(p,'experiences');
 await act(p,'edit-project',created.id).click();
 a.equal(await p.locator('#video-project-name').inputValue(),created.projectName);
 a.equal(await p.locator('#video-project-workflow').inputValue(),'测试流程二');
 const rows=(await read(p)).projectCases;a.equal(rows.length,1);a.equal(rows[0].id,created.id);
}
async function projectDirectLink(p){
 await seed(p);const project=await createProject(p);
 await act(p,'edit-project',project.id).click();
 const form=p.locator('#video-project-form');
 // Module checkboxes are NOT experience selectors. Require an actual choice of a fixture experience.
 const options=form.getByRole('option',{name:/TOKEN_ok_EXP/}).or(form.getByRole('checkbox',{name:/TOKEN_ok_EXP/})).or(form.getByRole('button',{name:/TOKEN_ok_EXP/}));
 a.ok(await options.count(),'项目编辑页没有可选的个人经历 A；无法执行绑定、改绑 B 或解除关联。');
 const select=form.getByLabel('关联个人经历',{exact:true});
 const stored=async()=> (await read(p)).projectCases.find(row=>row.id===project.id);
 const cancel=()=>form.getByRole('button',{name:'取消',exact:true}).click();
 async function saveAndReopen(id){
   await select.selectOption(id);
   await submit(p,'video-project-form');
   await expect(form).toBeHidden();
   await p.reload();
   await independent(p,'experiences');
   await act(p,'edit-project',project.id).click();
   await expect(select).toHaveValue(id);
   a.equal((await stored()).experienceId,id || undefined);
 }
 a.equal(project.experienceId,undefined);
 await saveAndReopen('ok');
 await select.selectOption('sim');
 await cancel();
 await act(p,'edit-project',project.id).click();
 await expect(select).toHaveValue('ok');
 await saveAndReopen('sim');
 await saveAndReopen('');
 await saveAndReopen('ok');
 const before=await read(p);
 await p.evaluate(key=>{
   const write=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
     if(k!==key)return write.call(this,k,v);
     Storage.prototype.setItem=write;
     throw Error('synthetic project save failure');
   };
 },K);
 await select.selectOption('sim');
 await submit(p,'video-project-form');
 await expect(form).toBeVisible();
 await expect(select).toHaveValue('sim');
 await expect(p.locator('#interview-message')).toContainText('保存失败');
 a.deepEqual(await read(p),before);
 await cancel();
 await act(p,'edit-project','p').click();
 await p.locator('#video-project-workflow').fill('other project edit');
 await submit(p,'video-project-form');
 await p.reload();
 await independent(p,'experiences');
 a.deepEqual(await stored(),before.projectCases.find(row=>row.id===project.id));
 a.equal((await read(p)).projectCases.find(row=>row.id==='p').workflow,'other project edit');
 p.once('dialog',d=>d.accept());
 await act(p,'delete-experience','ok').click();
 await p.reload();
 await independent(p,'experiences');
 await act(p,'edit-project',project.id).click();
 await expect(select).toHaveValue('');
 const after=await read(p);
 a.equal((await stored()).experienceId,undefined);
 a.ok(!after.experiences.some(row=>row.id==='ok'));
 a.deepEqual(after.starCases,before.starCases);
 a.deepEqual(after.questions[0].projectCaseIds,before.questions[0].projectCaseIds);
}
async function projectQuestionFacts(p){
 await seed(p);const created=await createProject(p);await tab(p,'questions');
 await act(p,'edit-question','q').click();
 await p.locator('#interview-question-project-options input[value="'+created.id+'"]').check();
 await submit(p,'interview-question-form');await p.reload();await independent(p,'questions');
 const q=(await read(p)).questions.find(x=>x.id==='q');a.ok(q.projectCaseIds.includes(created.id));
 for(const id of ['ok','sim','no','demo','synth'])a.ok(q.experienceIds.includes(id));
 await act(p,'optimize-question','q').click();await p.locator('#generate-interview-answer-prompt').click();
 const prompt=await p.locator('#interview-answer-prompt').inputValue();policy(prompt);a.ok(!prompt.includes(created.projectName),'关联到问题不能把未确认项目变成事实');

 // Confirmed project fixtures exercise indirect links even when the projects themselves reach the prompt.
 await p.evaluate(key=>{
   const data=JSON.parse(localStorage.getItem(key));
   for(const id of ['no','demo','synth']){
     const project={id:'linked-'+id,projectName:'PROJECT_LINK_'+id,confirmedByUser:true};
     data.projectCases.push(project);
     data.questions[0].projectCaseIds.push(project.id);
   }
   localStorage.setItem(key,JSON.stringify(data));
 },K);
 await p.reload();
 await independent(p,'experiences');
 const originalExperiences=(await read(p)).experiences;
 for(const id of ['no','demo','synth']){
   await act(p,'edit-project','linked-'+id).click();
   await p.getByLabel('关联个人经历',{exact:true}).selectOption(id);
   await submit(p,'video-project-form');
   a.equal((await read(p)).projectCases.find(row=>row.id==='linked-'+id).experienceId,id);
 }
 await p.reload();
 await independent(p,'questions');
 await act(p,'optimize-question','q').click();
 await p.locator('#generate-interview-answer-prompt').click();
 const linkedPrompt=await p.locator('#interview-answer-prompt').inputValue();
 policy(linkedPrompt);
 for(const id of ['no','demo','synth'])a.ok(linkedPrompt.includes('PROJECT_LINK_'+id));
 a.deepEqual((await read(p)).experiences,originalExperiences);
}
module.exports={
 projectEditReload,projectDirectLink,projectQuestionFacts,
 interviewLibrary:async p=>{await independent(p,'experiences');a.deepEqual((await read(p)).experiences||[],[]);await add(p,'case A');await add(p,'case B');const rows=(await read(p)).experiences, id=rows.find(e=>e.title==='case A').id,otherId=rows.find(e=>e.title==='case B').id;await act(p,'edit-experience',id).click();await p.locator('#interview-exp-action').fill('edited action');await submit(p,'interview-experience-form');await p.reload();const updated=(await read(p)).experiences.find(e=>e.id===id);a.equal(updated.action,'edited action');a.equal(updated.confirmedByUser,rows.find(e=>e.id===id).confirmedByUser);const other=(await read(p)).experiences.find(e=>e.id===otherId);await independent(p,'experiences');p.once('dialog',d=>d.accept());await act(p,'delete-experience',id).click();a.deepEqual((await read(p)).experiences,[{keywords:[],...other}])},
 interviewIndependentFacts:async p=>{await seed(p);await independent(p,'questions');await act(p,'optimize-question','q').click();await p.locator('#generate-interview-answer-prompt').click();policy(await p.locator('#interview-answer-prompt').inputValue())},
 interviewStarReview:async p=>{await seed(p);await independent(p,'stars');await p.locator('#add-star-case').click();await p.locator('#star-case-experience').selectOption('sim');await p.locator('#star-case-name').fill('new star');await submit(p,'star-case-form');const id=(await read(p)).starCases.find(e=>e.title==='new star').id;await act(p,'edit-star',id).click();await p.locator('#star-case-result').fill('changed');await submit(p,'star-case-form');await tab(p,'reviews');await p.locator('#add-interview-review').click();await p.locator('#interview-review-position').fill('岗位');await p.locator('#interview-review-good').fill('before');await submit(p,'interview-review-form');await act(p,'edit-review').click();await p.locator('#interview-review-good').fill('after');await submit(p,'interview-review-form');await p.reload();const data=await read(p);a.equal(data.starCases.find(e=>e.id===id).experienceId,'sim');a.equal(data.starCases.find(e=>e.id===id).result,'changed');a.deepEqual(data.questions[0].projectCaseIds,['p']);a.equal(data.questions[0].answerDraft,'sample answer');a.equal(data.reviews.length,1);await independent(p,'reviews');await act(p,'edit-review').click();a.equal(await p.locator('#interview-review-good').inputValue(),'after')},
 interviewJobFacts:async p=>{await seed(p);await job(p);await (await reveal(p,'generate-interview-prompt')).click();policy(await p.locator('#job-interview-prompt').inputValue())},
 interviewPractice:async p=>{await seed(p);await job(p);const pack={passStrategy:[{topic:'合成重点',category:'quickPrep'}],topQuestions:Array.from({length:4},(_,i)=>({id:'Q'+i,question:'问题 '+i,signalCategory:['motivation','evidence','coreAbility','riskBoundary'][i]}))};await (await reveal(p,'job-interview-result')).fill(JSON.stringify(pack));await p.locator('#save-interview-result').click();await p.locator('#start-interview-simulation').click();const question=await p.locator('#job-interview-question-text').innerText();await p.locator('#job-interview-answer').fill('sample practice answer');await p.locator('#generate-interview-turn-prompt').click();await (await reveal(p,'job-interview-turn-result')).fill(JSON.stringify({verdict:'enough',feedback:'合成反馈',keyImprovement:'合成建议',reusableMaterialCandidate:{suggestedTitle:'练习案例',situation:'测试背景',action:'测试行动'}}));await p.locator('#save-interview-turn-evaluation').click();await p.locator('[data-interview-material-action=edit]').click();await p.locator('[data-interview-material-field=truth]').check();await p.locator('[data-interview-material-action=confirm]').click();await p.reload();const confirmed=(await read(p)).experiences.find(e=>e.title==='练习案例');a.equal(confirmed.confirmedByUser,true);a.equal(confirmed.sourceType,'jobInterviewSimulation');const session=await p.evaluate(()=>JSON.parse(localStorage.getItem('careerWorkbench.jobsToolkit.v1')).interviewSessions.j[0]);a.equal(session.turns.length,1);a.equal(session.turns[0].question,question);a.equal(session.turns[0].questionId,pack.topQuestions.find(q=>q.question===question).id);a.equal(session.turns[0].userAnswer,'sample practice answer')},
 interviewFailedDelete:async p=>{await seed(p);await independent(p,'experiences');const before=await read(p);await p.evaluate(k=>{const set=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(key,...rest){if(key===k&&fail){fail=false;throw Error('fixture write refused')}return set.call(this,key,...rest)}},K);
 p.once('dialog',d=>d.accept());await act(p,'delete-experience','ok').click();await expect(p.locator('#interview-message')).toContainText('保存失败');a.deepEqual(await read(p),before);
 await act(p,'edit-experience','sim').click();await p.locator('#interview-exp-action').fill('independent edit');await submit(p,'interview-experience-form');await p.reload();const after=await read(p);a.deepEqual(after.experiences.find(e=>e.id==='ok'),before.experiences.find(e=>e.id==='ok'),'Unrelated successful edit must not commit a failed deletion');a.deepEqual(after.questions,before.questions)}
};

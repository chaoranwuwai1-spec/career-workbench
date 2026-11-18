(function(root){
  "use strict";
  const defaults=["英语教育","外贸","国际业务","海外销售","AI相关","其他"];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const key="careerWorkbench.jobsToolkit.v1";
  let records=[];
  const names=[];
  let savedProfile={}, readFailed=false;
  const readMessage="职业方向资料读取异常，已保留上次成功状态并暂停相关修改。请保留原数据，排查后重新打开页面。";
  function failRead(){
    readFailed=true;
    if(root.document){
      const host=document.getElementById("job-manager");
      if(host&&!document.getElementById("job-directions-read-error")){
        const note=document.createElement("p");note.id="job-directions-read-error";note.setAttribute("role","alert");note.textContent=readMessage;host.prepend(note);
      }
    }
    if(root.dispatchEvent)root.dispatchEvent(new Event("job-directions:read-error"));
    return false;
  }
  function object(value){return !!value&&typeof value==="object"&&!Array.isArray(value);}
  function readJson(storageKey,empty){const raw=root.localStorage.getItem(storageKey);return raw===null?empty:JSON.parse(raw);}
  function requireWritable(){
    if(readFailed){failRead();throw Error(readMessage);}
    // Also respect the toolkit owner's sticky read-failure lock.
    if(root.jobResumeStore)root.jobResumeStore.readToolkit();
  }
  function resolve(value){return records.find(x=>x.id===value||x.name===value||(x.aliases||[]).includes(value));}
  function label(value){const x=resolve(value);return x?x.name:value||"其他";}
  function same(a,b){return !!a && !!b && label(a)===label(b);}
  function reload(){
    // Reading legacy labels does not migrate or write any stored record.
    if(readFailed)return failRead();
    try {
    const toolkit=readJson(key,{});
    if(!object(toolkit))throw Error("Invalid toolkit");
    ["careerDirections","resumeVersions","screenshotBatches"].forEach(k=>{if(toolkit[k]!==undefined&&!Array.isArray(toolkit[k]))throw Error("Invalid list");});
    if(toolkit.profile!==undefined&&!object(toolkit.profile))throw Error("Invalid profile");
    const profile=toolkit.profile||{};
    if(profile.jobDirections!==undefined&&(!Array.isArray(profile.jobDirections)||profile.jobDirections.some(x=>typeof x!=="string")))throw Error("Invalid profile directions");
    const next=clone(toolkit.careerDirections||[]);
    if(next.some(x=>!object(x)||typeof x.id!=="string"||typeof x.name!=="string"||(x.aliases!==undefined&&(!Array.isArray(x.aliases)||x.aliases.some(a=>typeof a!=="string")))))throw Error("Invalid direction");
    const jobs=readJson("careerWorkbench.jobs.v1",[]);
    if(!Array.isArray(jobs)||jobs.some(x=>!object(x)))throw Error("Invalid jobs");
    if((toolkit.resumeVersions||[]).some(x=>!object(x))||(toolkit.screenshotBatches||[]).some(b=>!object(b)||(b.groups!==undefined&&(!Array.isArray(b.groups)||b.groups.some(g=>!object(g))))))throw Error("Invalid related records");
    const batchLabels=(toolkit.screenshotBatches||[]).flatMap(b=>(b.groups||[]).map(g=>g.draft&&g.draft.jobDirection));
    const legacy=defaults.concat((toolkit.resumeVersions||[]).map(x=>x.direction),jobs.map(x=>x.jobDirection),(toolkit.profile||{}).jobDirections||[],batchLabels);
    legacy.filter(x=>typeof x==="string"&&x.trim()).forEach(name=>{if(!next.some(x=>x.id===name||x.name===name||(x.aliases||[]).includes(name)))next.push({id:"direction-legacy-"+encodeURIComponent(name),name,active:true,aliases:[]});});
    const nextProfile=clone(profile),nextNames=next.map(x=>x.name);
    records=next;savedProfile=nextProfile;names.splice(0,names.length,...nextNames);
    return true;
    }catch(error){return failRead();}
  }
  function change(id,name,active){
    requireWritable();
    if(!reload())throw Error(readMessage);
    name=String(name||"").trim();
    if(!name)throw Error("请填写职业方向名称。");
    const old=resolve(id), collision=resolve(name);
    if(collision&&collision!==old)throw Error("该方向或历史名称已存在，请使用已有方向。");
    const next=clone(records);
    if(old){const item=next.find(x=>x.id===old.id);if(item.name!==name)item.aliases=Array.from(new Set((item.aliases||[]).concat(item.name)));item.name=name;item.active=active;}
    else next.push({id:"direction-"+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now()+"-"+Math.random().toString(16).slice(2)),name,active:true,aliases:[],createdAt:new Date().toISOString()});
    root.jobResumeStore.saveDirections(next);
    const refreshed=sync();
    if(refreshed)root.dispatchEvent(new Event("job-directions:changed"));
    return {saved:true,refreshed};
  }
  function options(existing){return records.filter(x=>x.active!==false||same(x.name,existing)).map(x=>({value:x.name,label:x.name+(x.active===false?"（已停用）":"")}));}
  function sync(){
    if(!reload())return false;
    if(!root.document)return true;
    const list=document.getElementById("job-direction-options");
    if(list){list.replaceChildren();options().forEach(x=>{const o=document.createElement("option");o.value=x.value;list.appendChild(o);});}
    const filter=document.getElementById("job-direction-filter");
    if(filter){const selected=filter.value;filter.replaceChildren(new Option("全部方向","全部"));records.forEach(x=>filter.add(new Option(x.name+(x.active===false?"（已停用）":""),x.name)));filter.value=label(selected)==="全部"?"全部":label(selected);}
    const first=document.querySelector("[data-profile-direction]");
    if(first){const holder=first.closest("fieldset")||first.parentElement.parentElement;
      const saved=savedProfile;
      records.forEach(x=>{let box=Array.from(holder.querySelectorAll("[data-profile-direction]")).find(b=>same(b.value,x.name));
        if(!box){const l=document.createElement("label");box=document.createElement("input");box.type="checkbox";box.dataset.profileDirection="";box.checked=(saved.jobDirections||[]).some(v=>same(v,x.name));l.append(box,document.createTextNode(x.name));holder.appendChild(l);}
        box.value=x.name;box.disabled=x.active===false&&!box.checked;
        const text=box.nextSibling;if(text&&text.nodeType===3)text.textContent=x.name+(x.active===false?"（已停用）":"");
      });
    }
    return true;
  }
  function manage(){
    try{requireWritable();}catch(error){failRead();return;}
    if(!reload())return;
    const d=document.createElement("dialog");d.className="resume-dialog";
    const h=document.createElement("h2");h.textContent="职业方向管理";
    const status=document.createElement("p");status.setAttribute("role","status");
    const content=document.createElement("div");
    function button(text,fn){const b=document.createElement("button");b.type="button";b.className="secondary-button";b.textContent=text;b.onclick=()=>{
      let outcome;
      try{outcome=fn();}catch(e){status.textContent="未保存："+e.message;status.scrollIntoView({block:"nearest"});return;}
      if(!outcome||!outcome.saved)return;
      let refreshed=outcome.refreshed;
      try{if(refreshed!==false)refreshed=render();}catch(error){failRead();refreshed=false;}
      status.textContent=refreshed===false?"保存已成功，但刷新读取失败；请勿重复提交。原数据未回滚，相关修改已暂停。":"保存成功";
      status.scrollIntoView({block:"nearest"});
    };return b;}
    function input(text){const x=document.createElement("input");x.value=text||"";return x;}
    function render(){
      let versions,jobs;
      try{requireWritable();versions=root.jobResumeStore.read().resumeVersions||[];jobs=root.jobWorkspace.getJobs();}catch(error){failRead();return false;}
      content.replaceChildren();records.forEach(x=>{
      const row=document.createElement("div"),name=input(x.name);name.setAttribute("aria-label","方向名称："+x.name);
      row.append(name,button("保存名称",()=>change(x.id,name.value,x.active)),button(x.active===false?"恢复":"停用",()=>change(x.id,x.name,x.active===false)));
      const note=document.createElement("p");note.textContent=versions.some(v=>same(v.direction,x.name))?"已有对应方向简历":"对应简历：尚未建立";row.appendChild(note);content.appendChild(row);
    });const name=input();name.placeholder="新增职业方向";name.setAttribute("aria-label","新增职业方向");content.append(name,button("新增方向",()=>change(null,name.value,true)));
      const heading=document.createElement("h3");heading.textContent="调整已有岗位方向 / 辅助标签";content.appendChild(heading);
      const pick=document.createElement("select"), direction=document.createElement("select"),tags=input();
      pick.setAttribute("aria-label","选择岗位");jobs.forEach(j=>pick.add(new Option((j.internalJobId||"")+"｜"+(j.company||"公司待确认")+"｜"+j.position,j.id)));
      direction.setAttribute("aria-label","主要方向");tags.setAttribute("aria-label","辅助标签");tags.placeholder="辅助标签，用逗号分开";
      function fill(){const j=jobs.find(x=>x.id===pick.value);direction.replaceChildren();options(j&&j.jobDirection).forEach(x=>direction.add(new Option(x.label,x.value)));direction.value=j?label(j.jobDirection):"其他";tags.value=j?(j.directionTags||[]).join("，"):"";}
      pick.onchange=fill;fill();content.append(pick,direction,tags,button("保存所选岗位方向",()=>{requireWritable();const target=resolve(direction.value);if(!target)throw Error("请选择方向");root.jobResumeStore.saveJob(pick.value,{jobDirection:target.name,jobDirectionId:target.id,directionTags:tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean)});return {saved:true,refreshed:!readFailed};}));
      return true;
    }
    const close=button("关闭",()=>{d.close();d.remove();});d.append(h,close,status,content);document.body.appendChild(d);if(!render())status.textContent=readMessage;d.showModal();
  }
  root.jobDirections={names,resolve,label,same,options,change,reload,sync,manage,get readFailed(){return readFailed;}};
  if(typeof module!=="undefined")module.exports=root.jobDirections;
  reload();
  if(root.addEventListener)root.addEventListener("job-workspace:changed",()=>{sync();});
  if(root.document)document.addEventListener("DOMContentLoaded",()=>{sync();document.getElementById("job-directions-manage").onclick=manage;});
})(typeof window==="undefined"?globalThis:window);

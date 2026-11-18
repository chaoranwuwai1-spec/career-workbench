(function (root) {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  const id = () => "resume-" + (root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
  const directions = root.jobDirections ? root.jobDirections.names : ["英语教育", "外贸", "国际业务", "海外销售", "AI相关", "其他"];
  const sameDirection=(a,b)=>root.jobDirections ? root.jobDirections.same(a,b) : a===b;
  const projectView=root.jobProjectFacts ? root.jobProjectFacts.projectView : require("./job-project-facts.js").projectView;
  function factSource(profile) {
    const fields = { currentIdentity:"当前身份", education:"学历", school:"学校", major:"专业", graduationYear:"毕业年份", workExperience:"工作经历", internshipStatus:"实习情况", internshipExperience:"实习经历", experiences:"已记录经历", projectExperience:"项目经历", englishAbilityDescription:"英语实际能力", englishReading:"英语阅读", englishWriting:"英语写作", englishListening:"英语听力", englishSpeaking:"英语口语", englishHasCertificate:"是否有英语证书", englishCertificateDetails:"英语证书详情", englishCertificates:"英语证书记录", japaneseAbilityDescription:"日语实际能力", japaneseLevel:"日语水平", japaneseHasCertificate:"是否有日语证书", japaneseCertificateDetails:"日语证书详情", otherLanguageProfiles:"其他语言", digitalToolPractices:"数字工具实践", aiToolsAbility:"AI工具能力", officeDataAbility:"Office及数据处理", salesCommunicationAbility:"沟通能力", teachingAbility:"教学能力", otherSkills:"其他技能", certificates:"证书记录", hasDrivingLicense:"是否有驾照", drivingLicenseType:"驾照类型", drivingProficiency:"实际驾驶熟练度", hasTeacherQualification:"是否有教师资格", teacherQualificationDetails:"教师资格详情", otherQualifications:"其他资格" };
    const selected = {};
    Object.keys(fields).forEach(key => { const v = profile[key]; if (v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)) selected[key] = copy(v); });
    const allowedProjects=(Array.isArray(profile.projects)?profile.projects:[]).filter(Boolean).map(projectView).filter(p=>p.resumeAllowed===true).map(p=>{["name","type","ongoing","responsibilities","completedWork","tools","allowInResume"].forEach(k=>delete p[k]);return p;});
    if(allowedProjects.length) { selected.projects=copy(allowedProjects);fields.projects="已授权用于简历的真实项目"; }
    function describe(v) {
      if (Array.isArray(v)) return v.map(describe).join("\n");
      if (v && typeof v === "object") return Object.entries(v).filter(([k,x]) => k !== "id" && x !== "" && x != null).map(([k,x]) => ({name:"名称",type:"类型",field:"方向",startDate:"开始",endDate:"结束",description:"内容",isRealWorkExperience:"是否真实工作",tool:"工具",text:"记录"}[k] || k) + "：" + describe(x)).join("；");
      return String(v);
    }
    return { profileSavedAt: profile.savedAt || "", facts: selected, content: Object.entries(selected).map(([k,v]) => fields[k] + "：" + describe(v)).join("\n\n") };
  }
  function createVersion(versions, previous, values, source, now) {
    if (!values.name.trim() || !values.content.trim()) throw new Error("请填写简历名称和完整内容。");
    if (!directions.includes(values.direction) && !(root.jobDirections && root.jobDirections.resolve(values.direction))) throw new Error("请选择简历方向。");
    if (!source || !Object.keys(source.facts || {}).length) throw new Error("请先完善并保存求职档案，再从档案建立简历。");
    const seriesId = previous ? previous.seriesId || previous.id : id();
    const versionNumber = versions.filter(v => (v.seriesId || v.id) === seriesId).reduce((n,v) => Math.max(n, Number(v.versionNumber) || 1), 0) + 1;
    const version={ id: id(), seriesId, versionNumber, name: values.name.trim(), direction: values.direction, content: values.content.trim(), source: copy(source), createdAt: now, truthConfirmedAt: now };
    const role=Object.prototype.hasOwnProperty.call(values,"role")?values.role:previous&&previous.role;
    if(role) {
      if(!["directionMaster","jobTailored"].includes(role))throw Error("简历角色无效。");
      version.role=role;
      const direction=root.jobDirections&&root.jobDirections.resolve(values.direction);if(direction)version.directionId=direction.id;
      if(role==="jobTailored") {
        const master=versions.find(v=>v.id===values.sourceMasterResumeId && v.role==="directionMaster" && v.versionNumber===values.sourceMasterVersion);
        if(!master || !values.jobId)throw Error("岗位定制必须关联确定的方向母版版本和岗位。");
        version.sourceMasterResumeId=master.id;version.sourceMasterVersion=master.versionNumber;version.jobId=values.jobId;
      }
    }
    return version;
  }
  function createDraft(job, version, content, now) {
    if (!version || !content.trim()) throw new Error("请选择简历，并保留完整内容。");
    const draft={ id:id(), jobId:job.id, resumeVersionId:version.id, resumeVersionNumber:version.versionNumber, resumeName:version.name, direction:version.direction, content:content.trim(), source:copy(version.source), savedAt:now, truthConfirmedAt:now };
    if(version.role==="directionMaster" || version.role==="jobTailored") {
      if(version.role==="jobTailored"&&version.jobId!==job.id)throw Error("该定制版属于其他岗位。");
      draft.sourceMasterResumeId=version.role==="directionMaster"?version.id:version.sourceMasterResumeId;
      draft.sourceMasterVersion=version.role==="directionMaster"?version.versionNumber:version.sourceMasterVersion;
      draft.sourceTailoredResumeId=version.role==="jobTailored"?version.id:null;
      draft.sourceTailoredVersion=version.role==="jobTailored"?version.versionNumber:null;
    }
    return draft;
  }
  function application(job, draft, appliedAt, now) {
    if (!draft || draft.jobId !== job.id || !draft.content || !draft.resumeVersionId) throw new Error("请先保存当前岗位准备使用的简历。");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedAt) || new Date(appliedAt + "T00:00:00Z").toISOString().slice(0,10) !== appliedAt) throw new Error("请填写有效投递日期。");
    const history = copy(job.applicationResumeSnapshots || []);
    if (history.some(x => x.resumeDraftId === draft.id && x.appliedAt === appliedAt)) throw new Error("这份岗位简历在该日期已有投递快照，没有重复保存。");
    history.push({ id:id(), jobId:job.id, resumeDraftId:draft.id, resumeVersionId:draft.resumeVersionId, resumeVersionNumber:draft.resumeVersionNumber, resumeName:draft.resumeName, content:draft.content, source:copy(draft.source), appliedAt, recordedAt:now, company:job.company || "", position:job.position || "", snapshotType:"text", confirmedActuallySent:true });
    Object.assign(history[history.length-1],{sourceMasterResumeId:draft.sourceMasterResumeId||null,sourceMasterVersion:draft.sourceMasterVersion||null,sourceTailoredResumeId:draft.sourceTailoredResumeId||null,sourceTailoredVersion:draft.sourceTailoredVersion||null});
    // Re-recording an application must not roll an interview/offer back to applied.
    return { resumeDraft:copy(draft), applicationResumeSnapshots:history, applicationDate:job.applicationDate || appliedAt, status:["发现岗位","准备投递"].includes(job.status) ? "已投递" : job.status || "已投递" };
  }
  function prepareRestore(incomingJobs, incomingToolkit, currentJobs, currentToolkit) {
    validateRestoreData(incomingJobs,incomingToolkit);
    validateRestoreData(currentJobs,currentToolkit);
    const jobs=copy(incomingJobs), toolkit=Object.assign({},copy(currentToolkit),copy(incomingToolkit));
    if(Object.prototype.hasOwnProperty.call(incomingToolkit,"profile")) toolkit.profile=Object.assign({},copy(currentToolkit.profile||{}),copy(incomingToolkit.profile));
    if(currentToolkit.profile&&currentToolkit.profile.projects && (!toolkit.profile||!Object.prototype.hasOwnProperty.call(toolkit.profile,"projects")))toolkit.profile=Object.assign({},toolkit.profile,{projects:copy(currentToolkit.profile.projects)});
    if (!Object.prototype.hasOwnProperty.call(toolkit,"resumeVersions")) toolkit.resumeVersions=copy(currentToolkit.resumeVersions || []);
    if (!Object.prototype.hasOwnProperty.call(toolkit,"careerDirections") && currentToolkit.careerDirections) toolkit.careerDirections=copy(currentToolkit.careerDirections);
    ["interviewResumeChoices","interviewPackages","interviewSessions","interviewDebriefs"].forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(toolkit,key) && currentToolkit[key])toolkit[key]=copy(currentToolkit[key]);
    });
    if (!Array.isArray(toolkit.resumeVersions)) throw new Error("备份简历版本格式异常");
    currentJobs.forEach(old=>{
      const incoming=jobs.find(x=>x.id===old.id);
      const protectedData=old.resumeDraft || (old.applicationResumeSnapshots || []).length;
      if (!incoming && protectedData) throw new Error("备份缺少已有简历/快照的岗位 " + (old.position || old.id) + "，为保护记录，已停止恢复");
      if (!incoming) return;
      Object.keys(old).forEach(key=>{if(!Object.prototype.hasOwnProperty.call(incoming,key))incoming[key]=copy(old[key]);});
      ["resumeDraft","applicationResumeSnapshots"].forEach(key=>{if (!Object.prototype.hasOwnProperty.call(incoming,key) && old[key] !== undefined) incoming[key]=copy(old[key]);});
    });
    jobs.forEach(j=>{if (j.applicationResumeSnapshots !== undefined && !Array.isArray(j.applicationResumeSnapshots)) throw new Error("备份投递快照格式异常");});
    // Do not remove an existing version that a retained draft/master reference needs.
    const oldIds=new Set((currentToolkit.resumeVersions||[]).map(v=>v.id));
    const nextIds=new Set(toolkit.resumeVersions.map(v=>v.id));
    jobs.map(j=>j.resumeDraft).concat(toolkit.resumeVersions).filter(Boolean).forEach(item=>{
      [item.resumeVersionId,item.sourceMasterResumeId].filter(Boolean).forEach(ref=>{if(oldIds.has(ref)&&!nextIds.has(ref))throw Error("恢复资料缺少仍被岗位或简历引用的版本，已停止恢复");});
    });
    return {jobs,toolkit};
  }

  // Validate without normalizing: missing legacy fields are not empty collections.
  function validateRestoreData(jobs,toolkit) {
    const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
    const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
    function safe(x){if(!x||typeof x!=="object")return;Object.keys(x).forEach(k=>{if(["__proto__","prototype","constructor"].includes(k))throw Error("恢复资料包含不安全字段");safe(x[k]);});}
    function records(items,label,ids){
      if(!Array.isArray(items)||items.some(x=>!obj(x)))throw Error(label+"格式异常：必须是记录数组");
      if(ids){const seen=new Set();items.forEach(x=>{if(typeof x.id!=="string"||!x.id.trim()||seen.has(x.id))throw Error(label+"的ID缺失或重复");seen.add(x.id);});}
    }
    safe(jobs);safe(toolkit);records(jobs,"岗位",true);
    if(!obj(toolkit))throw Error("求职工具库格式异常");
    jobs.forEach(j=>{
      ["company","position","status","jobDirection","jd","notes","applicationDate","resumeVersionId"].forEach(k=>{if(own(j,k)&&typeof j[k]!=="string")throw Error("岗位字段格式异常："+k);});
      ["applicationResumeSnapshots","screeningHistory"].forEach(k=>{if(own(j,k))records(j[k],k,false);});
      if(own(j,"resumeDraft")&&j.resumeDraft!==null&&!obj(j.resumeDraft))throw Error("岗位简历格式异常");
    });
    ["resumeVersions","careerDirections","screenshotHistory","screenshotBatches"].forEach(k=>{if(own(toolkit,k))records(toolkit[k],k,["resumeVersions","careerDirections"].includes(k));});
    ["profile","analyses","interviews","interviewResumeChoices","interviewPackages","interviewSessions","interviewDebriefs","screeningHistory"].forEach(k=>{if(own(toolkit,k)&&!obj(toolkit[k]))throw Error("工具库字段格式异常："+k);});
    ["analyses","interviews","interviewResumeChoices"].forEach(k=>{Object.values(toolkit[k]||{}).forEach(v=>{if(!obj(v))throw Error("工具库记录格式异常："+k);});});
    ["interviewPackages","interviewSessions","interviewDebriefs","screeningHistory"].forEach(k=>{Object.values(toolkit[k]||{}).forEach(v=>records(v,k,false));});
    const profile=toolkit.profile||{};
    ["experiences","projects","otherLanguageProfiles","digitalToolPractices","currentGaps"].forEach(k=>{if(own(profile,k))records(profile[k],"档案 "+k,false);});
    if(own(profile,"jobDirections")&&(!Array.isArray(profile.jobDirections)||profile.jobDirections.some(x=>typeof x!=="string")))throw Error("档案方向格式异常");
    (toolkit.resumeVersions||[]).forEach(v=>{["content","name","direction"].forEach(k=>{if(own(v,k)&&typeof v[k]!=="string")throw Error("简历字段格式异常："+k);});});
    return true;
  }
  function recommended(versions, direction) {
    return versions.filter(v=>v.role!=="jobTailored" && v.active!==false && sameDirection(v.direction,direction)).sort((a,b)=>Number(b.role==="directionMaster")-Number(a.role==="directionMaster")||Number(!!b.isDefault)-Number(!!a.isDefault)||(b.createdAt||"").localeCompare(a.createdAt||""))[0] || null;
  }
  function metadata(versions, versionId, action) {
    const next=copy(versions), selected=next.find(v=>v.id===versionId);
    if(!selected)throw Error("简历版本不存在。");
    if(action==="default") {
      if(selected.role==="jobTailored")throw Error("岗位定制版不能设为方向默认母版。");
      if(selected.active===false)throw Error("请先恢复此版本，再设为默认。");
      next.filter(v=>sameDirection(v.direction,selected.direction) && (v.role==="directionMaster") === (selected.role==="directionMaster")).forEach(v=>{v.isDefault=v.id===versionId;});
    } else if(action==="toggle") {selected.active=selected.active===false;if(!selected.active)selected.isDefault=false;}
    else throw Error("未知简历操作。");
    return next;
  }
  function removeVersions(versions, versionIds) {
    if (!Array.isArray(versions)) throw Error("简历版本数据格式异常。");
    const ids=new Set((Array.isArray(versionIds)?versionIds:[]).filter(Boolean));
    if(!ids.size)throw Error("请先选择要删除的简历版本。");
    const removed=versions.filter(v=>v&&ids.has(v.id));
    if(removed.length!==ids.size)throw Error("部分简历版本已经不存在，请刷新后重试。");
    return {
      versions:copy(versions.filter(v=>!ids.has(v.id))),
      removed:copy(removed),
      removedDefaultDirections:[...new Set(removed.filter(v=>v.isDefault).map(v=>v.direction).filter(Boolean))]
    };
  }
  function generation(source,direction,job,baseResume) {
    if(!source || !Object.keys(source.facts||{}).length)throw Error("请先保存求职档案中的真实事实。");
    const requestId=id();
    const prompt='请根据下方唯一事实来源整理简历。方向只决定重点与顺序，不代表工作经验。不得新增任何经历、证书、熟练度或技能；AI工具实践不是AI从业经历，有驾照不等于熟练驾驶，学习语言不等于持证。未知不写。JD仅用于选择已有事实，不能作为个人事实。若提供baseResume，只做必要的强化、弱化、顺序和措辞调整，不重新虚构一份简历；与当前档案不一致的内容需指出供用户确认。仅返回JSON：{"requestId":"'+requestId+'","name":"简历名称","content":"完整简历正文","factsUsed":["引用的facts字段名"],"adjustments":["调整及事实依据"]}。factsUsed只能使用实际给出的字段。内容供本人核实，不可自动宣称已核实。\n'+JSON.stringify({requestId,direction,source,baseResume:baseResume||null,job:job?{id:job.id,position:job.position,jd:job.jd}:null},null,2);
    const editorialRules='【正式简历内容选择规则】\n事实库用于限制真实性，不要求输出所有事实。先按当前方向筛选相关且适合展示的事实，再组织为正式简历。负面事实和缺失项（如能力仍需提升、无证书、驾驶不熟练、暂无实习）用于约束，原则上不主动写入正文；不得因此声称相反能力。只在确实相关且有必要时选择有价值事实。禁止机械复制档案标签；没有内容的栏目不生成。按实际内容灵活使用求职方向、教育背景、工作/实践经历、项目经历、技能/工具。优先使用projects中的具体职责、工作和可验证成果；项目名称或“AI工具实践较多”不能扩写成AI行业、工程师、产品或智能体开发经验。不得从其他模块代码、聊天上下文或个人AI工作台这一名称推断项目事实。旧项目概述仅能使用实际已写出的细节。\n在返回JSON中额外加入 omittedFacts:[{fact:"实际facts字段名",reason:"为何不建议主动写入当前简历"}] 和 missingUsefulFacts:["若真实存在，建议补充的材料"]。这些说明置于正文之外，不是个人事实；建议补充的信息不得自动填入简历。\n';
    const layerRules=job?'【岗位轻量定制】必须从baseResume指定的母版及正文出发，按JD重排、强化、删减已有内容，保留来源版本；不从零生成，JD关键词必须符合真实能力。':'【方向母版】生成Direction Master Resume，完整组织此方向所有可用真实材料，不以单份投递简历的篇幅为上限，也不刻意写短摘要。综合profile事实、experiences、已授权projects以及tools/skills。按方向分别写求职简介、排序技能、调整真实经历bullet的重点和顺序、选择相关项目。不得用空话补长度。材料不足列出missingUsefulFacts，优先提示用户补充真实任务、次要项目、工具使用流程、成果、项目阶段和作品链接。';
    return {requestId,source:copy(source),direction,prompt:layerRules+'\n'+editorialRules+prompt};
  }
  function generatedResult(raw,request) {
    const data=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""));
    if(!request || data.requestId!==request.requestId)throw Error("结果与本次生成请求不对应，请使用本次提示词。");
    if(typeof data.content!=="string"||!data.content.trim()||typeof data.name!=="string"||!data.name.trim())throw Error("JSON缺少简历名称或完整正文。");
    if(!Array.isArray(data.factsUsed)||!data.factsUsed.length||data.factsUsed.some(k=>!Object.prototype.hasOwnProperty.call(request.source.facts,k)))throw Error("事实引用缺失或引用了档案中不存在的字段，请核对。");
    const omitted=data.omittedFacts===undefined?[]:data.omittedFacts;
    const missing=data.missingUsefulFacts===undefined?[]:data.missingUsefulFacts;
    if(!Array.isArray(omitted)||omitted.some(x=>!x||typeof x.fact!=="string"||!Object.prototype.hasOwnProperty.call(request.source.facts,x.fact)||typeof x.reason!=="string")||!Array.isArray(missing)||missing.some(x=>typeof x!=="string"))throw Error("未采用事实/待补充材料格式不正确，请核对 omittedFacts 和 missingUsefulFacts。");
    const source=copy(request.source);
    const adjustments=Array.isArray(data.adjustments)?data.adjustments.filter(x=>typeof x==="string"):[];
    source.resumeEditorialNotes={omittedFacts:copy(omitted),missingUsefulFacts:copy(missing),adjustments:copy(adjustments)};
    return {name:data.name,content:data.content,source,omittedFacts:copy(omitted),missingUsefulFacts:copy(missing),adjustments};
  }
  const core = {copy, factSource, createVersion, createDraft, application, prepareRestore, validateRestoreData, directions, recommended, metadata, removeVersions, generation, generatedResult};
  if (typeof module !== "undefined") module.exports = core;
  root.jobResumeCore = core;
  if (!root.document) return;
  let dialog, body, feedback;
  let activeSaveAction=null;
  function saveVersions(versions) {
    store().saveVersions(versions);
    if(activeSaveAction)activeSaveAction.saved="简历版本";
  }
  function saveJob(jobId,changes) {
    try { store().saveJob(jobId,changes); }
    catch(error) {
      if(activeSaveAction&&activeSaveAction.saved==="简历版本")activeSaveAction.partial=true;
      throw error;
    }
    if(activeSaveAction){activeSaveAction.saved="岗位记录";activeSaveAction.partial=false;}
  }
  function readingFailure(error,nearby) {
    report("读取异常，当前编辑内容已保留，未用空档案替换。"+(error&&error.message?error.message:"请检查资料读取状态。"),"error",nearby);
  }
  let hasUnsavedJobContent=()=>false;
  function confirmDiscard(){return !hasUnsavedJobContent() || root.confirm("本岗位简历有尚未保存的修改。关闭会丢失这些修改；已保存简历和投递记录不变。仍然关闭吗？");}
  root.addEventListener("beforeunload",event=>{if(dialog&&dialog.open&&hasUnsavedJobContent()){event.preventDefault();event.returnValue="";}});
  function node(tag, text, cls) { const e=document.createElement(tag); if(text!==undefined)e.textContent=text; if(cls)e.className=cls; return e; }
  function report(message, type, nearby) {
    const text=String(message || (type === "success" ? "操作成功。" : "操作失败。"));
    if (feedback) {
      feedback.textContent=text;
      feedback.dataset.type=type || "error";
    }
    if (nearby) {
      nearby.textContent=text;
      nearby.dataset.type=type || "error";
      if (nearby.scrollIntoView) nearby.scrollIntoView({block:"nearest"});
    } else if (feedback && feedback.scrollIntoView) {
      feedback.scrollIntoView({block:"nearest"});
    }
    if (root.jobWorkspace && typeof root.jobWorkspace.showMessage === "function") {
      root.jobWorkspace.showMessage(text,type === "success" ? "success" : "delete");
    }
  }
  function button(label, fn, primary, nearby) {
    const b=node("button",label,primary?"primary-button":"secondary-button");b.type="button";
    b.onclick=()=>{
      if(b.disabled)return;
      const action={saved:null,partial:false};activeSaveAction=action;
      try { fn(); }
      catch(e) {
        if(action.saved){
          b.disabled=true;
          report(action.partial?"部分成功：岗位定制版本已保存，但岗位关联失败。已保存版本不会删除，当前文字已保留。请重新打开岗位并选择已保存的定制版本后关联，不要重复创建版本。":"已经保存，但页面刷新失败。当前编辑内容已保留；请重新打开查看已保存记录，不要重复提交。","error",nearby);
        }else report("未保存："+(e && e.message ? e.message : "发生未知错误"),"error",nearby);
      }
      finally {activeSaveAction=null;}
    };
    return b;
  }
  function field(label, control) { const l=node("label",label,"resume-field");control.setAttribute("aria-label",label);l.appendChild(control);body.appendChild(l);return control; }
  function input(value,type) { const e=node("input");e.type=type||"text";e.value=value||"";return e; }
  function area(value,readOnly) { const e=node("textarea");e.rows=12;e.value=value||"";e.readOnly=!!readOnly;return e; }
  function choose(options,value) { const e=node("select");options.forEach(x=>{const o=node("option",x.label);o.value=x.value;e.appendChild(o);});e.value=value||"";return e; }
  function show(title) {
    hasUnsavedJobContent=()=>false;
    if (!dialog) {
      dialog=node("dialog",undefined,"resume-dialog");dialog.setAttribute("aria-label","简历版本与投递记录");
      document.body.appendChild(dialog);
      dialog.addEventListener("cancel",event=>{if(!confirmDiscard())event.preventDefault();});
    }
    dialog.replaceChildren();const h=node("h2",title);dialog.append(h,button("关闭",()=>{if(confirmDiscard())dialog.close();}));
    feedback=node("p", "", "resume-feedback");feedback.setAttribute("role","status");dialog.appendChild(feedback);
    body=node("div");dialog.appendChild(body);if(!dialog.open)dialog.showModal();
  }
  function store(){if(!root.jobResumeStore)throw new Error("求职资料尚未加载，请重新打开求职中心。");return root.jobResumeStore;}
  function truthful() { const e=input("","checkbox");field("我确认内容仅来自已记录的真实事实，没有增加不存在的经历、证书或能力。",e);return e; }
  function requireTruth(c){if(!c.checked)throw new Error("请先对照求职档案核实真实性，并勾选确认。");}
  function generationControls(direction,receive,job,base,review) {
    const panel=node("details");panel.appendChild(node("summary",job?"针对JD优化（主动开启，不改母版）":"根据档案生成方向简历（ChatGPT）"));
    const prompt=area("",true),result=area("");prompt.setAttribute("aria-label","简历生成提示词");result.setAttribute("aria-label","简历生成JSON");
    let request,baseAtGeneration;
    let refreshReview=()=>{};
    if(review){
      const reviewBox=node("section");reviewBox.appendChild(node("h3","定制后完整简历正文"));
      const status=node("p");status.setAttribute("data-tailored-status","");status.setAttribute("role","status");
      const preview=area("",true);preview.setAttribute("aria-label","定制后完整简历正文预览");
      const notes=node("div");notes.setAttribute("data-tailored-notes","");
      reviewBox.append(status,preview,button("编辑这份正文",review.edit),notes);panel.appendChild(reviewBox);
      refreshReview=()=>{const value=review.read();preview.value=value.content;status.textContent=value.status;notes.replaceChildren();if(value.content){if(value.source&&value.source.resumeEditorialNotes)editorialNotes(notes,value.source);else notes.textContent="这份历史正文没有保存补充说明，不能自动还原当时AI的说明。"}};
      refreshReview();
    }
    const changes=node("p");
    const warning=node("p");
    panel.appendChild(warning);
    panel.addEventListener("toggle",()=>{
      if(!panel.open||!panel.isConnected)return;
      try{const facts=factSource(store().read().profile).facts;warning.textContent=/AI/i.test(direction())&&!facts.projects?.some(p=>p.actualResponsibilities&&p.actualWork)?"当前AI方向缺少已授权且有职责、成果细节的项目记录。如果你确实做过个人AI工作台等项目，请先补充真实项目经历；系统不会据此自行扩写。":"";}
      catch(error){readingFailure(error,warning);}
    });
    panel.append(button("生成简历提示词",()=>{const selected=base?base():null;if(job&&!selected?.resumeVersionId)throw Error("请先选择基础简历版本。");baseAtGeneration=JSON.stringify(selected);request=generation(factSource(store().read().profile),direction(),job,selected);prompt.value=request.prompt;report("提示词已生成；仅提供已保存事实，未调用API。","success");}),node("p","以下是用于下一次生成的提示词，不是已保存的简历正文。"),prompt,
      button("选择提示词以复制",()=>{if(!prompt.value)throw Error("请先生成提示词。");prompt.focus();prompt.select();const ok=document.execCommand("copy");report(ok?"提示词已复制。":"已选中全部提示词，请按 Ctrl+C 复制。","success");}),node("p","将本次ChatGPT返回的结果粘贴到下框，再导入。"),result,
      button("导入简历建议到编辑框",()=>{const data=generatedResult(result.value,request);if(request.direction!==direction() || baseAtGeneration!==JSON.stringify(base?base():null))throw Error("方向或基础简历已改变，请重新生成提示词。");receive(data);changes.replaceChildren();if(!review)editorialNotes(changes,data.source);refreshReview();report("已填入建议，尚未保存。请核实正文、勾选真实性，再点击保存；未保存的修改不会保留。","success");}),changes);body.appendChild(panel);
    return {refreshReview,panel};
  }
  function editorialNotes(container,source) {
    const notes=source&&source.resumeEditorialNotes;if(!notes)return;
    container.appendChild(node("strong","内容取舍说明（不属于简历正文）"));
    (notes.adjustments||[]).forEach(x=>container.appendChild(node("p","调整说明："+x)));
    (notes.omittedFacts||[]).forEach(x=>container.appendChild(node("p","未采用："+x.fact+" — "+x.reason)));
    (notes.missingUsefulFacts||[]).forEach(x=>container.appendChild(node("p","建议补充真实材料："+x)));
  }
  function deleteVersionPrompt(selectedVersions, bulk) {
    const jobs=root.jobWorkspace.getJobs();
    const ids=new Set(selectedVersions.map(v=>v.id));
    const defaultNames=selectedVersions.filter(v=>v.isDefault).map(v=>v.direction+"｜"+v.name);
    const usedBy=jobs.filter(job=>job.resumeDraft&&ids.has(job.resumeDraft.resumeVersionId));
    const lines=bulk
      ? ["即将删除 "+selectedVersions.length+" 份简历版本。", "删除后将从简历版本库中移除。"]
      : ["确定删除这份简历吗？", "删除后将从简历版本库中移除。"]; 
    lines.push("不会删除求职档案、岗位、JD、投递历史或已经保存的投递简历快照。");
    if(defaultNames.length)lines.push("其中 "+defaultNames.length+" 份是当前默认方向母版；删除后需要重新选择默认母版。");
    if(usedBy.length)lines.push("有 "+usedBy.length+" 个岗位正在使用所选版本；岗位正文会保留，但需要重新选择可用版本后再保存或投递。");
    return lines.join("\n");
  }
  function deleteResumeVersions(versionIds, bulk) {
    const current=store().read();
    const result=removeVersions(current.resumeVersions,versionIds);
    if(!root.confirm(deleteVersionPrompt(result.removed,bulk)))return false;
    saveVersions(result.versions);
    root.jobWorkspace.refresh();
    let notice="已删除 "+result.removed.length+" 份简历版本；其他资料和历史投递快照没有改变。";
    if(result.removedDefaultDirections.length)notice+=" 已删除默认母版的方向："+result.removedDefaultDirections.join("、")+"，请重新设置默认母版。";
    library("",notice);
    return true;
  }
  function versionManager(versions) {
    const section=node("section",undefined,"resume-version-manager");
    const heading=node("div",undefined,"resume-version-manager__heading");
    heading.appendChild(node("h3","批量管理（共 "+versions.length+" 份）"));
    const allLabel=node("label",undefined,"resume-version-manager__select-all");
    const all=input("","checkbox");all.setAttribute("aria-label","全选当前列表");
    allLabel.append(all,node("span","全选当前列表"));
    const removeSelected=button("删除已选",()=>{
      const selected=Array.from(section.querySelectorAll("[data-resume-delete-select]:checked")).map(item=>item.value);
      deleteResumeVersions(selected,true);
    });
    removeSelected.classList.add("danger-button");removeSelected.disabled=true;
    heading.append(allLabel,removeSelected);section.appendChild(heading);
    const list=node("div",undefined,"resume-version-manager__list");
    versions.forEach(version=>{
      const row=node("div",undefined,"resume-version-manager__row");row.dataset.resumeVersionRow=version.id;
      const label=node("label");const check=input("","checkbox");check.value=version.id;check.dataset.resumeDeleteSelect="";check.setAttribute("aria-label","选择简历："+version.name);
      label.append(check,node("span",(root.jobDirections?root.jobDirections.label(version.direction):version.direction)+"｜"+version.name+" · v"+version.versionNumber+" · "+(version.role==="directionMaster"?"方向母版":version.role==="jobTailored"?"岗位定制":"历史简历")+(version.isDefault?"（默认）":"")+(version.active===false?"（停用）":"")));
      const remove=button("删除此版本",()=>deleteResumeVersions([version.id],false));remove.classList.add("danger-button");
      row.append(label,remove);list.appendChild(row);
    });
    if(!versions.length)list.appendChild(node("p","当前没有简历版本。"));
    section.appendChild(list);
    const sync=()=>{const boxes=Array.from(section.querySelectorAll("[data-resume-delete-select]"));const checked=boxes.filter(item=>item.checked);all.checked=boxes.length>0&&checked.length===boxes.length;all.indeterminate=checked.length>0&&checked.length<boxes.length;removeSelected.disabled=!checked.length;removeSelected.textContent=checked.length?"删除已选（"+checked.length+"）":"删除已选";};
    all.onchange=()=>{section.querySelectorAll("[data-resume-delete-select]").forEach(item=>{item.checked=all.checked;});sync();};
    list.addEventListener("change",sync);sync();
    return section;
  }
  function library(selectedId, notice) {
    const data=store().read();const versions=data.resumeVersions || [];const selected=versions.find(v=>v.id===selectedId);
    show("方向母版与简历版本库");
    if(notice)report(notice,"success");
    body.appendChild(node("p","保存修改会产生新版本，旧版本和已投递快照不会变化。这里保存正文，不代表已保存PDF/Word原文件。"));
    const overview=node("details");overview.appendChild(node("summary","各方向简历状态"));
    (root.jobDirections?root.jobDirections.options():directions.map(value=>({value}))).forEach(d=>{const v=recommended(versions,d.value);overview.appendChild(node("p",d.value+"："+(v?(v.isDefault?"默认：":"推荐：")+v.name+" · v"+v.versionNumber:"尚未建立可用简历")));});body.appendChild(overview);
    body.appendChild(versionManager(versions));
    const picker=field("选择已有版本或新建",choose([{value:"",label:"新建方向母版"}].concat(versions.map(v=>({value:v.id,label:v.direction+"｜"+v.name+" · v"+v.versionNumber+" · "+(v.role==="directionMaster"?"方向母版":v.role==="jobTailored"?"岗位定制":"历史简历")+(v.active===false?"（停用）":v.isDefault?"（默认）":"")}))),selectedId));
    picker.onchange=()=>{try{library(picker.value);}catch(error){picker.value=selectedId||"";readingFailure(error);}};
    let source=selected ? copy(selected.source) : factSource(data.profile);
    const name=field("简历名称",input(selected?selected.name:""));
    const directionOptions=root.jobDirections ? root.jobDirections.options(selected&&selected.direction) : directions.map(x=>({value:x,label:x}));
    const direction=field("方向",choose(directionOptions,selected?(root.jobDirections?root.jobDirections.label(selected.direction):selected.direction):(directionOptions[0]||{}).value));
    const role=field("新版本角色",choose([{value:"directionMaster",label:"方向母版"},{value:"",label:"普通历史简历（兼容）"}],selected?selected.role||"":"directionMaster"));
    if(selected&&selected.role==="jobTailored") {
      body.appendChild(node("p","此版本是岗位定制记录，请到所属岗位继续调整，历史正文保留。"));
      body.appendChild(area(selected.content,true));body.appendChild(button("打开所属岗位",()=>jobPanel(selected.jobId)));return;
    }
    const content=field("简历完整正文（可调整重点，不可虚构事实）",area(selected?selected.content:""));
    if(selected) {const notes=node("details");notes.appendChild(node("summary","本版本的内容取舍与待补充材料"));editorialNotes(notes,selected.source);body.appendChild(notes);}
    const details=node("details");details.appendChild(node("summary","核对当前求职档案事实"));details.appendChild(area(factSource(data.profile).content || "请先保存求职档案。",true));body.appendChild(details);
    body.appendChild(button("从当前求职档案填入",()=>{const current=factSource(store().read().profile);if(!current.content)throw new Error("求职档案没有已保存的事实，请先到我的求职档案保存。");if(content.value && !root.confirm("将用当前档案事实替换编辑框内容；尚未保存的编辑会被替换，历史版本不变。"))return;source=current;content.value=source.content;report("已填入已保存事实，请删减整理成适合投递的正文；未自动保存。","success");}));
    const check=truthful();
    generationControls(()=>direction.value,data=>{source=data.source;name.value=data.name;content.value=data.content;check.checked=false;});
    if(selected) {
      body.append(button("设为该方向默认简历",()=>{saveVersions(metadata(store().read().resumeVersions,selected.id,"default"));root.jobWorkspace.refresh();library(selected.id,"默认简历已保存；已手动选择的岗位不变。");}),
        button(selected.active===false?"恢复此版本":"停用此版本",()=>{saveVersions(metadata(store().read().resumeVersions,selected.id,"toggle"));root.jobWorkspace.refresh();library(selected.id,"版本状态已保存，历史快照不变。");}),
        button("复制/绑定到所选方向为独立简历",()=>{requireTruth(check);const current=store().read();const v=createVersion(current.resumeVersions,null,{name:name.value,direction:direction.value,content:content.value,role:role.value},source,new Date().toISOString());saveVersions(current.resumeVersions.concat(v));root.jobWorkspace.refresh();library(v.id,"独立简历已建立，原版本不变。");}));
    }
    const saveStatus=node("p","","resume-action-feedback");saveStatus.setAttribute("role","status");body.appendChild(saveStatus);
    body.appendChild(button(selected?"保存为新版本":"保存基础版本",()=>{
      requireTruth(check);const current=store().read();const version=createVersion(current.resumeVersions,selected,{name:name.value,direction:direction.value,content:content.value,role:role.value},source,new Date().toISOString());
      saveVersions(current.resumeVersions.concat([version]));root.jobWorkspace.refresh();library(version.id,"保存成功：v"+version.versionNumber+"；刷新页面后仍会保留，旧版本和投递快照未改变。");
    },true,saveStatus));
  }
  function jobPanel(jobId) {
    const job=root.jobWorkspace.getJobs().find(j=>j.id===jobId);if(!job)throw new Error("岗位不存在。");
    const data=store().read();const versions=data.resumeVersions || [];const draft=job.resumeDraft;
    const linkedVersion=draft&&versions.find(v=>v.id===draft.resumeVersionId&&(v.role!=="jobTailored"||v.jobId===jobId));
    const draftVersionMissing=Boolean(draft&&draft.resumeVersionId&&!linkedVersion);
    const savedContent=draft&&(typeof draft.content==="string"&&draft.content.trim()?draft.content:linkedVersion&&linkedVersion.content);
    const savedSource=Object.assign({},copy(linkedVersion&&linkedVersion.source||{}),copy(draft&&draft.source||{}));
    show((job.company || "公司待确认")+"｜"+job.position+" · 投递简历");
    body.appendChild(node("p","岗位方向："+(job.jobDirection||"待确认")+"。优先列出同方向版本，仍由您选择；不会根据JD添加经历。"));
    body.appendChild(node("p",draftVersionMissing?"当前准备使用：原简历版本已从版本库删除；岗位正文和历史投递快照仍保留，请重新选择版本后保存。":"当前准备使用："+(draft?draft.resumeName+" · v"+draft.resumeVersionNumber:"尚未选择")));
    body.appendChild(button("打开方向简历库",()=>{if(confirmDiscard())library();}));
    const recommendedVersion=recommended(versions,job.jobDirection);
    const ordered=versions.filter(v=>(v.role!=="jobTailored"||v.jobId===jobId)&&(v.active!==false || draft&&v.id===draft.resumeVersionId)).sort((a,b)=>Number(b===recommendedVersion)-Number(a===recommendedVersion)||Number(sameDirection(b.direction,job.jobDirection))-Number(sameDirection(a.direction,job.jobDirection))||(b.createdAt||"").localeCompare(a.createdAt||""));
    const savedTailoredVersions=ordered.filter(v=>v.role==="jobTailored"&&v.jobId===jobId);
    if(!versions.some(v=>sameDirection(v.direction,job.jobDirection)))body.appendChild(node("p","此方向简历尚未建立；可先选择其他已有版本，或按需建立。"));
    const picker=field("选择/更换简历",choose([{value:"",label:"请选择（同方向优先）"}].concat(ordered.map(v=>({value:v.id,label:(sameDirection(v.direction,job.jobDirection)?"推荐 · ":"")+(root.jobDirections?root.jobDirections.label(v.direction):v.direction)+"｜"+v.name+" · v"+v.versionNumber}))),draftVersionMissing?"":draft?draft.resumeVersionId:recommendedVersion&&recommendedVersion.id));
    const content=field("当前岗位准备投递的完整正文",area(draft?savedContent:recommendedVersion&&recommendedVersion.content));
    let reviewedSource=savedSource,hasReview=Boolean(savedContent),baselineContent=content.value;
    picker.onchange=()=>{const v=versions.find(x=>x.id===picker.value);if(hasUnsavedJobContent()&&!confirmDiscard()){picker.value=lastPicker;return;}lastPicker=picker.value;content.value=v?v.content:"";baselineContent=content.value;reviewedSource=v&&v.source||{};hasReview=Boolean(v&&v.role==="jobTailored");check.checked=false;tailoredSource=null;reviewControls.refreshReview();};
    const check=truthful();
    let tailoredSource=null;
    let lastPicker=picker.value;
    hasUnsavedJobContent=()=>Boolean(tailoredSource)||content.value!==baselineContent;
    content.addEventListener("input",()=>{hasReview=true;check.checked=false;reviewControls.refreshReview();});
    const reviewControls=generationControls(()=>job.jobDirection,data=>{if(!picker.value)throw Error("请先选择基础简历版本。");content.value=data.content;tailoredSource=data.source;hasReview=true;check.checked=false;},job,()=>{
      const v=versions.find(x=>x.id===picker.value);
      const master=v&&v.role==="directionMaster"?v:versions.find(x=>v&&x.id===v.sourceMasterResumeId&&x.role==="directionMaster");
      if(!master)throw Error("请先选择方向母版；旧简历可在版本库保存为新的母版版本。");
      return {resumeVersionId:picker.value,sourceMasterResumeId:master.id,sourceMasterVersion:master.versionNumber,masterContent:master.content,content:content.value};
    },{read:()=>({content:hasReview?content.value:"",source:tailoredSource||reviewedSource,status:hasUnsavedJobContent()?"本次修改尚未保存。核实后请点击【保存本岗位准备使用的简历】。":hasReview?"正在显示已保存的本岗位正文，可点击【编辑这份正文】修改；基础母版和历史投递记录不会跟着改变。":savedTailoredVersions.length?"找到本岗位已保存的定制版本，但尚未选为当前使用的正文。请点击下方【查看已保存定制】选择，不会自动覆盖当前选择。":"没有找到已保存的本岗位定制正文。上方可能是推荐的基础母版，不代表以前的定制结果；如果以前只导入而未保存，本页无法恢复那次内容。"}),edit:()=>{content.scrollIntoView({block:"center"});content.focus();}});
    if(!savedContent&&savedTailoredVersions.length){const savedList=node("div");savedTailoredVersions.forEach(v=>savedList.appendChild(button("查看已保存定制："+v.name+" · v"+v.versionNumber,()=>{picker.value=v.id;picker.dispatchEvent(new Event("change"));})));reviewControls.panel.insertBefore(savedList,reviewControls.panel.children[2]);}
    body.appendChild(button("保存本岗位准备使用的简历",()=>{
      requireTruth(check);const latest=root.jobWorkspace.getJobs().find(j=>j.id===jobId);if(!latest)throw new Error("岗位不存在。");
      let v=store().read().resumeVersions.find(x=>x.id===picker.value);
      if(v&&(v.role==="directionMaster"||v.role==="jobTailored")&&(tailoredSource||content.value.trim()!==v.content)) {
        const all=store().read().resumeVersions;
        const tailored=createVersion(all,v.role==="jobTailored"?v:null,{role:"jobTailored",name:v.name+" · "+job.position,direction:v.direction,content:content.value,jobId,sourceMasterResumeId:v.role==="directionMaster"?v.id:v.sourceMasterResumeId,sourceMasterVersion:v.role==="directionMaster"?v.versionNumber:v.sourceMasterVersion},tailoredSource||(Object.keys(reviewedSource).length?reviewedSource:v.source),new Date().toISOString());
        saveVersions(all.concat(tailored));v=tailored;
        if(activeSaveAction)activeSaveAction.partial=true;
      }
      const next=createDraft(latest,v,content.value,new Date().toISOString());
      if(tailoredSource){next.source=copy(tailoredSource);next.tailoredForJob=true;}
      else if(draft&&picker.value===draft.resumeVersionId){next.source=copy(savedSource);if(draft.tailoredForJob)next.tailoredForJob=true;}
      saveJob(jobId,{resumeDraft:next});jobPanel(jobId);feedback.textContent="岗位简历已保存；尚未标记投递。";
    }));
    const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
    const date=field("实际投递日期",input(today,"date"));
    body.appendChild(button("确认已投递并保存快照",()=>{
      const latest=root.jobWorkspace.getJobs().find(j=>j.id===jobId);if(!latest)throw new Error("岗位不存在。");
      if(!latest.resumeDraft || picker.value!==latest.resumeDraft.resumeVersionId || content.value.trim()!==latest.resumeDraft.content)throw new Error("请先保存本岗位准备使用的简历，再确认投递。");
      if(!root.confirm("请确认：您确实已使用这份内容投递。此按钮只记录投递，不会自动发送简历；保存后快照不随母版变化。"))return;
      saveJob(jobId,application(latest,latest.resumeDraft,date.value,new Date().toISOString()));jobPanel(jobId);feedback.textContent="投递记录和完整正文快照已保存。";
    },true));
    body.appendChild(node("h3","实际已投递的简历快照"));
    const history=job.applicationResumeSnapshots || [];
    if(!history.length)body.appendChild(node("p",job.applicationDate || !["发现岗位","准备投递"].includes(job.status)?"当时投递简历未记录；不会用今天的版本倒填。":"暂无实际投递快照。"));
    history.slice().reverse().forEach(s=>{const d=node("details");d.appendChild(node("summary",s.appliedAt+"｜"+s.resumeName+" · v"+s.resumeVersionNumber));d.appendChild(node("p","记录时间："+s.recordedAt+"；来源母版："+(s.sourceMasterResumeId? s.sourceMasterResumeId+" · v"+s.sourceMasterVersion:"历史未记录")+"；岗位定制版："+(s.sourceTailoredResumeId||"未记录/未定制")));d.appendChild(area(s.content,true));body.appendChild(d);});
  }
  root.jobResumeUI={library,jobPanel};
  root.jobWorkspace.refresh();
  document.addEventListener("click",event=>{const target=event.target.closest("[data-job-resume-id], #job-resume-library");if(!target)return;try{target.id==="job-resume-library"?library():jobPanel(target.dataset.jobResumeId);}catch(e){root.jobWorkspace.showMessage(e.message,"delete");}});
})(typeof window === "undefined" ? globalThis : window);

(function (root) {
  "use strict";
  var fields = ["jobDirection", "screeningResult", "currentMatchLevel", "screeningStrengths", "screeningGaps", "screeningNote", "rejectionType", "rejectionReasons", "screeningMatchedRequirements", "screeningGapDetails", "screeningUncertainties"];
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  fields.push("riskAssessment");
  fields.push("deliveryAdvice", "suggestedNewDirection");
  function riskLabels(risk) {
    var level = risk && risk.level;
    return { conclusion: ({low:"暂未发现明显风险",uncertain:"有待确认",high:"高风险"})[level] || "风险待评估",
      advice: level === "high" ? "建议谨慎" : level === "low" && !(risk.hardLimits || []).some(function(x){return x.status !== "met";}) ? "可以直接投" : "投前建议先确认" };
  }
  // One read-only projection for cards and comparison. Never copies a diagnosis
  // into accepted decisions or rewrites historical storage during rendering.
  function savedRisk(job, toolkit) {
    if (!job || !job.id) return null;
    var candidates = [];
    function add(value, date, source, priority) {
      var risk = value && value.riskAssessment;
      if (!risk || !["low","uncertain","high"].includes(risk.level)) return;
      if (!["evidence","unknowns","hrQuestions","hardLimits"].every(function(k){return risk[k] === undefined || Array.isArray(risk[k]);})) return;
      candidates.push({riskAssessment:risk, deliveryAdvice:value.deliveryAdvice, assessedAt:date || "", source:source, priority:priority});
    }
    add(job,job.latestProfileRescreenedAt || (job.userDecision || {}).confirmedAt,"岗位已保存结果",1);
    if(job.userDecision) add(job.userDecision.values,job.userDecision.confirmedAt,"人工已确认",2);
    var suggestion=job.aiSuggestion;
    if(suggestion && (!(suggestion.binding || {}).jobId || suggestion.binding.jobId===job.id)) add(suggestion.values,suggestion.createdAt,"已保存AI建议",3);
    var analysis=toolkit && toolkit.analyses && toolkit.analyses[job.id];
    if(analysis && (!analysis.jobId || analysis.jobId===job.id)) {
      var parsed=analysis.parsed;
      if(!parsed && typeof analysis.raw==="string") { try {parsed=JSON.parse(analysis.raw);} catch(_) {} }
      add(parsed,analysis.savedAt,"已保存结构化诊断",4);
    }
    var history=toolkit && toolkit.screeningHistory && toolkit.screeningHistory[job.id];
    if(Array.isArray(history))history.forEach(function(x){if(!x.jobId || x.jobId===job.id)add(x.result,x.createdAt,"已保存初筛记录",2);});
    candidates.sort(function(a,b){return (Date.parse(b.assessedAt)||0)-(Date.parse(a.assessedAt)||0)||b.priority-a.priority;});
    if(!candidates.length)return null;
    var result=clone(candidates[0]);delete result.priority;
    if(!["可以直接投","投前建议先确认","建议谨慎"].includes(result.deliveryAdvice))result.deliveryAdvice=riskLabels(result.riskAssessment).advice;
    return result;
  }
  var riskDataSource=function(){return {};};
  function snapshot(draft) {
    var value = {};
    fields.forEach(function (key) { if (draft[key] !== undefined) value[key] = clone(draft[key]); });
    return value;
  }
  function facts(draft) {
    var value = {};
    ["position", "company", "jd", "salary", "salaryType", "city", "location", "educationRequirement", "experienceRequirement", "languageRequirement", "professionalRequirement", "skillsRequirement", "responsibilities", "requirements", "benefits", "workHours", "restSchedule"].forEach(function (key) { value[key] = draft[key] || ""; });
    return JSON.stringify(value);
  }
  function suggest(draft, values, binding) {
    var next = clone(draft);
    next.screeningHistory = (next.screeningHistory || []).slice();
    if (next.aiSuggestion) next.screeningHistory.push({ kind: "aiSuggestion", value: next.aiSuggestion });
    next.aiSuggestion = { values: snapshot(values), binding: clone(binding), createdAt: new Date().toISOString() };
    delete next.pendingDecision;
    // Flat fields remain the legacy/accepted result until the user explicitly accepts.
    return next;
  }
  function accept(draft, values) {
    var next = clone(draft);
    next.screeningHistory = (next.screeningHistory || []).slice();
    next.screeningHistory.push({ kind: next.userDecision ? "userDecision" : "legacyResult", value: next.userDecision || snapshot(next) });
    Object.assign(next, snapshot(values));
    next.userDecision = { values: snapshot(values), confirmedAt: new Date().toISOString() };
    delete next.pendingDecision;
    return next;
  }
  function preview(draft) {
    return Object.assign({}, draft, draft.pendingDecision || (draft.aiSuggestion ? draft.aiSuggestion.values : {}));
  }
  function screening(parsed, requireRisk) {
    var directions = root.jobDirections ? root.jobDirections.names : ["英语教育", "外贸", "国际业务", "海外销售", "AI相关", "其他"];
    parsed = parsed && clone(parsed);
    if (parsed && parsed.riskAssessment) {
      parsed.screeningResult = parsed.screeningResult || "可以投";
      parsed.currentMatchLevel = parsed.currentMatchLevel || "信息不足，需要进一步确认";
    }
    if (parsed && root.jobDirections && !directions.includes(parsed.jobDirection)) {
      var known = root.jobDirections.resolve(parsed.jobDirection);
      if (known) parsed.jobDirection = known.name;
      else { parsed.suggestedNewDirection = parsed.jobDirection; parsed.jobDirection = "其他"; }
    }
    var results = ["优先投", "可以投", "暂时保留", "当前能力不匹配", "不考虑"];
    var levels = ["已满足", "基本匹配", "有差距但值得尝试", "明显缺少关键条件", "信息不足，需要进一步确认"];
    if (!parsed || !directions.includes(parsed.jobDirection) || !results.includes(parsed.screeningResult) || !levels.includes(parsed.currentMatchLevel)) throw new Error("AI结果的方向、初筛或匹配枚举不正确，未保存");
    function list(v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }) : typeof v === "string" && v.trim() ? [v] : []; }
    var risk = parsed.riskAssessment;
    if (requireRisk && !risk) throw new Error("模型未返回招聘风险分析，旧结果未覆盖；请重试或使用降级模式");
    if (risk) {
      if (!["low", "uncertain", "high"].includes(risk.level) || !Array.isArray(risk.evidence) || !Array.isArray(risk.hrQuestions) || !Array.isArray(risk.hardLimits) || !Array.isArray(risk.unknowns)) throw new Error("风险初筛字段不完整，未保存");
      if (risk.level === "high" && !risk.evidence.length) throw new Error("高风险结论缺少JD证据，未保存");
      if (risk.hrQuestions.concat(risk.unknowns).some(function (x) { return typeof x !== "string"; })) throw new Error("待确认信息和HR问题必须是文字列表，未保存");
      risk.evidence.forEach(function (item) {
        if (!item || typeof item.jdQuote !== "string" || !item.jdQuote.trim() || typeof item.concern !== "string") throw new Error("风险依据必须包含JD原文和分析，未保存");
      });
      risk.hardLimits.forEach(function (item) {
        if (!item || !["met", "breached", "unknown"].includes(item.status) || typeof item.profileQuote !== "string" || !item.profileQuote.trim() || (item.status !== "unknown" && !(typeof item.jdQuote === "string" && item.jdQuote.trim()))) throw new Error("硬底线判断缺少档案/JD证据，未保存");
      });
    }
    // AI suggestions never reject an application solely for a capability gap.
    // Historical accepted decisions are not passed through this normalizer.
    var result = ["当前能力不匹配", "不考虑"].includes(parsed.screeningResult) ? "暂时保留" : parsed.screeningResult;
    if (risk && risk.level === "low" && risk.hardLimits.every(function (x) { return x.status === "met"; }) && ["当前能力不匹配", "不考虑"].includes(parsed.screeningResult)) result = "可以投";
    if (risk && (risk.level !== "low" || risk.hardLimits.some(function (x) { return x.status !== "met"; }))) result = "暂时保留";
    return {
      riskAssessment: risk ? clone(risk) : null,
      deliveryAdvice: risk ? riskLabels(risk).advice : "投前建议先确认",
      suggestedNewDirection: parsed.suggestedNewDirection || "",
      jobDirection: parsed.jobDirection, screeningResult: result, currentMatchLevel: parsed.currentMatchLevel,
      screeningStrengths: list(parsed.mainStrengths || parsed.strengths || parsed.mainStrength).join("；"),
      screeningGaps: list(parsed.mainGaps || parsed.mainGap).join("；"), screeningNote: String(parsed.reason || parsed.note || ""),
      rejectionType: "",
      rejectionReasons: [], screeningMatchedRequirements: list(parsed.metRequirements),
      screeningGapDetails: Array.isArray(parsed.gaps) ? parsed.gaps.filter(function (v) { return v && typeof v === "object"; }) : [],
      screeningUncertainties: list(parsed.uncertainties)
    };
  }
  var token = "";
  var ready = false;
  var endpoint = "http://127.0.0.1:4318";
  function configure(value) { token = String(value || "").trim(); ready = false; }
  async function connect(value) {
    configure(value);
    if (!token) return { connected: false };
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await fetch(endpoint + "/health", { headers: { "X-Workbench-Token": token }, signal: controller.signal });
      var body = await response.json();
      if (!response.ok || !body.configured) throw new Error(body.error || "代理尚未配置模型；请先在本机配置，或使用降级模式");
      ready = true;
      return body;
    } catch (error) {
      ready = false;
      throw new Error(error.name === "TypeError" || error.name === "AbortError" ? "无法连接本机AI服务：请启动代理，并允许浏览器访问本地网络；不要关闭浏览器安全设置。" : error.message);
    } finally { clearTimeout(timer); }
  }
  async function request(task, prompt) {
    if (!ready) throw new Error("模型服务未连接：请先连接本地AI服务，或使用手动降级模式");
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 125000);
    try {
      var response = await fetch(endpoint + "/run", { method: "POST", headers: { "Content-Type": "application/json", "X-Workbench-Token": token }, body: JSON.stringify({ task: task, prompt: prompt }), signal: controller.signal });
      var body = await response.json();
      if (!response.ok) { if (response.status === 401 || response.status === 503) ready = false; throw new Error(body.error || "模型服务请求失败"); }
      return body.result;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("模型服务超时，可单独重试；旧数据未覆盖");
      if (error.name === "TypeError") { ready = false; throw new Error("本机服务无法访问，请检查代理是否运行及浏览器本地网络权限；可使用降级模式。"); }
      throw error;
    } finally { clearTimeout(timer); }
  }
  root.jobAiService = { facts: facts, snapshot: snapshot, suggest: suggest, accept: accept, preview: preview, screening: screening, configure: configure, connect: connect, connected: function () { return ready; }, request: request };
  root.jobAiService.riskLabels = riskLabels;
  root.jobAiService.savedRisk = savedRisk;
  root.jobAiService.setRiskDataSource = function(read){riskDataSource=read;};
  root.jobAiService.riskForJob = function(job){return savedRisk(job,riskDataSource());};
  if (typeof module !== "undefined") module.exports = root.jobAiService;
})(typeof window === "undefined" ? globalThis : window);

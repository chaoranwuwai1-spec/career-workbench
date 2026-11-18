const STORAGE_KEY = "careerWorkbench.jobs.v1";
const JOB_STATUSES = [
  "发现岗位",
  "准备投递",
  "已投递",
  "HR沟通",
  "待面试",
  "已面试",
  "Offer",
  "已入职",
  "主动放弃",
  "被拒绝",
];
const JOB_DIRECTIONS = window.jobDirections ? window.jobDirections.names : ["英语教育", "外贸", "国际业务", "海外销售", "AI相关", "其他"];
const JOB_SCREENING_RESULTS = ["待筛选", "优先投", "可以投", "暂时保留", "当前能力不匹配", "不考虑"];
const JOB_MATCH_LEVELS = ["未评估", "已满足", "基本匹配", "有差距但值得尝试", "明显缺少关键条件", "信息不足，需要进一步确认"];
const JOB_REJECTION_TYPES = ["当前不匹配", "岗位本身不考虑"];
const JOB_REJECTION_REASONS = [
  "英语能力暂时达不到", "专业不符合", "工作经验不够", "学历不符合", "技术能力不足",
  "薪资太低", "工作时间太差", "单休 / 休息太少", "地点不合适", "工作内容不喜欢",
  "与长期职业方向不符", "公司/岗位风险较高", "无底薪 / 收入不稳定", "招聘信息过于模糊", "已经投递过", "重复岗位", "其他",
];
const JOB_FIELDS = [
  "company",
  "position",
  "salary",
  "salaryType",
  "countryRegion",
  "city",
  "location",
  "workHours",
  "restSchedule",
  "employmentType",
  "workMode",
  "jobDirection",
  "educationStage",
  "subject",
  "screeningResult",
  "currentMatchLevel",
  "rejectionType",
  "otherRejectionReason",
  "screeningStrengths",
  "screeningGaps",
  "screeningNote",
  "platform",
  "jobUrl",
  "jd",
  "responsibilities",
  "requirements",
  "educationRequirement",
  "experienceRequirement",
  "languageRequirement",
  "professionalRequirement",
  "skillsRequirement",
  "industry",
  "jobCategory",
  "benefits",
  "otherJdInfo",
  "localWorkRights",
  "visaRequirement",
  "visaSponsorship",
  "overseasApplicants",
  "localResidence",
  "applicationDate",
  "interviewDateTime",
  "status",
  "notes",
];

const dateElement = document.querySelector("#today");
const moduleCards = document.querySelectorAll(".module-card");
const jobsModuleCard = document.querySelector(".module-card--jobs");
const interviewModuleCard = document.querySelector(".module-card--work");
const previewSection = document.querySelector("#module-preview");
const backToTopButton = document.querySelector("#back-to-top");

const jobManager = document.querySelector("#job-manager");
const interviewManager = document.querySelector("#interview-manager");
const addJobButton = document.querySelector("#add-job-button");
const collapseJobManagerButton = document.querySelector("#collapse-job-manager");
const jobCount = document.querySelector("#job-count");
const directionFilter = document.querySelector("#job-direction-filter");
const screeningFilter = document.querySelector("#job-screening-filter");
const statusFilter = document.querySelector("#status-filter");
const rejectionReasonFilter = document.querySelector("#job-rejection-reason-filter");
const filterResult = document.querySelector("#filter-result");
const jobList = document.querySelector("#job-list");
const jobsMessage = document.querySelector("#jobs-message");
const storageWarning = document.querySelector("#storage-warning");
const selectVisibleJobsInput = document.querySelector("#job-select-visible");
const deleteSelectedJobsButton = document.querySelector("#delete-selected-jobs");
const selectedJobsCount = document.querySelector("#job-selected-count");

const jobDialog = document.querySelector("#job-dialog");
const jobForm = document.querySelector("#job-form");
const jobFormTitle = document.querySelector("#job-form-title");
const closeJobDialogButton = document.querySelector("#close-job-dialog");
const cancelJobFormButton = document.querySelector("#cancel-job-form");

let jobsReadFailed = false;
const JOBS_READ_FAILURE = "岗位资料读取异常，已暂停岗位保存和删除。原数据未被清空或修复；请先排查读取问题，再刷新页面重新读取确认。当前页面不会自动解除保护。";
let jobs = loadJobs();
let editingJobId = null;
let messageTimer = null;
const selectedJobIds = new Set();

// 在页面右上角显示今天的日期。
const today = new Date();
dateElement.dateTime = today.toISOString().slice(0, 10);
dateElement.textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
}).format(today);

// 独立求职产品只在岗位中心和经历库之间切换。
moduleCards.forEach((card) => {
  card.addEventListener("click", (event) => {
    event.preventDefault();
    moduleCards.forEach((item) => item.classList.remove("is-active"));
    card.classList.add("is-active");
    if (card === jobsModuleCard) {
      openJobManager();
    } else if (card === interviewModuleCard) {
      jobManager.hidden = true;
      previewSection.hidden = true;
      if (typeof window.openInterviewManager === "function") window.openInterviewManager();
    }
  });
});

function openJobManager(shouldScroll = true) {
  previewSection.hidden = true;
  interviewManager.hidden = true;
  jobManager.hidden = false;
  renderJobs();
  updatePageHash("#job-manager");

  if (shouldScroll) {
    jobManager.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

collapseJobManagerButton.addEventListener("click", () => {
  jobManager.hidden = true;
  previewSection.hidden = false;
  jobsModuleCard.classList.remove("is-active");
  updatePageHash("#workspace-title");
  document.querySelector("#workspace-title").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
});

// 新增和编辑共用同一个表单。
addJobButton.addEventListener("click", () => openJobDialog());
closeJobDialogButton.addEventListener("click", closeJobDialog);
cancelJobFormButton.addEventListener("click", closeJobDialog);

jobDialog.addEventListener("click", (event) => {
  if (event.target === jobDialog) {
    closeJobDialog();
  }
});

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSaveJobs()) return;

  const formData = new FormData(jobForm);
  const values = {};
  JOB_FIELDS.forEach((field) => {
    values[field] = String(formData.get(field) || "").trim();
  });
  values.rejectionReasons = uniqueStrings(formData.getAll("rejectionReasons"));
  values.companyStatus = getJobCompanyStatus(values.company);

  if (JOB_SCREENING_RESULTS.indexOf(values.screeningResult) === -1) {
    values.screeningResult = "待筛选";
  }
  if (!values.jobDirection) {
    showMessage("请先选择或填写求职方向。", "delete");
    return;
  }
  if (isNegativeScreeningResult(values.screeningResult)) {
    values.rejectionType = values.screeningResult === "当前能力不匹配" ? "当前不匹配" : "岗位本身不考虑";
    if (!values.rejectionReasons.length && !values.otherRejectionReason) {
      showMessage("暂时不投时，请至少选择一个原因或填写补充原因。", "delete");
      return;
    }
    if (values.otherRejectionReason && values.rejectionReasons.indexOf("其他") === -1) {
      values.rejectionReasons.push("其他");
    }
  } else {
    values.rejectionType = "";
    values.rejectionReasons = [];
    values.otherRejectionReason = "";
  }

  if (JOB_STATUSES.indexOf(values.status) === -1) {
    values.status = "发现岗位";
  }

  const now = new Date().toISOString();
  let nextJobs;
  let successMessage;
  const oldJob = jobs.find(job=>job.id===editingJobId);
  const confirmApplication = values.status === "已投递" && (!oldJob || oldJob.status !== "已投递");
  if (confirmApplication) {
    if (!window.jobResumeUI) { showMessage("简历组件尚未加载，不能记录投递，请重新打开页面。", "delete"); return; }
    values.status = oldJob ? oldJob.status : "准备投递";
    values.applicationDate = oldJob ? oldJob.applicationDate || "" : "";
  }

  if (window.jobAiService && values.screeningResult !== "待筛选") {
    const previous = jobs.find((job) => job.id === editingJobId) || {};
    const nextValues = window.jobAiService.snapshot(values);
    if (JSON.stringify(nextValues) !== JSON.stringify(window.jobAiService.snapshot(previous))) {
      const accepted = window.jobAiService.accept(previous, values);
      values.userDecision = accepted.userDecision;
      values.screeningHistory = accepted.screeningHistory;
    }
  }

  if (editingJobId) {
    nextJobs = jobs.map((job) =>
      job.id === editingJobId
        ? mergeObjects(job, values, { updatedAt: now })
        : job,
    );
    successMessage = "岗位记录已更新。";
  } else {
    const newJob = mergeObjects(
      { id: createJobId() },
      values,
      { createdAt: now, updatedAt: now },
    );
    nextJobs = [newJob].concat(jobs);
    successMessage = "新岗位已保存到这台电脑。";
  }

  if (!saveJobs(nextJobs)) {
    return;
  }

  jobs = nextJobs;
  const savedJobId = editingJobId || nextJobs[0].id;
  closeJobDialog();
  renderJobs();
  notifyJobsChanged();
  showMessage(successMessage);
  if (confirmApplication) {
    window.jobResumeUI.jobPanel(savedJobId);
    showMessage("岗位资料已保存；请确认实际使用的简历并保存投递快照，才会标记已投递。", "success");
  }
});

function openJobDialog(job = null) {
  jobForm.reset();
  editingJobId = job ? job.id : null;
  jobFormTitle.textContent = job ? "编辑岗位" : "新增岗位";

  JOB_FIELDS.forEach((fieldName) => {
    const field = jobForm.elements.namedItem(fieldName);
    if (field) {
      field.value = job ? job[fieldName] || "" : "";
    }
  });

  const savedRejectionReasons = job && Array.isArray(job.rejectionReasons)
    ? job.rejectionReasons
    : [];
  jobForm.querySelectorAll('input[name="rejectionReasons"]').forEach((checkbox) => {
    checkbox.checked = savedRejectionReasons.indexOf(checkbox.value) !== -1;
  });

  if (!job) {
    jobForm.elements.namedItem("status").value = "发现岗位";
    jobForm.elements.namedItem("screeningResult").value = "待筛选";
    [
      "localWorkRights",
      "visaRequirement",
      "visaSponsorship",
      "overseasApplicants",
      "localResidence",
    ].forEach((fieldName) => {
      const field = jobForm.elements.namedItem(fieldName);
      if (field) {
        field.value = "未说明";
      }
    });
  }
  updateRejectionDetails(jobForm, document.querySelector("#job-rejection-details"));

  if (typeof jobDialog.showModal === "function") {
    jobDialog.showModal();
  } else {
    document.body.classList.add("dialog-fallback-open");
    jobDialog.classList.add("job-dialog--fallback");
    jobDialog.setAttribute("open", "");
  }

  window.requestAnimationFrame(() => {
    jobForm.elements.namedItem("company").focus();
  });
}

function closeJobDialog() {
  editingJobId = null;

  if (typeof jobDialog.close === "function" && jobDialog.open) {
    jobDialog.close();
  } else {
    jobDialog.removeAttribute("open");
    jobDialog.classList.remove("job-dialog--fallback");
    document.body.classList.remove("dialog-fallback-open");
  }
}

// 岗位方向、初筛、投递进度和不投原因彼此独立筛选。
[directionFilter, screeningFilter, statusFilter, rejectionReasonFilter].forEach((filter) => {
  filter.addEventListener("change", renderJobs);
});
jobForm.elements.namedItem("screeningResult").addEventListener("change", () => {
  updateRejectionDetails(jobForm, document.querySelector("#job-rejection-details"));
});

jobList.addEventListener("change", (event) => {
  const statusSelect = event.target;
  if (statusSelect && statusSelect.dataset.jobSelectId) {
    if (statusSelect.checked) selectedJobIds.add(statusSelect.dataset.jobSelectId);
    else selectedJobIds.delete(statusSelect.dataset.jobSelectId);
    updateJobBulkControls();
    return;
  }
  if (!statusSelect || !statusSelect.dataset.jobStatusId) {
    return;
  }
  const nextStatus = statusSelect.value;
  if (JOB_STATUSES.indexOf(nextStatus) === -1) {
    return;
  }
  const currentJob = jobs.find(job=>job.id===statusSelect.dataset.jobStatusId);
  if (nextStatus === "已投递" && currentJob && currentJob.status !== "已投递") {
    statusSelect.value = currentJob.status;
    if (!window.jobResumeUI) { showMessage("简历组件尚未加载，请重新打开页面。", "delete"); return; }
    window.jobResumeUI.jobPanel(currentJob.id);
    showMessage("请确认实际使用的简历并保存投递快照；关闭窗口不会记录投递。", "success");
    return;
  }
  const nextJobs = jobs.map((job) =>
    job.id === statusSelect.dataset.jobStatusId
      ? mergeObjects(job, { status: nextStatus, updatedAt: new Date().toISOString() })
      : job,
  );
  if (!saveJobs(nextJobs)) {
    renderJobs();
    return;
  }
  jobs = nextJobs;
  renderJobs();
  notifyJobsChanged();
  showMessage("岗位状态已更新。", "success");
});

// 使用事件代理处理每张岗位卡片上的编辑和删除按钮。
jobList.addEventListener("click", (event) => {
  const actionButton = findActionButton(event.target);
  if (!actionButton) {
    return;
  }

  const job = jobs.find((item) => item.id === actionButton.dataset.id);
  if (!job) {
    return;
  }

  if (actionButton.dataset.action === "edit") {
    openJobDialog(job);
    return;
  }

  if (actionButton.dataset.action === "delete") {
    requestDeleteJobs([job.id]);
  }
});

if (selectVisibleJobsInput) {
  selectVisibleJobsInput.addEventListener("change", () => {
    getVisibleJobs().forEach((job) => {
      if (jobDeletionProtectionReason(job)) return;
      if (selectVisibleJobsInput.checked) selectedJobIds.add(job.id);
      else selectedJobIds.delete(job.id);
    });
    renderJobs();
  });
}

if (deleteSelectedJobsButton) {
  deleteSelectedJobsButton.addEventListener("click", () => requestDeleteJobs(Array.from(selectedJobIds)));
}

function getVisibleJobs() {
  const selectedDirection = directionFilter.value;
  const selectedScreening = screeningFilter.value;
  const selectedStatus = statusFilter.value;
  const selectedReason = rejectionReasonFilter.value;
  return jobs.filter((job) => {
    if (selectedDirection !== "全部" && !(window.jobDirections ? window.jobDirections.same(job.jobDirection, selectedDirection) : job.jobDirection === selectedDirection)) return false;
    if (selectedScreening !== "全部" && job.screeningResult !== selectedScreening) return false;
    if (selectedStatus !== "全部" && job.status !== selectedStatus) return false;
    if (selectedReason !== "全部" && !(Array.isArray(job.rejectionReasons) ? job.rejectionReasons : []).includes(selectedReason)) return false;
    return true;
  });
}

function jobDeletionProtectionReason(job) {
  if (window.jobBulkDeleteManager && typeof window.jobBulkDeleteManager.protectionReason === "function") {
    return window.jobBulkDeleteManager.protectionReason(job);
  }
  if (Array.isArray(job.applicationResumeSnapshots) && job.applicationResumeSnapshots.length) return "已有正式投递简历存档";
  if (job.applicationDate || ["已投递", "HR沟通", "待面试", "已面试", "Offer", "已入职"].includes(job.status)) return "已有正式投递记录";
  return "";
}

function updateJobBulkControls() {
  Array.from(selectedJobIds).forEach((id) => { if (!jobs.some((job) => job.id === id)) selectedJobIds.delete(id); });
  const visibleDeletable = getVisibleJobs().filter((job) => !jobDeletionProtectionReason(job));
  const selectedVisible = visibleDeletable.filter((job) => selectedJobIds.has(job.id)).length;
  if (selectedJobsCount) selectedJobsCount.textContent = `已选 ${selectedJobIds.size} 条`;
  if (deleteSelectedJobsButton) deleteSelectedJobsButton.disabled = selectedJobIds.size === 0;
  if (selectVisibleJobsInput) {
    selectVisibleJobsInput.disabled = visibleDeletable.length === 0;
    selectVisibleJobsInput.checked = visibleDeletable.length > 0 && selectedVisible === visibleDeletable.length;
    selectVisibleJobsInput.indeterminate = selectedVisible > 0 && selectedVisible < visibleDeletable.length;
  }
}

async function requestDeleteJobs(ids) {
  if (!canSaveJobs()) return;
  const targets = jobs.filter((job) => ids.includes(job.id));
  const protectedTargets = targets.filter((job) => jobDeletionProtectionReason(job));
  if (protectedTargets.length) {
    showMessage(`有 ${protectedTargets.length} 个岗位包含正式投递或面试历史，未执行删除。`, "delete");
    return;
  }
  if (!targets.length) return;
  if (!window.confirm(`确定删除已选的 ${targets.length} 个岗位吗？\n只删除这些岗位及其可安全清理的关联资料；不会删除求职档案、方向母版或正式投递存档。`)) return;
  try {
    if (window.jobBulkDeleteManager && typeof window.jobBulkDeleteManager.deleteJobs === "function") {
      await window.jobBulkDeleteManager.deleteJobs(targets.map((job) => job.id));
    } else if (!replaceAllJobs(jobs.filter((job) => !targets.some((target) => target.id === job.id)))) {
      throw new Error("岗位数据保存失败");
    }
    targets.forEach((job) => selectedJobIds.delete(job.id));
    showMessage(`已删除 ${targets.length} 个岗位。`, "delete");
  } catch (error) {
    showMessage(`岗位删除失败：${error && error.message ? error.message : "未知错误"}`, "delete");
  }
}

function renderJobs() {
  syncDirectionFilterOptions();
  const selectedDirection = directionFilter.value;
  const selectedScreening = screeningFilter.value;
  const selectedStatus = statusFilter.value;
  const selectedReason = rejectionReasonFilter.value;
  const visibleJobs = getVisibleJobs();

  jobCount.textContent = String(jobs.length);
  const hasFilter = [selectedDirection, selectedScreening, selectedStatus, selectedReason]
    .some((value) => value !== "全部");
  filterResult.textContent = hasFilter ? `当前显示 ${visibleJobs.length} 条` : "";
  clearElement(jobList);

  if (visibleJobs.length === 0) {
    renderEmptyState(hasFilter ? "当前筛选条件" : selectedStatus);
    updateJobBulkControls();
    return;
  }

  visibleJobs.forEach((job) => {
    jobList.appendChild(createJobCard(job));
  });
  updateJobBulkControls();
}

function renderEmptyState(selectedStatus) {
  const empty = createElement("div", "job-empty");
  const content = createElement("div");
  content.appendChild(createElement("div", "job-empty-mark", "职"));

  if (jobs.length === 0) {
    content.appendChild(createElement("h3", "", "还没有岗位记录"));
    content.appendChild(
      createElement("p", "", "点击右上方“新增岗位”，记录第一个目标岗位。"),
    );
  } else {
    content.appendChild(createElement("h3", "", "这个状态下暂时没有岗位"));
    content.appendChild(
      createElement(
        "p",
        "",
        `没有找到状态为“${selectedStatus}”的记录，可以切换筛选条件。`,
      ),
    );
  }

  empty.appendChild(content);
  jobList.appendChild(empty);
}

function createJobCard(job) {
  const card = createElement("article", "job-record");
  card.dataset.jobId = job.id;
  const heading = createElement("div", "job-record-heading");
  const identity = createElement("div");
  const selectLabel = createElement("label", "job-record-select");
  const selectInput = document.createElement("input");
  const protectionReason = jobDeletionProtectionReason(job);
  selectInput.type = "checkbox";
  selectInput.dataset.jobSelectId = job.id;
  selectInput.checked = selectedJobIds.has(job.id);
  selectInput.disabled = Boolean(protectionReason);
  selectLabel.title = protectionReason || "选择这个岗位";
  selectLabel.appendChild(selectInput);
  selectLabel.appendChild(document.createTextNode(protectionReason ? " 已保护" : " 选择"));
  identity.appendChild(selectLabel);
  const companyLabel = getJobCompanyDisplay(job);
  identity.appendChild(createElement("p", "job-company", companyLabel));
  identity.appendChild(createElement("h3", "job-position", job.position));

  const status = document.createElement("select");
  status.className = "job-status job-status-select";
  status.dataset.status = job.status;
  status.dataset.jobStatusId = job.id;
  status.setAttribute("aria-label", `修改 ${companyLabel} ${job.position} 的状态`);
  JOB_STATUSES.forEach((statusName) => {
    const option = document.createElement("option");
    option.value = statusName;
    option.textContent = statusName;
    option.selected = statusName === job.status;
    status.appendChild(option);
  });
  heading.appendChild(identity);
  heading.appendChild(status);
  card.appendChild(heading);

  const classification = createElement("div", "job-classification-tags");
  const diagnosis = window.jobAiService ? window.jobAiService.riskForJob(job) : null;
  const directionBadge = createElement(
    "span",
    "job-direction-badge",
    window.jobDirections ? window.jobDirections.label(job.jobDirection) : job.jobDirection || "其他",
  );
  const screeningBadge = createElement(
    "span",
    "job-screening-badge",
    diagnosis ? window.jobAiService.riskLabels(diagnosis.riskAssessment).conclusion : "风险待评估",
  );
  screeningBadge.dataset.risk = diagnosis ? diagnosis.riskAssessment.level : "unknown";
  if(diagnosis)screeningBadge.title = diagnosis.source + (diagnosis.assessedAt ? " · " + diagnosis.assessedAt : "");
  classification.appendChild(directionBadge);
  classification.appendChild(screeningBadge);
  if (diagnosis) classification.appendChild(createElement("span", "job-screening-badge", diagnosis.deliveryAdvice));
  if (job.internalJobId) {
    classification.appendChild(createElement("span", "job-match-level-badge", job.internalJobId));
  }
  if (job.companyStatus && job.companyStatus !== "known") {
    classification.appendChild(
      createElement(
        "span",
        "job-match-level-badge",
        job.companyStatus === "uncertain" ? "公司识别不确定" : "公司未显示",
      ),
    );
  }
  card.appendChild(classification);

  card.appendChild(
    createElement(
      "p",
      "job-record-glance",
      [
        job.salary ? `${job.salary}${job.salaryType ? ` · ${job.salaryType}` : ""}` : "薪资未填写",
        job.city || job.location || job.countryRegion || "地点未填写",
        job.employmentType || "工作类型未填写",
      ].join(" · "),
    ),
  );
  if (job.screeningStrengths || job.screeningGaps) {
    const capability = createElement("details", "");
    capability.appendChild(createElement("summary", "", "能力差距（仅供简历和面试准备，不自动阻止投递）"));
    capability.appendChild(
      createElement(
        "p",
        "job-screening-glance",
        `最大优势：${job.screeningStrengths || "待分析"} · 最大缺口：${job.screeningGaps || "待分析"}`,
      ),
    );
    card.appendChild(capability);
  }

  const detailPanel = createElement(
    "details",
    "job-record-details workspace-collapsible workspace-collapsible--compact",
  );
  detailPanel.dataset.collapsibleGroup = "job-library-records";
  const detailSummary = createElement("summary", "workspace-collapsible__summary");
  const detailSummaryCopy = createElement("span", "workspace-collapsible__summary-copy");
  detailSummaryCopy.appendChild(createElement("strong", "workspace-collapsible__title", "岗位完整信息"));
  detailSummaryCopy.appendChild(
    createElement("span", "workspace-collapsible__subtitle", "JD、职责、要求、工作条件及国外岗位信息"),
  );
  detailSummary.appendChild(detailSummaryCopy);
  detailPanel.appendChild(detailSummary);
  const detailBody = createElement("div", "workspace-collapsible__body");

  const facts = createElement("dl", "job-facts");
  addJobFact(facts, "公司信息状态", job.companyStatus === "known" ? "已确认" : (job.companyStatus === "uncertain" ? "识别不确定，待补充" : "截图未提供，待补充"));
  addJobFact(facts, "求职方向", job.jobDirection || "其他");
  addJobFact(facts, "初筛结果", job.screeningResult || "待筛选");
  addJobFact(facts, "当前匹配程度", job.currentMatchLevel || "未评估");
  if (isNegativeScreeningResult(job.screeningResult)) {
    addJobFact(facts, "不投类型", job.rejectionType || "待确认");
    addJobFact(
      facts,
      "不投原因",
      formatRejectionReasons(job) || "待确认",
    );
  }
  addJobFact(
    facts,
    "薪资",
    job.salary ? `${job.salary}${job.salaryType ? ` · ${job.salaryType}` : ""}` : "未填写",
  );
  addJobFact(facts, "国家 / 地区", job.countryRegion || "未填写");
  addJobFact(facts, "城市 / 地点", job.city || job.location || "未填写");
  addJobFact(facts, "工作类型", job.employmentType || "未填写");
  addJobFact(facts, "办公方式", job.workMode || "未填写");
  addJobFact(facts, "工作时间", job.workHours || "未说明");
  addJobFact(facts, "休息安排", job.restSchedule || "未说明");
  addJobFact(facts, "招聘平台", job.platform || "未填写");
  addJobFact(facts, "行业", job.industry || "未说明");
  addJobFact(facts, "岗位类别", job.jobCategory || "未说明");
  addJobFact(facts, "专业要求", job.professionalRequirement || "未说明");
  addJobFact(facts, "投递日期", formatDate(job.applicationDate));
  addJobFact(facts, "面试日期 / 时间", formatDateTime(job.interviewDateTime));
  addJobFact(facts, "当前状态", job.status);
  detailBody.appendChild(facts);

  detailBody.appendChild(createTextBlock("JD / 招聘要求", job.jd));
  detailBody.appendChild(createTextBlock("工作职责", job.responsibilities));
  detailBody.appendChild(createTextBlock("任职要求", job.requirements));
  detailBody.appendChild(createTextBlock("其他重要 JD 信息", job.otherJdInfo));
  detailBody.appendChild(
    createTextBlock(
      "学历 / 经验 / 语言 / 福利",
      [
        `学历要求：${job.educationRequirement || "未说明"}`,
        `经验要求：${job.experienceRequirement || "未说明"}`,
        `语言要求：${job.languageRequirement || "未说明"}`,
        `技能要求：${job.skillsRequirement || "未说明"}`,
        `福利待遇：${job.benefits || "未说明"}`,
      ].join("\n"),
    ),
  );
  detailBody.appendChild(
    createTextBlock(
      "国外岗位信息",
      [
        `当地工作权：${job.localWorkRights || "未说明"}`,
        `签证要求：${job.visaRequirement || "未说明"}`,
        `Visa Sponsorship：${job.visaSponsorship || "未说明"}`,
        `接受海外申请者：${job.overseasApplicants || "未说明"}`,
        `要求当地居住：${job.localResidence || "未说明"}`,
      ].join("\n"),
    ),
  );
  detailBody.appendChild(createTextBlock("备注", job.notes));
  if (job.screeningStrengths || job.screeningGaps || job.screeningNote) {
    detailBody.appendChild(
      createTextBlock(
        "初筛记录",
        [
          `主要优势：${job.screeningStrengths || "未填写"}`,
          `主要缺口：${job.screeningGaps || "未填写"}`,
          `补充说明：${job.screeningNote || "未填写"}`,
        ].join("\n"),
      ),
    );
  }
  detailPanel.appendChild(detailBody);
  card.appendChild(detailPanel);

  const actions = createElement("div", "job-record-actions");
  const editButton = createElement("button", "record-action", "编辑");
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.dataset.id = job.id;
  editButton.setAttribute("aria-label", `编辑 ${companyLabel} ${job.position}`);

  const deleteButton = createElement(
    "button",
    "record-action record-action--delete",
    "删除",
  );
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = job.id;
  deleteButton.setAttribute("aria-label", `删除 ${companyLabel} ${job.position}`);

  const analysisButton = createElement("button", "record-action job-ai-action", "AI 诊断");
  analysisButton.type = "button";
  analysisButton.dataset.jobAdvancedAction = "analysis";
  analysisButton.dataset.id = job.id;

  const interviewButton = createElement("button", "record-action", "面试准备");
  interviewButton.type = "button";
  interviewButton.dataset.jobAdvancedAction = "interview";
  interviewButton.dataset.id = job.id;

  const rescreenButton = createElement("button", "record-action", "用最新档案重新初筛");
  rescreenButton.type = "button";
  rescreenButton.dataset.jobAdvancedAction = "rescreen";
  rescreenButton.dataset.id = job.id;

  if (job.jobUrl) {
    const linkButton = createElement("a", "record-action job-link-action", "招聘页面");
    linkButton.href = job.jobUrl;
    linkButton.target = "_blank";
    linkButton.rel = "noopener noreferrer";
    actions.appendChild(linkButton);
  }

  actions.appendChild(analysisButton);
  actions.appendChild(interviewButton);
  actions.appendChild(rescreenButton);
  const resumeButton = createElement("button", "record-action", "选择/查看投递简历");
  resumeButton.type = "button";
  resumeButton.dataset.jobResumeId = job.id;
  actions.appendChild(resumeButton);
  let recommendedResume = null;
  let resumeReadFailed = false;
  if (!job.resumeDraft && window.jobResumeCore && window.jobResumeStore) {
    try {
      recommendedResume = window.jobResumeCore.recommended(window.jobResumeStore.read().resumeVersions, job.jobDirection);
    } catch (error) {
      resumeReadFailed = true;
    }
  }
  const resumeInfo = createElement("p", "", "准备使用简历：" + (job.resumeDraft ? job.resumeDraft.resumeName + " · v" + job.resumeDraft.resumeVersionNumber : resumeReadFailed ? "求职资料读取异常，暂不能推荐简历" : recommendedResume ? recommendedResume.name + " · v" + recommendedResume.versionNumber + "（推荐，待确认）" : "未选择 / 本方向尚未建立") + "｜实际投递快照：" + (Array.isArray(job.applicationResumeSnapshots) ? job.applicationResumeSnapshots.length : 0) + " 份");
  card.appendChild(resumeInfo);
  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  card.appendChild(actions);
  return card;
}

function addJobFact(list, label, value) {
  const wrapper = createElement("div", "job-fact");
  wrapper.appendChild(createElement("dt", "", label));
  wrapper.appendChild(createElement("dd", "", value));
  list.appendChild(wrapper);
}

function createTextBlock(title, text) {
  const block = createElement(
    "details",
    "job-text-block workspace-collapsible workspace-collapsible--compact",
  );
  block.dataset.collapsibleGroup = "job-text-blocks";
  block.appendChild(createElement("summary", "", title));
  block.appendChild(createElement("p", "", text || "未填写"));
  return block;
}

function formatDate(value) {
  if (!value) {
    return "未填写";
  }

  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function formatDateTime(value) {
  if (!value) {
    return "未填写";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function markJobsReadFailure() {
  jobsReadFailed = true;
  storageWarning.textContent = JOBS_READ_FAILURE;
  storageWarning.setAttribute("role", "alert");
  storageWarning.hidden = false;
}

function readStoredJobs() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === null) return [];
  const parsed = JSON.parse(saved);
  if (!Array.isArray(parsed) || parsed.some(job => !job || typeof job !== "object" || Array.isArray(job) || typeof job.id !== "string" || !job.id.trim())) {
    throw new Error("岗位数据格式不正确");
  }
  return parsed;
}

function canSaveJobs() {
  if (!jobsReadFailed) {
    try { readStoredJobs(); }
    catch (_) { markJobsReadFailure(); }
  }
  if (jobsReadFailed) {
    markJobsReadFailure();
    return false;
  }
  return true;
}

function loadJobs() {
  try {
    return readStoredJobs().map(normalizeJob);
  } catch (error) {
    markJobsReadFailure();
    // Rendering may use an empty list, but the sticky lock prevents it being saved.
    return [];
  }
}

function getJobCompanyStatus(value, existingStatus = "") {
  const text = String(value || "").trim();
  if (text && !/^(?:未知|未提供|未说明|未识别|公司待确认|待确认|请确认|识别不确定|不确定)$/.test(text)) {
    return "known";
  }
  if (/^(?:公司待确认|待确认|请确认|识别不确定|不确定)$/.test(text)) {
    return "uncertain";
  }
  return existingStatus === "uncertain" ? "uncertain" : "not-provided";
}

function getJobCompanyDisplay(job) {
  return getJobCompanyStatus(job && job.company, job && job.companyStatus) === "known"
    ? String(job.company).trim()
    : "公司待确认";
}

function normalizeJob(job) {
  const legacyStatusMap = { 不合适: "主动放弃" };
  const mappedStatus = legacyStatusMap[job.status] || job.status;
  const normalized = mergeObjects(
    {
      company: "",
      companyStatus: "not-provided",
      position: "",
      salary: "",
      salaryType: "",
      countryRegion: "",
      city: "",
      location: "",
      workHours: "",
      restSchedule: "",
      employmentType: "",
      workMode: "",
      jobDirection: "",
      educationStage: "",
      subject: "",
      screeningResult: "待筛选",
      currentMatchLevel: "未评估",
      screeningMatchedRequirements: [],
      screeningGapDetails: [],
      screeningUncertainties: [],
      rejectionType: "",
      rejectionReasons: [],
      otherRejectionReason: "",
      screeningStrengths: "",
      screeningGaps: "",
      screeningNote: "",
      platform: "",
      jobUrl: "",
      jd: "",
      responsibilities: "",
      requirements: "",
      educationRequirement: "",
      experienceRequirement: "",
      languageRequirement: "",
      professionalRequirement: "",
      skillsRequirement: "",
      industry: "",
      jobCategory: "",
      benefits: "",
      otherJdInfo: "",
      localWorkRights: "未说明",
      visaRequirement: "未说明",
      visaSponsorship: "未说明",
      overseasApplicants: "未说明",
      localResidence: "未说明",
      applicationDate: "",
      interviewDateTime: "",
      notes: "",
    },
    job,
    {
      status: JOB_STATUSES.indexOf(mappedStatus) !== -1 ? mappedStatus : "准备投递",
    },
  );
  normalized.jobDirection = normalizeJobDirection(normalized.jobDirection)
    || inferJobDirection(normalized);
  normalized.companyStatus = getJobCompanyStatus(normalized.company, normalized.companyStatus);
  if (normalized.screeningResult === "值得投") normalized.screeningResult = "优先投";
  else if (normalized.screeningResult === "可以考虑") normalized.screeningResult = "可以投";
  else if (normalized.screeningResult === "不投") {
    normalized.screeningResult = normalized.rejectionType === "当前不匹配" ? "当前能力不匹配" : "不考虑";
  }
  normalized.screeningResult = JOB_SCREENING_RESULTS.indexOf(normalized.screeningResult) !== -1 ? normalized.screeningResult : "待筛选";
  normalized.currentMatchLevel = JOB_MATCH_LEVELS.indexOf(normalized.currentMatchLevel) !== -1 ? normalized.currentMatchLevel : "未评估";
  normalized.screeningMatchedRequirements = Array.isArray(normalized.screeningMatchedRequirements) ? normalized.screeningMatchedRequirements : [];
  normalized.screeningGapDetails = Array.isArray(normalized.screeningGapDetails) ? normalized.screeningGapDetails : [];
  normalized.screeningUncertainties = Array.isArray(normalized.screeningUncertainties) ? normalized.screeningUncertainties : [];
  normalized.rejectionReasons = uniqueStrings(
    Array.isArray(normalized.rejectionReasons) ? normalized.rejectionReasons : [],
  );
  if (!isNegativeScreeningResult(normalized.screeningResult)) {
    normalized.rejectionType = "";
    normalized.rejectionReasons = [];
    normalized.otherRejectionReason = "";
  } else {
    normalized.rejectionType = normalized.screeningResult === "当前能力不匹配" ? "当前不匹配" : "岗位本身不考虑";
  }
  return normalized;
}

function saveJobs(nextJobs) {
  if (!canSaveJobs()) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextJobs));
    storageWarning.hidden = true;
    return true;
  } catch (error) {
    storageWarning.hidden = false;
    showMessage("保存失败，请检查浏览器是否允许本地存储。", "delete");
    return false;
  }
}

function replaceAllJobs(nextJobs) {
  if (!Array.isArray(nextJobs)) {
    return false;
  }
  const normalized = nextJobs
    .filter((job) => job && typeof job === "object")
    .map((job) => normalizeJob(mergeObjects(job, { id: job.id || createJobId() })));
  if (!saveJobs(normalized)) {
    return false;
  }
  jobs = normalized;
  renderJobs();
  notifyJobsChanged();
  return true;
}

function addImportedJob(values) {
  const now = new Date().toISOString();
  const job = normalizeJob(
    mergeObjects(
      { id: createJobId(), createdAt: now, updatedAt: now, status: "发现岗位" },
      values,
    ),
  );
  return replaceAllJobs([job].concat(jobs)) ? job : null;
}

function updateJobById(id, values) {
  const now = new Date().toISOString();
  const nextJobs = jobs.map((job) =>
    job.id === id ? normalizeJob(mergeObjects(job, values, { updatedAt: now })) : job,
  );
  return replaceAllJobs(nextJobs);
}

function notifyJobsChanged() {
  let event;
  if (typeof window.CustomEvent === "function") {
    event = new CustomEvent("job-workspace:changed");
  } else {
    event = document.createEvent("Event");
    event.initEvent("job-workspace:changed", true, true);
  }
  window.dispatchEvent(event);
}

window.jobWorkspace = {
  refresh: renderJobs,
  statuses: JOB_STATUSES.slice(),
  directions: JOB_DIRECTIONS.slice(),
  screeningResults: JOB_SCREENING_RESULTS.slice(),
  rejectionTypes: JOB_REJECTION_TYPES.slice(),
  rejectionReasons: JOB_REJECTION_REASONS.slice(),
  getJobs: () => jobs.map((job) => mergeObjects(job)),
  replaceJobs: replaceAllJobs,
  addJob: addImportedJob,
  updateJob: updateJobById,
  openEditor: (id) => {
    const job = jobs.find((item) => item.id === id);
    if (job) {
      openJobDialog(job);
    }
  },
  showMessage,
};

function updateRejectionDetails(form, details) {
  if (!form || !details) return;
  const screeningField = form.elements.namedItem("screeningResult");
  details.hidden = !screeningField || !isNegativeScreeningResult(screeningField.value);
}

function isNegativeScreeningResult(result) {
  return result === "当前能力不匹配" || result === "不考虑" || result === "不投";
}

function uniqueStrings(values) {
  const seen = {};
  return Array.from(values || []).map((value) => String(value || "").trim()).filter((value) => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function inferJobDirection(job) {
  if (window.jobScreenshotTools) return window.jobScreenshotTools.suggestJobDirection({ position: job.position, jobCategory: job.jobCategory, industry: job.industry, raw: job.jd });
  const text = [job.position, job.jobCategory, job.industry, job.jd, job.responsibilities]
    .filter(Boolean).join(" ").toLowerCase();
  if (/海外销售|海外营销|国际销售|overseas sales/.test(text)) return "海外销售";
  if (/国际业务|international business/.test(text)) return "国际业务";
  if (/外贸|进出口|出口业务|foreign trade/.test(text)) return "外贸";
  if (/人工智能|大模型|aigc|\bai\b|prompt|智能体/.test(text)) return "AI相关";
  if (/英语教师|英语老师|教师|老师|教学|助教|课程顾问|teacher|teaching/.test(text)) {
    return "英语教育";
  }
  return "其他";
}

function normalizeJobDirection(value) {
  const direction = String(value || "").trim();
  if (direction === "教育（小学/初中）" || direction === "英语教育 / 教师") return "英语教育";
  if (direction === "外贸 / 国际业务 / 海外销售") return "";
  return direction;
}

function syncDirectionFilterOptions() {
  if (window.jobDirections) { window.jobDirections.sync(); return; }
  if (!directionFilter) return;
  const selected = directionFilter.value || "全部";
  const existing = {};
  Array.from(directionFilter.options).forEach((option) => { existing[option.value] = true; });
  uniqueStrings(jobs.map((job) => job.jobDirection)).forEach((direction) => {
    if (existing[direction]) return;
    const option = document.createElement("option");
    option.value = direction;
    option.textContent = direction;
    directionFilter.appendChild(option);
  });
  directionFilter.value = Array.from(directionFilter.options)
    .some((option) => option.value === selected) ? selected : "全部";
}
window.addEventListener("job-directions:changed", renderJobs);
window.addEventListener("DOMContentLoaded", renderJobs);

function formatRejectionReasons(job) {
  const reasons = Array.isArray(job.rejectionReasons) ? job.rejectionReasons.slice() : [];
  if (job.otherRejectionReason) {
    const otherIndex = reasons.indexOf("其他");
    if (otherIndex !== -1) reasons[otherIndex] = `其他：${job.otherRejectionReason}`;
    else reasons.push(`其他：${job.otherRejectionReason}`);
  }
  return reasons.join("、");
}

function createJobId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 使用兼容性更好的方式清空元素，避免旧浏览器不支持 replaceChildren。
function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

// 兼容不支持 Element.closest 的旧浏览器。
function findActionButton(element) {
  let current = element;
  while (current && current !== jobList) {
    if (
      current.tagName === "BUTTON" &&
      current.getAttribute("data-action")
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// 合并岗位数据时不使用较新的对象展开语法。
function mergeObjects() {
  const result = {};
  for (let index = 0; index < arguments.length; index += 1) {
    const source = arguments[index] || {};
    Object.keys(source).forEach((key) => {
      result[key] = source[key];
    });
  }
  return result;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function showMessage(message, type = "success") {
  window.clearTimeout(messageTimer);
  jobsMessage.textContent = message;
  jobsMessage.dataset.type = type;
  messageTimer = window.setTimeout(() => {
    jobsMessage.textContent = "";
    delete jobsMessage.dataset.type;
  }, 3200);
}

function updatePageHash(hash) {
  try {
    window.history.replaceState(null, "", hash);
  } catch (error) {
    // 某些浏览器限制本地文件修改地址时，页面功能仍然可以正常使用。
  }
}

backToTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// 页面载入时先画出已保存的岗位；如果地址中有岗位区域，则直接展开。
renderJobs();
if (window.location.hash === "#job-manager") {
  jobsModuleCard.classList.add("is-active");
  openJobManager(false);
}

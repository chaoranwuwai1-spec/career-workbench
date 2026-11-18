(function () {
  "use strict";

  const STORAGE_KEY = "careerWorkbench.interview.v1";
  const manager = document.querySelector("#interview-manager");
  if (!manager) return;

  const byId = (id) => document.getElementById(id);
  const dialogs = {
    sop: byId("work-sop-dialog"),
    sopStep: byId("work-sop-step-dialog"),
    workLesson: byId("work-lesson-dialog"),
    workLessonMerge: byId("work-lesson-merge-dialog"),
    experience: byId("interview-experience-dialog"),
    project: byId("video-project-dialog"),
    question: byId("interview-question-dialog"),
    star: byId("star-case-dialog"),
    review: byId("interview-review-dialog"),
  };
  const forms = {
    sop: byId("work-sop-form"),
    sopStep: byId("work-sop-step-form"),
    workLesson: byId("work-lesson-form"),
    workLessonMerge: byId("work-lesson-merge-form"),
    experience: byId("interview-experience-form"),
    project: byId("video-project-form"),
    question: byId("interview-question-form"),
    star: byId("star-case-form"),
    review: byId("interview-review-form"),
  };
  let storageReadFailed = false;
  const storageReadMessage = "面试资料读取异常，原数据未被覆盖。为保护已有记录，本页已暂停保存。请保留原数据，排查后重新打开页面。";
  // Display defaults are not stored fields. Keep the original for each unchanged loaded view.
  const originalExperience = new WeakMap();
  function loadedExperience(raw) {
    const view = normalizeExperience(raw);
    originalExperience.set(view, raw);
    return view;
  }
  let state = loadState();
  let activeTab = "sops";
  let editingSopId = "";
  let editingSopStepId = "";
  let editingSopStepParentId = "";
  let editingWorkLessonId = "";
  let mergingWorkLessonId = "";
  let editingExperienceId = "";
  let editingProjectId = "";
  let editingQuestionId = "";
  let editingStarId = "";
  let editingReviewId = "";
  let messageTimer = null;

  window.openInterviewManager = openManager;
  window.interviewWorkspace = Object.assign({}, window.interviewWorkspace || {}, {
    addConfirmedExperience,
    getExperience: (id) => {
      const item = experienceById(id);
      return item ? JSON.parse(JSON.stringify(item)) : null;
    },
  });
  manager.addEventListener("click", handleManagerClick);
  byId("collapse-interview-manager").addEventListener("click", collapseManager);
  byId("work-sop-status-filter").addEventListener("change", renderSops);
  byId("work-lesson-search").addEventListener("input", renderWorkLessons);
  byId("work-lesson-tag-filter").addEventListener("change", renderWorkLessons);
  byId("interview-experience-role-filter").addEventListener("change", renderExperiences);
  byId("interview-question-role-filter").addEventListener("change", renderQuestions);
  byId("interview-ai-question").addEventListener("change", renderAiPanel);
  byId("add-work-sop").addEventListener("click", () => openSopDialog());
  byId("add-work-lesson").addEventListener("click", () => openWorkLessonDialog());
  byId("add-interview-experience").addEventListener("click", () => openExperienceDialog());
  byId("add-video-project-case").addEventListener("click", () => openProjectDialog());
  byId("add-interview-question").addEventListener("click", () => openQuestionDialog());
  byId("add-star-case").addEventListener("click", () => openStarDialog());
  byId("add-interview-review").addEventListener("click", () => openReviewDialog());
  byId("save-interview-answer-draft").addEventListener("click", saveAnswerDraft);
  byId("generate-interview-answer-prompt").addEventListener("click", generateAnswerPrompt);
  byId("copy-interview-answer-prompt").addEventListener("click", copyAnswerPrompt);
  byId("save-interview-ai-result").addEventListener("click", saveAiResult);
  forms.sop.addEventListener("submit", saveSop);
  forms.sopStep.addEventListener("submit", saveSopStep);
  forms.workLesson.addEventListener("submit", saveWorkLesson);
  forms.workLessonMerge.addEventListener("submit", mergeWorkLesson);
  forms.experience.addEventListener("submit", saveExperience);
  forms.project.addEventListener("submit", saveProject);
  forms.question.addEventListener("submit", saveQuestion);
  forms.star.addEventListener("submit", saveStar);
  forms.review.addEventListener("submit", saveReview);
  byId("star-case-experience").addEventListener("change", fillStarFromExperience);
  byId("interview-exp-career").addEventListener("change", updateExperienceCareerFields);
  byId("interview-exp-teacher-type").addEventListener("change", updateExperienceCareerFields);
  document.querySelectorAll("[data-close-interview-dialog]").forEach((button) => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });
  Object.values(dialogs).forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog);
  }));

  renderAll();
  if (window.location.hash === "#interview-manager") {
    document.querySelector(".module-card--work")?.classList.add("is-active");
    openManager(false);
  }

  function emptyState() {
    return { workSops: [], workLessons: [], experiences: [], projectCases: [], questions: [], starCases: [], reviews: [] };
  }

  function readStoredState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const source = JSON.parse(raw);
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Invalid interview storage");
    for (const key of Object.keys(emptyState())) {
      if (source[key] !== undefined && (!Array.isArray(source[key]) ||
          source[key].some((item) => !item || typeof item !== "object" || Array.isArray(item)))) {
        throw new Error("Invalid interview collection");
      }
    }
    return source;
  }

  function loadState() {
    try {
      const source = readStoredState();
      return Object.assign({}, source, {
        workSops: Array.isArray(source.workSops) ? source.workSops.map(normalizeSop) : [],
        workLessons: Array.isArray(source.workLessons) ? source.workLessons.map(normalizeWorkLesson) : [],
        experiences: Array.isArray(source.experiences) ? source.experiences.map(loadedExperience) : [],
        projectCases: Array.isArray(source.projectCases) ? source.projectCases : [],
        questions: Array.isArray(source.questions) ? source.questions : [],
        starCases: Array.isArray(source.starCases) ? source.starCases : [],
        reviews: Array.isArray(source.reviews) ? source.reviews : [],
      });
    } catch (_) {
      storageReadFailed = true;
      return emptyState();
    }
  }

  function normalizeSop(item) {
    const source = item && typeof item === "object" ? item : {};
    const steps = Array.isArray(source.steps) ? source.steps.map(normalizeSopStep) : [];
    return Object.assign({}, source, {
      id: source.id || createId("work-sop"),
      workProjectName: String(source.workProjectName || "未命名工作"),
      name: String(source.name || "未命名 SOP"),
      status: source.status === "archived" ? "archived" : "active",
      steps: steps.sort((left, right) => left.order - right.order).map((step, index) => Object.assign({}, step, { order: index + 1 })),
    });
  }

  function normalizeSopStep(item, index = 0) {
    const source = item && typeof item === "object" ? item : {};
    const allowedStatuses = ["已掌握", "还不熟", "需要确认"];
    return Object.assign({}, source, {
      id: source.id || createId("sop-step"),
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : index + 1,
      title: String(source.title || "未命名步骤"),
      detail: String(source.detail || ""),
      cautions: String(source.cautions || ""),
      commonErrors: String(source.commonErrors || ""),
      confirmationOwner: String(source.confirmationOwner || ""),
      masteryStatus: allowedStatuses.includes(source.masteryStatus) ? source.masteryStatus : "需要确认",
    });
  }

  function normalizeWorkLesson(item) {
    const source = item && typeof item === "object" ? item : {};
    const practiceCount = Math.max(0, Number.parseInt(source.practiceCount, 10) || 0);
    return Object.assign({}, source, {
      id: source.id || createId("work-lesson"),
      date: String(source.date || ""),
      eventBackground: String(source.eventBackground || ""),
      handling: String(source.handling || ""),
      problem: String(source.problem || ""),
      betterApproach: String(source.betterApproach || ""),
      principle: String(source.principle || ""),
      tags: Array.isArray(source.tags) ? Array.from(new Set(source.tags.map((tag) => String(tag).trim()).filter(Boolean))) : [],
      practiced: Boolean(source.practiced || practiceCount > 0),
      practiceCount,
      latestPracticeResult: String(source.latestPracticeResult || ""),
      relatedExperienceIds: Array.isArray(source.relatedExperienceIds) ? Array.from(new Set(source.relatedExperienceIds.map(String))) : [],
      mergedIntoId: String(source.mergedIntoId || ""),
      mergedAt: String(source.mergedAt || ""),
    });
  }

  function saveState(message, nextState = state) {
    if (storageReadFailed) { showMessage(storageReadMessage, true); return false; }
    try {
      const stored = Object.assign({}, nextState, {
        experiences: nextState.experiences.map(item => originalExperience.get(item) || item),
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      state = nextState;
      if (message) showMessage(message);
      renderAll();
      return true;
    } catch (error) {
      showMessage("保存失败，请检查浏览器是否允许本地存储。", true);
      return false;
    }
  }

  function openManager(shouldScroll = true) {
    ["job-manager", "module-preview"].forEach((id) => {
      const element = byId(id);
      if (element) element.hidden = true;
    });
    manager.hidden = false;
    renderAll();
    updateHash("#interview-manager");
    if (shouldScroll) manager.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function collapseManager() {
    manager.hidden = true;
    byId("module-preview").hidden = false;
    document.querySelector(".module-card--work")?.classList.remove("is-active");
    updateHash("#workspace-title");
    byId("workspace-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateHash(hash) {
    if (window.history && typeof window.history.replaceState === "function") window.history.replaceState(null, "", hash);
    else window.location.hash = hash;
  }

  function handleManagerClick(event) {
    const emptyTrigger = event.target.closest("[data-interview-empty-trigger]");
    if (emptyTrigger) {
      byId(emptyTrigger.dataset.interviewEmptyTrigger)?.click();
      return;
    }
    const tabButton = event.target.closest("[data-interview-tab]");
    if (tabButton) return showTab(tabButton.dataset.interviewTab);
    const actionButton = event.target.closest("[data-interview-action]");
    if (!actionButton) return;
    const id = actionButton.dataset.id || "";
    const actions = {
      "edit-sop": () => openSopDialog(id),
      "add-sop-step": () => openSopStepDialog(id),
      "edit-sop-step": () => openSopStepDialog(actionButton.dataset.sopId, id),
      "delete-sop-step": () => deleteSopStep(actionButton.dataset.sopId, id),
      "move-sop-step-up": () => moveSopStep(actionButton.dataset.sopId, id, -1),
      "move-sop-step-down": () => moveSopStep(actionButton.dataset.sopId, id, 1),
      "toggle-sop-archive": () => toggleSopArchive(id),
      "delete-sop": () => deleteSop(id),
      "edit-work-lesson": () => openWorkLessonDialog(id),
      "merge-work-lesson": () => openWorkLessonMergeDialog(id),
      "unmerge-work-lesson": () => unmergeWorkLesson(id),
      "delete-work-lesson": () => deleteWorkLesson(id),
      "edit-experience": () => openExperienceDialog(id),
      "delete-experience": () => deleteExperience(id),
      "edit-project": () => openProjectDialog(id),
      "delete-project": () => deleteProject(id),
      "edit-question": () => openQuestionDialog(id),
      "delete-question": () => deleteQuestion(id),
      "optimize-question": () => openAiForQuestion(id),
      "edit-star": () => openStarDialog(id),
      "delete-star": () => deleteRecord("starCases", id, "确定删除这个STAR案例吗？", "STAR案例已删除。"),
      "edit-review": () => openReviewDialog(id),
      "delete-review": () => deleteRecord("reviews", id, "确定删除这条面试复盘吗？", "面试复盘已删除。"),
    };
    actions[actionButton.dataset.interviewAction]?.();
  }

  function showTab(tab) {
    activeTab = tab;
    manager.querySelectorAll("[data-interview-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.interviewTab === tab));
    manager.querySelectorAll("[data-interview-panel]").forEach((panel) => { panel.hidden = panel.dataset.interviewPanel !== tab; });
    if (tab === "ai") renderAiPanel();
  }

  function renderAll() {
    renderSummary();
    renderSops();
    renderWorkLessonFilters();
    renderWorkLessons();
    renderExperiences();
    renderProjects();
    renderQuestions();
    renderStars();
    renderReviews();
    renderAiQuestionOptions();
    showTab(activeTab);
    if (storageReadFailed) showMessage(storageReadMessage, true);
  }

  function renderSummary() {
    const optimized = state.questions.filter((item) => item.aiResult).length;
    byId("interview-summary").innerHTML = [
      [state.workSops.filter((item) => item.status !== "archived").length, "当前 SOP"],
      [state.workLessons.length, "工作经验"],
      [state.experiences.length, "真实经历"],
      [state.projectCases.length, "视频项目案例"],
      [state.questions.length, "面试问题"],
      [optimized, "已完成AI优化"],
      [state.starCases.length, "STAR案例"],
      [state.reviews.length, "面试复盘"],
    ].map(([value, label]) => `<article><strong>${value}</strong><span>${label}</span></article>`).join("");
  }

  function renderSops() {
    const filter = byId("work-sop-status-filter").value || "active";
    const items = state.workSops.slice().sort((left, right) => {
      if (left.status !== right.status) return left.status === "active" ? -1 : 1;
      return byUpdatedDesc(left, right);
    }).filter((item) => filter === "all" || item.status === filter);
    byId("work-sop-list").innerHTML = items.length ? items.map((item) => {
      const steps = (item.steps || []).slice().sort((left, right) => left.order - right.order);
      const mastered = steps.filter((step) => step.masteryStatus === "已掌握").length;
      const stepHtml = steps.length ? steps.map((step, index) => {
        const details = [
          ["详细说明", step.detail],
          ["注意事项", step.cautions],
          ["常见错误", step.commonErrors],
          ["负责人 / 找谁确认", step.confirmationOwner],
        ].map(([label, value]) => `<div><dt>${label}</dt><dd>${nl2br(value || "暂未填写")}</dd></div>`).join("");
        return `<li class="work-sop-step"><details class="workspace-collapsible workspace-collapsible--compact"><summary><span class="work-sop-step__summary"><strong>${index + 1}. ${escapeHtml(step.title)}</strong><small>${escapeHtml(step.masteryStatus)}</small></span></summary><div class="workspace-collapsible__body"><dl class="interview-detail-list">${details}</dl><p class="work-sop-step__updated">最近更新：${escapeHtml(formatDateTime(step.updatedAt || item.updatedAt))}</p><div class="content-card-actions"><button type="button" data-interview-action="move-sop-step-up" data-sop-id="${item.id}" data-id="${step.id}"${index === 0 ? " disabled" : ""}>上移</button><button type="button" data-interview-action="move-sop-step-down" data-sop-id="${item.id}" data-id="${step.id}"${index === steps.length - 1 ? " disabled" : ""}>下移</button><button type="button" data-interview-action="edit-sop-step" data-sop-id="${item.id}" data-id="${step.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-sop-step" data-sop-id="${item.id}" data-id="${step.id}">删除</button></div></div></details></li>`;
      }).join("") : `<li class="work-sop-empty-step">还没有步骤，可以先建立流程标题。</li>`;
      return `<article class="work-sop-card${item.status === "archived" ? " is-archived" : ""}"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.status === "archived" ? "已归档" : "使用中")} · ${escapeHtml(item.workProjectName)}</span><h4>${escapeHtml(item.name)}</h4><p>${steps.length} 个步骤 · 已掌握 ${mastered} 个 · 最近更新 ${escapeHtml(formatDateTime(item.updatedAt))}</p></div></div>${item.note ? `<p class="interview-record-preview">${nl2br(item.note)}</p>` : ""}<ol class="work-sop-steps">${stepHtml}</ol><div class="content-card-actions"><button class="primary-button" type="button" data-interview-action="add-sop-step" data-id="${item.id}">＋ 新增步骤</button><button type="button" data-interview-action="edit-sop" data-id="${item.id}">编辑 SOP</button><button type="button" data-interview-action="toggle-sop-archive" data-id="${item.id}">${item.status === "archived" ? "恢复使用" : "归档"}</button><button class="danger-button" type="button" data-interview-action="delete-sop" data-id="${item.id}">删除</button></div></article>`;
    }).join("") : emptyHtml(filter === "archived" ? "还没有已归档的 SOP" : "还没有当前使用的 SOP", "可以新建一份工作流程，或切换查看范围。", "add-work-sop");
  }

  function renderWorkLessonFilters() {
    const select = byId("work-lesson-tag-filter");
    const previous = select.value || "all";
    const tags = Array.from(new Set(state.workLessons.flatMap((item) => item.tags || []))).sort((left, right) => left.localeCompare(right, "zh-CN"));
    select.innerHTML = `<option value="all">全部标签</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("")}`;
    select.value = tags.includes(previous) ? previous : "all";
  }

  function renderWorkLessons() {
    const search = String(byId("work-lesson-search").value || "").trim().toLowerCase();
    const tag = byId("work-lesson-tag-filter").value || "all";
    const items = state.workLessons.slice().sort((left, right) => String(right.date || right.updatedAt || "").localeCompare(String(left.date || left.updatedAt || ""))).filter((item) => {
      if (tag !== "all" && !(item.tags || []).includes(tag)) return false;
      if (!search) return true;
      return [item.eventBackground, item.handling, item.problem, item.betterApproach, item.principle, item.latestPracticeResult, ...(item.tags || [])].join(" ").toLowerCase().includes(search);
    });
    byId("work-lesson-list").innerHTML = items.length ? items.map((item) => {
      const related = (item.relatedExperienceIds || []).map(workLessonById).filter(Boolean);
      const mergedTarget = workLessonById(item.mergedIntoId);
      const mastery = workLessonMastery(item);
      const tags = (item.tags || []).map((value) => `<span>${escapeHtml(value)}</span>`).join("");
      const mergedLabel = mergedTarget ? `<em>已合并至：${escapeHtml(shortText(mergedTarget.principle || mergedTarget.eventBackground, 24))}</em>` : `<em>${escapeHtml(mastery)}</em>`;
      return `<article class="interview-record-card${mergedTarget ? " is-merged" : ""}"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.date || "日期未填")} · ${escapeHtml(mastery)}</span><h4>${escapeHtml(shortText(item.principle || item.eventBackground, 64))}</h4></div>${mergedLabel}</div><div class="interview-role-badges">${tags || "<span>未设置标签</span>"}</div><p class="interview-record-preview">${escapeHtml(shortText(item.eventBackground, 100))}</p><details class="workspace-collapsible workspace-collapsible--compact"><summary>查看完整经验和实践记录</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>事件 / 背景</dt><dd>${nl2br(item.eventBackground)}</dd></div><div><dt>当时的处理</dt><dd>${nl2br(item.handling || "未记录")}</dd></div><div><dt>出现的问题</dt><dd>${nl2br(item.problem || "未记录")}</dd></div><div><dt>更好的处理方式</dt><dd>${nl2br(item.betterApproach || "未记录")}</dd></div><div><dt>总结原则</dt><dd>${nl2br(item.principle)}</dd></div><div><dt>实践情况</dt><dd>${item.practiced ? `已再次实践，共 ${item.practiceCount} 次` : "只是知道了，尚未再次实践"}</dd></div><div><dt>最近实践结果</dt><dd>${nl2br(item.latestPracticeResult || "未记录")}</dd></div><div><dt>关联经验</dt><dd>${related.length ? related.map((record) => escapeHtml(shortText(record.principle || record.eventBackground, 44))).join("；") : "未关联"}</dd></div></dl></div></details><div class="content-card-actions"><button type="button" data-interview-action="edit-work-lesson" data-id="${item.id}">编辑</button>${mergedTarget ? `<button type="button" data-interview-action="unmerge-work-lesson" data-id="${item.id}">取消合并</button>` : `<button type="button" data-interview-action="merge-work-lesson" data-id="${item.id}"${state.workLessons.length < 2 ? " disabled" : ""}>合并到…</button>`}<button class="danger-button" type="button" data-interview-action="delete-work-lesson" data-id="${item.id}">删除</button></div></article>`;
    }).join("") : emptyHtml(state.workLessons.length ? "没有符合筛选条件的经验" : "还没有工作经验记录", state.workLessons.length ? "可以清除搜索内容或切换标签。" : "记录一次真实事件，并总结以后仍然适用的原则。", "add-work-lesson");
  }

  function renderExperiences() {
    const filter = byId("interview-experience-role-filter").value || "all";
    const items = state.experiences.slice().sort(byUpdatedDesc).filter((item) => filter === "all" || (item.targetRoles || []).includes(filter));
    byId("interview-experience-list").innerHTML = items.length ? items.map((item) => {
      const roles = (item.targetRoles || []).map(roleBadge).join("");
      const teachingInfo = item.careerDirection === "教师方向" ? [item.teacherType, item.schoolStage, item.subject].filter(Boolean).join(" · ") : "";
      const priority = item.materialPriority === "primary" ? "AI产品优先案例" : item.materialPriority === "backup" ? "AI产品备用案例" : "";
      const optionalRows = [
        ["适合回答", (item.questionTypes || []).join("；")],
        ["第一版做法", item.initialApproach],
        ["使用后发现", item.discoveredProblem],
        ["关键判断", item.keyDecision],
        ["当前状态", item.currentStatus],
        ["能够证明", (item.demonstrates || []).join("；")],
        ["真实性边界", (item.truthBoundaries || []).join("；")],
        ["来源与证据", (item.evidenceSources || []).join("；")],
      ].filter((pair) => pair[1]).map((pair) => `<div><dt>${escapeHtml(pair[0])}</dt><dd>${nl2br(pair[1])}</dd></div>`).join("");
      return `<article class="interview-record-card"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.careerDirection || "通用")} · ${escapeHtml(item.category || "其他")}${priority ? " · " + escapeHtml(priority) : ""}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml([item.organization, item.role, teachingInfo].filter(Boolean).join(" · ") || "未填写机构和角色")}</p></div></div><div class="interview-role-badges">${roles}</div><details class="workspace-collapsible workspace-collapsible--compact"><summary>查看真实经历详情</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>背景</dt><dd>${nl2br(item.situation)}</dd></div><div><dt>要解决的问题</dt><dd>${nl2br(item.task || "未记录")}</dd></div><div><dt>具体行动</dt><dd>${nl2br(item.action)}</dd></div><div><dt>结果与证据</dt><dd>${nl2br(item.result || "未记录")}</dd></div><div><dt>体现能力</dt><dd>${escapeHtml(item.skills || "未记录")}</dd></div>${optionalRows}</dl></div></details><div class="content-card-actions"><button type="button" data-interview-action="edit-experience" data-id="${item.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-experience" data-id="${item.id}">删除</button></div></article>`;
    }).join("") : emptyHtml("还没有符合条件的真实经历", "先添加一段确实发生过的教学、沟通、运营或问题解决经历。", "add-interview-experience");
  }

  function renderProjects() {
    const items = state.projectCases.slice().sort(byUpdatedDesc);
    byId("video-project-case-list").innerHTML = items.length ? items.map((item) => `<article class="interview-record-card"><div class="interview-record-card__heading"><div><span>视频剪辑 · ${escapeHtml(item.videoType || "类型未填")}</span><h4>${escapeHtml(item.projectName)}</h4><p>${escapeHtml(item.tools || "工具未记录")}</p></div></div><div class="interview-role-badges">${(item.linkedModules || []).map(roleBadge).join("")}</div><details class="workspace-collapsible workspace-collapsible--compact"><summary>查看项目流程和数据</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>制作目标</dt><dd>${nl2br(item.goal || "未记录")}</dd></div><div><dt>制作流程</dt><dd>${nl2br(item.workflow || "未记录")}</dd></div><div><dt>数据表现</dt><dd>${nl2br(item.dataPerformance || "未记录")}</dd></div><div><dt>复盘总结</dt><dd>${nl2br(item.review || "未记录")}</dd></div></dl></div></details><div class="content-card-actions"><button type="button" data-interview-action="edit-project" data-id="${item.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-project" data-id="${item.id}">删除</button></div></article>`).join("") : emptyHtml("还没有视频剪辑项目案例", "可以记录抖音、公众号或AI工作台相关的真实视频制作项目。", "add-video-project-case");
  }

  function renderQuestions() {
    const filter = byId("interview-question-role-filter").value || "all";
    const items = state.questions.slice().sort(byUpdatedDesc).filter((item) => filter === "all" || item.targetRole === filter);
    byId("interview-question-list").innerHTML = items.length ? items.map((item) => {
      const linked = linkedExperiences(item);
      const projects = linkedProjects(item);
      const check = analyzeAnswer(item, linked, projects);
      const sourceNames = linked.map((exp) => exp.title).concat(projects.map((project) => project.projectName));
      return `<article class="interview-record-card"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.targetRole)} · ${escapeHtml(item.category)}</span><h4>${escapeHtml(item.question)}</h4></div><em>${item.aiResult ? "已优化" : item.answerDraft ? "已有回答" : "待准备"}</em></div><p class="interview-record-preview">${sourceNames.length ? `关联真实资料：${sourceNames.map(escapeHtml).join("、")}` : "尚未关联真实经历或项目案例"}</p><div class="interview-mini-checks"><span>${check.match.ok ? "✓" : "!"} 岗位</span><span>${check.specific.ok ? "✓" : "!"} 具体</span><span>${check.case.ok ? "✓" : "!"} 案例</span></div><details class="workspace-collapsible workspace-collapsible--compact"><summary>查看回答与优化记录</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>原始回答</dt><dd>${nl2br(item.answerDraft || "尚未填写")}</dd></div><div><dt>AI优化结果</dt><dd>${nl2br(item.aiResult || "尚未保存")}</dd></div></dl></div></details><div class="content-card-actions"><button class="primary-button" type="button" data-interview-action="optimize-question" data-id="${item.id}">AI回答优化</button><button type="button" data-interview-action="edit-question" data-id="${item.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-question" data-id="${item.id}">删除</button></div></article>`;
    }).join("") : emptyHtml("还没有面试问题", "保存问题并关联真实经历，之后再进入AI回答优化。", "add-interview-question");
  }

  function renderStars() {
    const items = state.starCases.slice().sort(byUpdatedDesc);
    byId("star-case-list").innerHTML = items.length ? items.map((item) => `<article class="interview-record-card"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.targetRole)} · STAR</span><h4>${escapeHtml(item.title)}</h4><p>来源：${escapeHtml(item.sourceExperienceTitle || experienceById(item.experienceId)?.title || "原经历已删除")}</p></div></div><details class="workspace-collapsible workspace-collapsible--compact"><summary>展开STAR案例</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>S · 情境</dt><dd>${nl2br(item.situation || "未填写")}</dd></div><div><dt>T · 任务</dt><dd>${nl2br(item.task || "未填写")}</dd></div><div><dt>A · 行动</dt><dd>${nl2br(item.action || "未填写")}</dd></div><div><dt>R · 结果</dt><dd>${nl2br(item.result || "未填写")}</dd></div></dl></div></details><div class="content-card-actions"><button type="button" data-interview-action="edit-star" data-id="${item.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-star" data-id="${item.id}">删除</button></div></article>`).join("") : emptyHtml("还没有STAR案例", state.experiences.length ? "选择一段真实经历，把它整理成STAR结构。" : "请先在个人经历库添加真实经历。", "add-star-case");
  }

  function renderReviews() {
    const items = state.reviews.slice().sort((left, right) => String(right.date || right.updatedAt).localeCompare(String(left.date || left.updatedAt)));
    byId("interview-review-list").innerHTML = items.length ? items.map((item) => `<article class="interview-record-card"><div class="interview-record-card__heading"><div><span>${escapeHtml(item.date || "日期未填")} · ${escapeHtml(item.targetRole)}</span><h4>${escapeHtml(item.position)}</h4><p>${escapeHtml(item.company || "机构未填写")}</p></div><em>${item.rating ? `${item.rating}/5` : "未评分"}</em></div><details class="workspace-collapsible workspace-collapsible--compact"><summary>查看完整复盘</summary><div class="workspace-collapsible__body"><dl class="interview-detail-list"><div><dt>实际问题</dt><dd>${nl2br(item.questions || "未记录")}</dd></div><div><dt>做得较好</dt><dd>${nl2br(item.good || "未记录")}</dd></div><div><dt>需要改进</dt><dd>${nl2br(item.improve || "未记录")}</dd></div><div><dt>下一次行动</dt><dd>${nl2br(item.nextAction || "未记录")}</dd></div></dl></div></details><div class="content-card-actions"><button type="button" data-interview-action="edit-review" data-id="${item.id}">编辑</button><button class="danger-button" type="button" data-interview-action="delete-review" data-id="${item.id}">删除</button></div></article>`).join("") : emptyHtml("还没有面试复盘", "完成一次真实面试后，记录实际问题、表现和下一步行动。", "add-interview-review");
  }

  function renderAiQuestionOptions() {
    const select = byId("interview-ai-question");
    const previous = select.value;
    const questions = state.questions.slice().sort(byUpdatedDesc);
    select.innerHTML = questions.length ? questions.map((item) => `<option value="${item.id}">${escapeHtml(item.targetRole)}｜${escapeHtml(item.question)}</option>`).join("") : `<option value="">请先建立面试问题</option>`;
    select.value = questions.some((item) => item.id === previous) ? previous : questions[0]?.id || "";
  }

  function renderAiPanel() {
    const question = questionById(byId("interview-ai-question").value);
    if (!question) {
      byId("interview-ai-context").innerHTML = `<p>请先在面试问题库中建立问题并关联真实经历。</p>`;
      byId("interview-answer-draft").value = "";
      byId("interview-answer-prompt").value = "";
      byId("interview-ai-result").value = "";
      byId("interview-answer-check").innerHTML = "";
      return;
    }
    const material = answerMaterials(question);
    const linked = material.experiences;
    const projects = material.projects;
    const sources = linked.map((item) => item.title).concat(projects.map((item) => item.projectName));
    byId("interview-ai-context").innerHTML = `<strong>${escapeHtml(question.targetRole)}｜${escapeHtml(question.question)}</strong><p>${sources.length ? `新提示词只允许使用已确认资料：${sources.map(escapeHtml).join("、")}` : "没有符合真实性条件的关联资料，暂时不能生成新提示词。"}</p><p>${escapeHtml(material.notice)}历史提示词和AI答案保留原样，不代表已通过本次真实性检查。</p>`;
    byId("interview-answer-draft").value = question.answerDraft || "";
    byId("interview-answer-prompt").value = question.aiPrompt || "";
    byId("interview-ai-result").value = question.aiResult || "";
    byId("interview-ai-saved").textContent = question.aiSavedAt ? `上次保存：${formatDateTime(question.aiSavedAt)}` : "尚未保存优化结果";
    renderAnswerCheck(question, linked, projects);
  }

  function renderAnswerCheck(question, linked, projects) {
    const analysis = analyzeAnswer(Object.assign({}, question, { answerDraft: byId("interview-answer-draft").value }), linked, projects || linkedProjects(question));
    byId("interview-answer-check").innerHTML = [analysis.match, analysis.specific, analysis.case, analysis.improve].map((item) => `<article class="${item.ok ? "is-good" : "needs-work"}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.text)}</strong></article>`).join("");
  }

  function analyzeAnswer(question, linked, projects) {
    const draft = String(question.answerDraft || "").trim();
    const matchedExperience = linked.some((item) => (item.targetRoles || []).includes(question.targetRole) || (item.targetRoles || []).includes("通用"));
    const matchedProject = ["视频剪辑", "运营"].includes(question.targetRole) && (projects || []).length > 0;
    const matched = matchedExperience || matchedProject;
    const hasSpecificDetail = draft.length >= 80 || /\d|具体|当时|后来|最后|结果/.test(draft);
    const hasCase = (linked.length > 0 || (projects || []).length > 0) && draft.length >= 30;
    const suggestions = [];
    if (!matched) suggestions.push("补充适用于当前岗位的真实经历");
    if (!hasSpecificDetail) suggestions.push("增加具体情境、行动或结果");
    if (!hasCase) suggestions.push("明确引用一段真实案例");
    return {
      match: { label: "是否符合岗位", ok: matched, text: matched ? `已关联适用于${question.targetRole}的真实资料` : `缺少适用于${question.targetRole}的真实资料` },
      specific: { label: "是否具体", ok: hasSpecificDetail, text: hasSpecificDetail ? "已有具体细节" : "目前较概括" },
      case: { label: "是否有案例", ok: hasCase, text: hasCase ? "回答中已有案例基础" : "尚未形成完整案例" },
      improve: { label: "如何提升", ok: suggestions.length === 0, text: suggestions.length ? suggestions.join("；") : "保持真实，并压缩成清楚的岗位回答" },
    };
  }

  function openSopDialog(id) {
    editingSopId = id || "";
    const item = sopById(id);
    forms.sop.reset();
    byId("work-sop-dialog-title").textContent = item ? "编辑工作 SOP" : "新建工作 SOP";
    forms.sop.elements.status.value = "active";
    if (item) fillForm(forms.sop, item);
    openDialog(dialogs.sop);
  }

  function saveSop(event) {
    event.preventDefault();
    const values = formValues(forms.sop);
    const previous = sopById(editingSopId);
    const now = new Date().toISOString();
    const record = normalizeSop(Object.assign({}, previous || {}, values, {
      id: previous?.id || createId("work-sop"),
      steps: previous?.steps || [],
      archivedAt: values.status === "archived" ? previous?.archivedAt || now : "",
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }));
    upsert("workSops", record);
    if (!saveState(previous ? "工作 SOP 已更新。" : "工作 SOP 已保存。")) return;
    closeDialog(dialogs.sop);
  }

  function openSopStepDialog(sopId, stepId) {
    const sop = sopById(sopId);
    if (!sop) return showMessage("没有找到这份 SOP。", true);
    editingSopStepParentId = sopId;
    editingSopStepId = stepId || "";
    const item = (sop.steps || []).find((step) => step.id === stepId);
    forms.sopStep.reset();
    forms.sopStep.elements.masteryStatus.value = "需要确认";
    byId("work-sop-step-dialog-title").textContent = item ? "编辑流程步骤" : "新增流程步骤";
    if (item) fillForm(forms.sopStep, item);
    openDialog(dialogs.sopStep);
  }

  function saveSopStep(event) {
    event.preventDefault();
    const sop = sopById(editingSopStepParentId);
    if (!sop) return showMessage("保存失败：对应的 SOP 已不存在。", true);
    const values = formValues(forms.sopStep);
    const previous = (sop.steps || []).find((step) => step.id === editingSopStepId);
    const now = new Date().toISOString();
    const record = normalizeSopStep(Object.assign({}, previous || {}, values, {
      id: previous?.id || createId("sop-step"),
      order: previous?.order || (sop.steps || []).length + 1,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }));
    const index = (sop.steps || []).findIndex((step) => step.id === record.id);
    if (index >= 0) sop.steps[index] = record;
    else sop.steps.push(record);
    reindexSopSteps(sop);
    sop.updatedAt = now;
    if (!saveState(previous ? "SOP 步骤已更新。" : "SOP 步骤已添加。")) return;
    closeDialog(dialogs.sopStep);
  }

  function moveSopStep(sopId, stepId, direction) {
    const sop = sopById(sopId);
    if (!sop) return;
    const steps = (sop.steps || []).slice().sort((left, right) => left.order - right.order);
    const index = steps.findIndex((step) => step.id === stepId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= steps.length) return;
    [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
    const now = new Date().toISOString();
    sop.steps = steps.map((step, stepIndex) => Object.assign({}, step, { order: stepIndex + 1, updatedAt: step.id === stepId ? now : step.updatedAt }));
    sop.updatedAt = now;
    saveState("步骤顺序已调整。 ");
  }

  function deleteSopStep(sopId, stepId) {
    const sop = sopById(sopId);
    const step = (sop?.steps || []).find((item) => item.id === stepId);
    if (!sop || !step || !window.confirm(`确定删除步骤“${step.title}”吗？`)) return;
    sop.steps = sop.steps.filter((item) => item.id !== stepId);
    reindexSopSteps(sop);
    sop.updatedAt = new Date().toISOString();
    saveState("SOP 步骤已删除。 ");
  }

  function reindexSopSteps(sop) {
    sop.steps = (sop.steps || []).slice().sort((left, right) => left.order - right.order).map((step, index) => Object.assign({}, step, { order: index + 1 }));
  }

  function toggleSopArchive(id) {
    const sop = sopById(id);
    if (!sop) return;
    const now = new Date().toISOString();
    const archive = sop.status !== "archived";
    sop.status = archive ? "archived" : "active";
    sop.archivedAt = archive ? now : "";
    sop.updatedAt = now;
    saveState(archive ? "工作 SOP 已归档。" : "工作 SOP 已恢复使用。 ");
  }

  function deleteSop(id) {
    const sop = sopById(id);
    if (!sop || !window.confirm(`确定删除“${sop.workProjectName} · ${sop.name}”吗？\n其中的流程步骤也会一起删除。`)) return;
    state.workSops = state.workSops.filter((item) => item.id !== id);
    saveState("工作 SOP 已删除。 ");
  }

  function openWorkLessonDialog(id) {
    editingWorkLessonId = id || "";
    const item = workLessonById(id);
    forms.workLesson.reset();
    byId("work-lesson-dialog-title").textContent = item ? "编辑工作经验" : "添加工作经验";
    forms.workLesson.elements.date.value = todayString();
    forms.workLesson.elements.practiceCount.value = "0";
    if (item) {
      fillForm(forms.workLesson, Object.assign({}, item, { tagsText: (item.tags || []).join("、") }));
      forms.workLesson.elements.practiced.checked = Boolean(item.practiced);
    }
    renderWorkLessonRelationOptions(item?.relatedExperienceIds || [], item?.id || "");
    openDialog(dialogs.workLesson);
  }

  function renderWorkLessonRelationOptions(selectedIds, currentId) {
    const candidates = state.workLessons.filter((item) => item.id !== currentId);
    byId("work-lesson-related-options").innerHTML = candidates.length ? candidates.slice().sort(byUpdatedDesc).map((item) => `<label><input type="checkbox" name="relatedExperienceIds" value="${item.id}"${selectedIds.includes(item.id) ? " checked" : ""} /><span><strong>${escapeHtml(shortText(item.principle || item.eventBackground, 52))}</strong><small>${escapeHtml(item.date || "日期未填")} · ${escapeHtml((item.tags || []).join("、") || "未设置标签")}</small></span></label>`).join("") : `<p>目前没有其他经验可以关联。</p>`;
  }

  function saveWorkLesson(event) {
    event.preventDefault();
    const values = formValues(forms.workLesson);
    const previous = workLessonById(editingWorkLessonId);
    const now = new Date().toISOString();
    const practiceCount = Math.max(0, Number.parseInt(values.practiceCount, 10) || 0);
    const practiced = forms.workLesson.elements.practiced.checked || practiceCount > 0;
    const record = normalizeWorkLesson(Object.assign({}, previous || {}, values, {
      id: previous?.id || createId("work-lesson"),
      tags: parseTags(values.tagsText),
      practiced,
      practiceCount: practiced && practiceCount === 0 ? 1 : practiceCount,
      relatedExperienceIds: checkedValues(forms.workLesson, "relatedExperienceIds"),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    }));
    delete record.tagsText;
    upsert("workLessons", record);
    syncWorkLessonRelations(record);
    if (!saveState(previous ? "工作经验已更新。" : "工作经验已保存。")) return;
    closeDialog(dialogs.workLesson);
  }

  function syncWorkLessonRelations(record) {
    state.workLessons.forEach((item) => {
      if (item.id === record.id) return;
      const shouldLink = record.relatedExperienceIds.includes(item.id);
      const links = new Set(item.relatedExperienceIds || []);
      if (shouldLink) links.add(record.id);
      else links.delete(record.id);
      item.relatedExperienceIds = Array.from(links);
    });
  }

  function openWorkLessonMergeDialog(id) {
    const source = workLessonById(id);
    const candidates = state.workLessons.filter((item) => item.id !== id && !item.mergedIntoId);
    if (!source || !candidates.length) return showMessage("目前没有其他可作为合并目标的工作经验。", true);
    mergingWorkLessonId = id;
    byId("work-lesson-merge-target").innerHTML = candidates.map((item) => `<option value="${item.id}">${escapeHtml(shortText(item.principle || item.eventBackground, 70))}</option>`).join("");
    openDialog(dialogs.workLessonMerge);
  }

  function mergeWorkLesson(event) {
    event.preventDefault();
    const source = workLessonById(mergingWorkLessonId);
    const target = workLessonById(forms.workLessonMerge.elements.targetId.value);
    if (!source || !target || source.id === target.id) return showMessage("请选择有效的合并目标。", true);
    if (!window.confirm("确认把这条经验标记为已合并吗？\n原记录不会删除，两条记录会建立关联。")) return;
    const now = new Date().toISOString();
    source.mergedIntoId = target.id;
    source.mergedAt = now;
    source.updatedAt = now;
    source.relatedExperienceIds = Array.from(new Set([...(source.relatedExperienceIds || []), target.id]));
    target.relatedExperienceIds = Array.from(new Set([...(target.relatedExperienceIds || []), source.id]));
    target.tags = Array.from(new Set([...(target.tags || []), ...(source.tags || [])]));
    target.updatedAt = now;
    if (!saveState("同类经验已非破坏合并，原记录仍然保留。")) return;
    closeDialog(dialogs.workLessonMerge);
  }

  function unmergeWorkLesson(id) {
    const source = workLessonById(id);
    const target = workLessonById(source?.mergedIntoId);
    if (!source) return;
    source.mergedIntoId = "";
    source.mergedAt = "";
    source.updatedAt = new Date().toISOString();
    if (target) {
      target.relatedExperienceIds = (target.relatedExperienceIds || []).filter((relatedId) => relatedId !== source.id);
      target.updatedAt = source.updatedAt;
    }
    saveState("合并标记已取消，原经验仍然保留。 ");
  }

  function deleteWorkLesson(id) {
    const item = workLessonById(id);
    if (!item || !window.confirm(`确定删除这条工作经验吗？\n“${shortText(item.principle || item.eventBackground, 44)}”`)) return;
    state.workLessons = state.workLessons.filter((record) => record.id !== id).map((record) => Object.assign({}, record, {
      relatedExperienceIds: (record.relatedExperienceIds || []).filter((relatedId) => relatedId !== id),
      mergedIntoId: record.mergedIntoId === id ? "" : record.mergedIntoId,
      mergedAt: record.mergedIntoId === id ? "" : record.mergedAt,
    }));
    saveState("工作经验已删除，相关关联已解除。 ");
  }

  function openExperienceDialog(id) {
    editingExperienceId = id || "";
    const item = experienceById(id);
    forms.experience.reset();
    byId("interview-experience-title").textContent = item ? "编辑真实经历" : "添加真实经历";
    if (item) fillForm(forms.experience, item);
    if (item) {
      forms.experience.elements.questionTypesText.value = (item.questionTypes || []).join("\n");
      forms.experience.elements.demonstratesText.value = (item.demonstrates || []).join("\n");
      forms.experience.elements.truthBoundariesText.value = (item.truthBoundaries || []).join("\n");
      forms.experience.elements.evidenceSourcesText.value = (item.evidenceSources || []).join("\n");
    }
    const roles = item?.targetRoles || [];
    forms.experience.querySelectorAll('input[name="targetRoles"]').forEach((input) => { input.checked = roles.includes(input.value); });
    updateExperienceCareerFields();
    openDialog(dialogs.experience);
  }

  function updateExperienceCareerFields() {
    const isTeacher = forms.experience.elements.careerDirection.value === "教师方向";
    const isOtherSubject = forms.experience.elements.teacherType.value === "其他学科老师";
    byId("interview-teacher-fields").hidden = !isTeacher;
    forms.experience.elements.schoolStage.disabled = !isTeacher || !isOtherSubject;
    if (isTeacher && !isOtherSubject) {
      forms.experience.elements.subject.value = forms.experience.elements.subject.value || "英语";
    }
  }

  function saveExperience(event) {
    event.preventDefault();
    const values = formValues(forms.experience);
    values.questionTypes = parseLines(values.questionTypesText);
    values.demonstrates = parseLines(values.demonstratesText);
    values.truthBoundaries = parseLines(values.truthBoundariesText);
    values.evidenceSources = parseLines(values.evidenceSourcesText);
    delete values.questionTypesText;
    delete values.demonstratesText;
    delete values.truthBoundariesText;
    delete values.evidenceSourcesText;
    const previous = experienceById(editingExperienceId);
    let targetRoles = checkedValues(forms.experience, "targetRoles");
    const visibleRoleValues = Array.from(forms.experience.querySelectorAll('input[name="targetRoles"]')).map((input) => input.value);
    const preservedCustomRoles = (previous?.targetRoles || []).filter((role) => !visibleRoleValues.includes(role));
    targetRoles = Array.from(new Set(targetRoles.concat(preservedCustomRoles)));
    if (values.careerDirection === "教师方向") {
      if (values.teacherType === "英语老师") {
        values.schoolStage = "";
        values.subject = values.subject || "英语";
        targetRoles = Array.from(new Set(targetRoles.concat("英语老师")));
      } else {
        values.schoolStage = values.schoolStage || "小学";
        const teacherRole = `${values.schoolStage}其他学科老师`;
        targetRoles = Array.from(new Set(targetRoles.concat(teacherRole)));
      }
    } else {
      values.teacherType = "";
      values.schoolStage = "";
      values.subject = "";
      if (["视频剪辑", "运营", "销售", "通用"].includes(values.careerDirection)) {
        targetRoles = Array.from(new Set(targetRoles.concat(values.careerDirection)));
      }
    }
    if (!targetRoles.length) return showMessage("请至少选择一个适用岗位方向。", true);
    const now = new Date().toISOString();
    const record = Object.assign({}, previous || {}, values, { id: previous?.id || createId("experience"), targetRoles, createdAt: previous?.createdAt || now, updatedAt: now });
    const edited = normalizeExperience(record);
    const experiences = previous
      ? state.experiences.map(item => item === previous ? edited : item)
      : state.experiences.concat(edited);
    if (!saveState(previous ? "真实经历已更新。" : "真实经历已保存。", Object.assign({}, state, { experiences }))) return;
    closeDialog(dialogs.experience);
  }

  function addConfirmedExperience(input) {
    if (storageReadFailed) { showMessage(storageReadMessage, true); throw new Error(storageReadMessage); }
    const source = input && typeof input === "object" ? input : {};
    if (source.confirmedByUser !== true) throw new Error("这条案例还没有经过你的确认，不能写入长期素材。 ");
    const title = String(source.title || "").trim();
    const situation = String(source.situation || "").trim();
    const action = String(source.action || "").trim();
    if (!title || !situation || !action) throw new Error("请至少确认案例名称、背景和你实际做过的行动。 ");
    let rawStore;
    try { rawStore = readStoredState(); }
    catch (_) {
      storageReadFailed = true;
      showMessage(storageReadMessage, true);
      throw new Error(storageReadMessage);
    }
    const rawExperiences = Array.isArray(rawStore.experiences) ? rawStore.experiences.slice() : [];
    const existing = rawExperiences.find((item) => item.id === source.id || (source.sourceTurnId && item.sourceType === "jobInterviewSimulation" && item.sourceTurnId === source.sourceTurnId));
    const now = new Date().toISOString();
    const record = normalizeExperience(Object.assign({}, existing || {}, source, {
      id: existing?.id || source.id || createId("experience"),
      title,
      situation,
      action,
      targetRoles: Array.from(new Set((Array.isArray(source.targetRoles) ? source.targetRoles : []).map((value) => String(value).trim()).filter(Boolean))),
      confirmedByUser: true,
      confirmedAt: source.confirmedAt || now,
      createdAt: existing?.createdAt || source.createdAt || now,
      updatedAt: now,
    }));
    if (!record.targetRoles.length) record.targetRoles = ["通用"];
    const existingIndex = rawExperiences.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) rawExperiences[existingIndex] = record;
    else rawExperiences.push(record);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, rawStore, { experiences: rawExperiences }))); }
    catch (_) { throw new Error("浏览器没有成功保存这条面试素材。 "); }
    state.experiences = rawExperiences.map(loadedExperience);
    renderAll();
    return JSON.parse(JSON.stringify(record));
  }

  function openProjectDialog(id) {
    editingProjectId = id || "";
    const item = state.projectCases.find((record) => record.id === id);
    forms.project.reset();
    byId("video-project-title").textContent = item ? "编辑视频剪辑项目案例" : "添加视频剪辑项目案例";
    const select = forms.project.elements.experienceId;
    select.replaceChildren(new Option("无关联", ""));
    for (const experience of state.experiences.slice().sort(byUpdatedDesc)) {
      select.add(new Option(experience.title, experience.id));
    }
    if (item?.experienceId && !experienceById(item.experienceId)) {
      select.add(new Option("原关联经历已不存在，请重新选择", item.experienceId));
    }
    if (item) fillForm(forms.project, item);
    const linkedModules = item?.linkedModules || [];
    forms.project.querySelectorAll('input[name="linkedModules"]').forEach((input) => { input.checked = linkedModules.includes(input.value); });
    openDialog(dialogs.project);
  }

  function saveProject(event) {
    event.preventDefault();
    const values = formValues(forms.project);
    if (values.experienceId && !experienceById(values.experienceId)) {
      return showMessage("关联经历不存在，请重新选择或选择无关联。", true);
    }
    const previous = state.projectCases.find((item) => item.id === editingProjectId);
    const now = new Date().toISOString();
    const record = Object.assign({}, previous || {}, values, {
      id: previous?.id || createId("video-project"),
      careerDirection: "视频剪辑",
      linkedModules: checkedValues(forms.project, "linkedModules"),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    });
    if (!values.experienceId) delete record.experienceId;
    const projectCases = previous
      ? state.projectCases.map(item => item === previous ? record : item)
      : state.projectCases.concat(record);
    if (!saveState(previous ? "视频剪辑项目案例已更新。" : "视频剪辑项目案例已保存。", Object.assign({}, state, { projectCases }))) return;
    closeDialog(dialogs.project);
  }

  function openQuestionDialog(id) {
    editingQuestionId = id || "";
    const item = questionById(id);
    forms.question.reset();
    byId("interview-question-title").textContent = item ? "编辑面试问题" : "添加面试问题";
    if (item) fillForm(forms.question, item);
    renderExperienceOptions(item?.experienceIds || []);
    renderProjectOptions(item?.projectCaseIds || []);
    openDialog(dialogs.question);
  }

  function renderExperienceOptions(selectedIds) {
    byId("interview-question-experience-options").innerHTML = state.experiences.length ? state.experiences.slice().sort(byUpdatedDesc).map((item) => `<label><input type="checkbox" name="experienceIds" value="${item.id}"${selectedIds.includes(item.id) ? " checked" : ""} /><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml((item.targetRoles || []).join("、"))} · ${escapeHtml(item.category || "其他")}</small></span></label>`).join("") : `<p>经历库还是空的，可以先保存问题，之后再编辑关联。</p>`;
  }

  function renderProjectOptions(selectedIds) {
    byId("interview-question-project-options").innerHTML = state.projectCases.length ? state.projectCases.slice().sort(byUpdatedDesc).map((item) => `<label><input type="checkbox" name="projectCaseIds" value="${item.id}"${selectedIds.includes(item.id) ? " checked" : ""} /><span><strong>${escapeHtml(item.projectName)}</strong><small>${escapeHtml(item.videoType || "视频类型未填")} · ${escapeHtml(item.tools || "工具未填")}</small></span></label>`).join("") : `<p>还没有视频剪辑项目案例，非视频岗位可以不关联。</p>`;
  }

  function saveQuestion(event) {
    event.preventDefault();
    const values = formValues(forms.question);
    const previous = questionById(editingQuestionId);
    const now = new Date().toISOString();
    const record = Object.assign({}, previous || {}, values, { id: previous?.id || createId("question"), experienceIds: checkedValues(forms.question, "experienceIds"), projectCaseIds: checkedValues(forms.question, "projectCaseIds"), createdAt: previous?.createdAt || now, updatedAt: now });
    upsert("questions", record);
    if (!saveState(previous ? "面试问题已更新。" : "面试问题已保存。")) return;
    closeDialog(dialogs.question);
  }

  function openAiForQuestion(id) {
    showTab("ai");
    byId("interview-ai-question").value = id;
    renderAiPanel();
  }

  function saveAnswerDraft() {
    const question = questionById(byId("interview-ai-question").value);
    if (!question) return showMessage("请先选择一个面试问题。", true);
    question.answerDraft = byId("interview-answer-draft").value.trim();
    question.updatedAt = new Date().toISOString();
    saveState("原始回答已保存。");
  }

  function generateAnswerPrompt() {
    const question = questionById(byId("interview-ai-question").value);
    if (!question) return showMessage("请先选择一个面试问题。", true);
    const material = answerMaterials(question);
    const linked = material.experiences;
    const projects = material.projects;
    if (!linked.length && !projects.length) return showMessage(material.notice + "没有符合真实性条件的关联资料，本次未生成；原记录和历史答案保持不变。", true);
    const draft = byId("interview-answer-draft").value.trim();
    question.answerDraft = draft;
    const experienceFacts = linked.map((item, index) => `【真实经历${index + 1}】\n名称：${item.title}\n职业类型：${item.careerDirection || "通用"}\n适用岗位：${(item.targetRoles || []).join("、")}\n教师信息：${[item.teacherType, item.schoolStage, item.subject].filter(Boolean).join(" / ") || "不适用"}\n机构/角色：${[item.organization, item.role].filter(Boolean).join(" / ") || "未填写"}\n背景：${item.situation}\n我的行动：${item.action}\n真实结果：${item.result || "没有记录结果，不得补写"}\n能力：${item.skills || "未填写"}`).join("\n\n");
    const projectFacts = projects.map((item, index) => `【真实视频项目${index + 1}】\n项目名称：${item.projectName}\n视频类型：${item.videoType || "未填写"}\n制作目标：${item.goal || "未填写"}\n使用工具：${item.tools || "未填写"}\n制作流程：${item.workflow || "未填写"}\n真实数据表现：${item.dataPerformance || "没有记录数据，不得补写"}\n复盘总结：${item.review || "未填写"}\n关联模块：${(item.linkedModules || []).join("、") || "未关联"}`).join("\n\n");
    const facts = [experienceFacts, projectFacts].filter(Boolean).join("\n\n");
    const prompt = `你是一位面试回答教练。请只使用下面提供的真实经历和真实项目优化回答，禁止虚构公司、学校、学生、家长、客户、项目、工具、数字、职责、结果或评价。如果信息不足，请明确指出需要我补充什么，不要自行补齐。\n\n【目标岗位方向】\n${question.targetRole}\n\n【面试问题】\n${question.question}\n\n【我的原始回答】\n${draft || "尚未填写，请先基于真实资料给出回答结构，不要代造事实。"}\n\n【允许使用的真实资料】\n${facts}\n\n岗位调用原则：教师岗位优先使用同学段、同学科的教学、课堂、学生辅导、家长沟通和教学成果；视频剪辑或运营岗位优先使用制作流程、工具使用、内容优化和真实数据；销售岗位优先使用客户沟通、需求判断和真实转化经历。不得为了匹配岗位而改写事实。\n\n请固定输出：\n1. 是否符合岗位：分析回答是否突出${question.targetRole}真正相关的能力。\n2. 是否具体：指出哪些地方具体，哪些仍然空泛。\n3. 是否有案例：判断是否形成清楚案例，并说明缺少哪一部分。\n4. 如何提升：给出可执行的修改建议。\n5. 优化后的回答：使用自然口语，优先采用STAR结构；只能重组已有事实，不得新增事实。\n6. 事实核对：列出优化回答使用了哪些原始事实，并标出仍需本人确认或补充的内容。`;
    question.aiPrompt = prompt.replace("【我的原始回答】", "【我的原始回答：待核对草稿，不是已确认事实】") + "\n\n真实性边界：原始回答及其中可能引用的历史STAR或AI答案仅供检查，不构成事实依据。只有【允许使用的真实资料】中的已确认内容可以作为事实；草稿中额外的经历、数字和结果必须标为待确认，不得写进确定性回答。";
    question.updatedAt = new Date().toISOString();
    byId("interview-answer-prompt").value = question.aiPrompt;
    renderAnswerCheck(question, linked, projects);
    saveState("AI优化提示词已生成并保存。" + material.notice);
  }

  function copyAnswerPrompt() {
    const text = byId("interview-answer-prompt").value.trim();
    if (!text) return showMessage("请先生成AI优化提示词。", true);
    const fallback = () => {
      const textarea = byId("interview-answer-prompt");
      textarea.focus(); textarea.select();
      try { document.execCommand("copy"); showMessage("提示词已复制。"); } catch (error) { showMessage("自动复制失败，请手动全选复制。", true); }
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showMessage("提示词已复制。")).catch(fallback);
    else fallback();
  }

  function saveAiResult() {
    const question = questionById(byId("interview-ai-question").value);
    const result = byId("interview-ai-result").value.trim();
    if (!question) return showMessage("请先选择一个面试问题。", true);
    if (!result) return showMessage("请先粘贴 ChatGPT 的优化结果。", true);
    question.answerDraft = byId("interview-answer-draft").value.trim();
    question.aiPrompt = byId("interview-answer-prompt").value;
    question.aiResult = result;
    question.aiSavedAt = new Date().toISOString();
    question.updatedAt = question.aiSavedAt;
    saveState("AI回答优化结果已保存到这个问题。 ");
  }

  function openStarDialog(id) {
    if (!state.experiences.length) return showMessage("请先添加至少一段真实经历。", true);
    editingStarId = id || "";
    const item = state.starCases.find((record) => record.id === id);
    forms.star.reset();
    byId("star-case-title").textContent = item ? "编辑STAR案例" : "添加STAR案例";
    byId("star-case-experience").innerHTML = state.experiences.slice().sort(byUpdatedDesc).map((exp) => `<option value="${exp.id}">${escapeHtml(exp.title)}</option>`).join("");
    if (item) fillForm(forms.star, item);
    else fillStarFromExperience();
    openDialog(dialogs.star);
  }

  function fillStarFromExperience() {
    if (editingStarId) return;
    const experience = experienceById(byId("star-case-experience").value);
    if (!experience) return;
    forms.star.elements.title.value = experience.title;
    forms.star.elements.targetRole.value = experience.targetRoles?.[0] || "通用";
    forms.star.elements.situation.value = experience.situation || "";
    forms.star.elements.task.value = experience.task || "";
    forms.star.elements.action.value = experience.action || "";
    forms.star.elements.result.value = experience.result || "";
  }

  function saveStar(event) {
    event.preventDefault();
    const values = formValues(forms.star);
    const experience = experienceById(values.experienceId);
    if (!experience) return showMessage("请选择仍然存在的来源经历。", true);
    const previous = state.starCases.find((item) => item.id === editingStarId);
    const now = new Date().toISOString();
    const record = Object.assign({}, previous || {}, values, { id: previous?.id || createId("star"), sourceExperienceTitle: experience.title, createdAt: previous?.createdAt || now, updatedAt: now });
    upsert("starCases", record);
    if (!saveState(previous ? "STAR案例已更新。" : "STAR案例已保存。")) return;
    closeDialog(dialogs.star);
  }

  function openReviewDialog(id) {
    editingReviewId = id || "";
    const item = state.reviews.find((record) => record.id === id);
    forms.review.reset();
    byId("interview-review-title").textContent = item ? "编辑面试复盘" : "新增面试复盘";
    forms.review.elements.date.value = item?.date || todayString();
    if (item) fillForm(forms.review, item);
    openDialog(dialogs.review);
  }

  function saveReview(event) {
    event.preventDefault();
    const values = formValues(forms.review);
    const previous = state.reviews.find((item) => item.id === editingReviewId);
    const now = new Date().toISOString();
    const record = Object.assign({}, previous || {}, values, { id: previous?.id || createId("review"), createdAt: previous?.createdAt || now, updatedAt: now });
    upsert("reviews", record);
    if (!saveState(previous ? "面试复盘已更新。" : "面试复盘已保存。")) return;
    closeDialog(dialogs.review);
  }

  function deleteExperience(id) {
    const item = experienceById(id);
    if (!item || !window.confirm(`确定删除真实经历“${item.title}”吗？\n相关问题和项目将解除与本经历的关联，已经整理好的STAR案例会保留文字内容。`)) return;
    const nextState = Object.assign({}, state, {
      experiences: state.experiences.filter((record) => record.id !== id),
      projectCases: state.projectCases.map(project => {
        if (project.experienceId !== id) return project;
        const updated = Object.assign({}, project);
        delete updated.experienceId;
        return updated;
      }),
      questions: state.questions.map((question) => Object.assign({}, question, { experienceIds: (question.experienceIds || []).filter((experienceId) => experienceId !== id) })),
    });
    saveState("真实经历已删除，相关问题和项目已解除关联。 ", nextState);
  }

  function deleteProject(id) {
    const item = state.projectCases.find((record) => record.id === id);
    if (!item || !window.confirm(`确定删除视频项目“${item.projectName}”吗？\n相关面试问题会解除关联。`)) return;
    state.projectCases = state.projectCases.filter((record) => record.id !== id);
    state.questions = state.questions.map((question) => Object.assign({}, question, { projectCaseIds: (question.projectCaseIds || []).filter((projectId) => projectId !== id) }));
    saveState("视频剪辑项目案例已删除，相关问题已解除关联。 ");
  }

  function deleteQuestion(id) {
    const item = questionById(id);
    if (!item || !window.confirm(`确定删除问题“${item.question}”吗？\n已保存的AI优化结果也会一起删除。`)) return;
    state.questions = state.questions.filter((record) => record.id !== id);
    saveState("面试问题及其优化记录已删除。 ");
  }

  function deleteRecord(collection, id, question, message) {
    if (!window.confirm(question)) return;
    state[collection] = state[collection].filter((item) => item.id !== id);
    saveState(message);
  }

  function linkedExperiences(question) {
    return (question.experienceIds || []).map(experienceById).filter(Boolean);
  }

  function isConfirmedAnswerMaterial(item) {
    return Boolean(item && item.confirmedByUser === true && item.isSynthetic !== true && item.isDemo !== true);
  }

  function answerMaterials(question) {
    const experiences = linkedExperiences(question);
    const projects = linkedProjects(question);
    const excluded = experiences.concat(projects).filter(item => !isConfirmedAnswerMaterial(item));
    return {
      experiences: experiences.filter(isConfirmedAnswerMaterial),
      projects: projects.filter(isConfirmedAnswerMaterial),
      notice: excluded.length ? `已排除${excluded.length}条未确认、合成或演示的关联资料；资料仍保留在原记录中，未修改确认状态。` : "",
    };
  }

  function linkedProjects(question) {
    return (question.projectCaseIds || []).map((id) => state.projectCases.find((item) => item.id === id)).filter(Boolean);
  }

  function sopById(id) {
    return state.workSops.find((item) => item.id === id);
  }

  function workLessonById(id) {
    return state.workLessons.find((item) => item.id === id);
  }

  function workLessonMastery(item) {
    const count = Math.max(0, Number.parseInt(item?.practiceCount, 10) || 0);
    if (count >= 2) return "多次实践验证";
    if (count === 1 || item?.practiced) return "已实践一次";
    return "只是知道了";
  }

  function experienceById(id) {
    return state.experiences.find((item) => item.id === id);
  }

  function questionById(id) {
    return state.questions.find((item) => item.id === id);
  }

  function normalizeExperience(item) {
    const source = item && typeof item === "object" ? item : {};
    const roles = Array.isArray(source.targetRoles) ? source.targetRoles : [];
    let careerDirection = source.careerDirection || "通用";
    if (!source.careerDirection) {
      if (roles.some((role) => /老师|教师/.test(role)) || /教学|课堂|学生|家长/.test(source.category || "")) careerDirection = "教师方向";
      else if (roles.includes("视频剪辑")) careerDirection = "视频剪辑";
      else if (roles.includes("运营")) careerDirection = "运营";
      else if (roles.includes("销售")) careerDirection = "销售";
    }
    const inferredOtherRole = roles.find((role) => role === "小学其他学科老师" || role === "初中其他学科老师");
    return Object.assign({}, source, {
      targetRoles: roles,
      careerDirection,
      teacherType: source.teacherType || (roles.includes("英语老师") ? "英语老师" : inferredOtherRole ? "其他学科老师" : ""),
      schoolStage: source.schoolStage || (inferredOtherRole?.startsWith("小学") ? "小学" : inferredOtherRole?.startsWith("初中") ? "初中" : ""),
      subject: source.subject || (roles.includes("英语老师") ? "英语" : ""),
      materialPriority: ["primary", "backup"].includes(source.materialPriority) ? source.materialPriority : "",
      questionTypes: normalizeTextList(source.questionTypes),
      demonstrates: normalizeTextList(source.demonstrates),
      truthBoundaries: normalizeTextList(source.truthBoundaries),
      evidenceSources: normalizeTextList(source.evidenceSources),
      keywords: normalizeTextList(source.keywords),
    });
  }

  function normalizeTextList(value) {
    if (Array.isArray(value)) return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
    return parseLines(value);
  }

  function parseLines(value) {
    return Array.from(new Set(String(value || "").split(/[\n；;]+/).map((item) => item.trim()).filter(Boolean)));
  }

  function upsert(collection, record) {
    const index = state[collection].findIndex((item) => item.id === record.id);
    if (index >= 0) state[collection][index] = record;
    else state[collection].push(record);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function fillForm(form, values) {
    Object.entries(values || {}).forEach(([name, value]) => {
      const field = form.elements[name];
      if (field && typeof value !== "object") field.value = value ?? "";
    });
  }

  function formValues(form) {
    return Object.fromEntries(Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value).trim()]));
  }

  function checkedValues(form, name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
  }

  function parseTags(value) {
    return Array.from(new Set(String(value || "").split(/[、,，;；\n]/).map((tag) => tag.trim()).filter(Boolean)));
  }

  function shortText(value, length) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length)}…` : text || "未填写";
  }

  function showMessage(message, isError) {
    const target = byId("interview-message");
    window.clearTimeout(messageTimer);
    if (storageReadFailed) {
      target.textContent = storageReadMessage;
      target.dataset.type = "error";
      return;
    }
    target.textContent = message;
    target.dataset.type = isError ? "error" : "success";
    messageTimer = window.setTimeout(() => { target.textContent = ""; delete target.dataset.type; }, 4200);
  }

  function emptyHtml(title, text, buttonId) {
    return `<div class="interview-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p><button class="secondary-button" type="button" data-interview-empty-trigger="${escapeHtml(buttonId)}">开始添加</button></div>`;
  }

  function roleBadge(role) {
    return `<span>${escapeHtml(role)}</span>`;
  }

  function byUpdatedDesc(left, right) {
    return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
  }

  function createId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function todayString() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "时间未记录" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, "<br />");
  }
})();

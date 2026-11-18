(function (root) {
  "use strict";

  var PASS_CATEGORIES = ["hardGate", "quickPrep", "reframeWithEvidence", "idealRequirement", "askHr"];
  var VERDICTS = ["enough", "needsPatch", "risky"];
  var SIGNAL_CATEGORIES = ["motivation", "evidence", "coreAbility", "riskBoundary", "other"];
  var DEFAULT_MAIN_TARGET = 4;
  var MIN_MAIN_QUESTIONS = 3;
  var MAX_MAIN_QUESTIONS = 5;
  var MAX_FOLLOW_UPS = 2;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function list(value) {
    if (Array.isArray(value)) return value.map(text).filter(Boolean);
    return text(value) ? [text(value)] : [];
  }
  function id(prefix) { return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2); }

  function resumeSources(job, versions, recommended) {
    var sources = [];
    (Array.isArray(job.applicationResumeSnapshots) ? job.applicationResumeSnapshots : []).slice().sort(function (a, b) {
      return String(b.appliedAt || b.recordedAt || "").localeCompare(String(a.appliedAt || a.recordedAt || ""));
    }).forEach(function (item, index) {
      if (!text(item.content) || isSyntheticMaterial(item)) return;
      sources.push({ key: "snapshot:" + (item.id || index), kind: "applicationSnapshot", id: item.id || "", name: item.resumeName || "实际投递简历", version: item.resumeVersionNumber || "", content: item.content, appliedAt: item.appliedAt || "", preferred: index === 0 });
    });
    if (job.resumeDraft && text(job.resumeDraft.content) && !isSyntheticMaterial(job.resumeDraft)) {
      sources.push({ key: "draft:" + (job.resumeDraft.id || job.id), kind: "jobDraft", id: job.resumeDraft.id || "", name: job.resumeDraft.resumeName || "当前岗位简历", version: job.resumeDraft.resumeVersionNumber || "", content: job.resumeDraft.content, preferred: !sources.length });
    }
    if (!sources.length && recommended && text(recommended.content) && !isSyntheticMaterial(recommended)) {
      sources.push({ key: "master:" + recommended.id, kind: "directionMaster", id: recommended.id, name: recommended.name || "方向母版", version: recommended.versionNumber || "", content: recommended.content, preferred: true });
    }
    return sources;
  }

  function normalizePassItem(item) {
    item = item && typeof item === "object" ? item : {};
    var category = PASS_CATEGORIES.includes(item.category) ? item.category : "askHr";
    return { topic: text(item.topic), category: category, jdEvidence: text(item.jdEvidence), candidateEvidence: text(item.candidateEvidence), action: text(item.action), blocksInterview: item.blocksInterview === true && category === "hardGate" };
  }

  function inferSignalCategory(item) {
    var supplied = text(item.signalCategory || item.signal || item.coverageSignal);
    if (SIGNAL_CATEGORIES.includes(supplied)) return supplied;
    var source = [item.question, item.whyLikely, item.passStandard].map(text).join(" ");
    if (/为什么|动机|选择.*岗位|投递|加入.*公司|职业规划/.test(source)) return "motivation";
    if (/项目|经历|案例|实际做过|具体做过|成果|从需求|迭代/.test(source)) return "evidence";
    if (/短板|不足|没有.*经验|缺少|证书|专业不对口|边界|失败|困难|风险/.test(source)) return "riskBoundary";
    if (/岗位|职责|能力|技能|方法|流程|如何|怎么做/.test(source)) return "coreAbility";
    return "other";
  }

  function normalizeQuestion(item, index) {
    item = item && typeof item === "object" ? item : {};
    var evidenceOptions = list(item.evidenceOptions || item.experienceMaterial);
    return {
      id: text(item.id) || "q" + (index + 1),
      question: text(item.question),
      whyLikely: text(item.whyLikely || item.whyAsked),
      passStandard: text(item.passStandard || item.answerFocus),
      answerApproach: text(item.answerApproach || item.briefAnswerIdea) || (evidenceOptions.length ? "用“" + evidenceOptions[0] + "”简短说明自己的真实做法。" : "按过关标准简短回答；资料不足时如实说明。"),
      evidenceOptions: evidenceOptions,
      recommendedCaseIds: list(item.recommendedCaseIds || item.caseIds).slice(0, 3),
      followUps: list(item.followUps || item.highProbabilityFollowUps).slice(0, 3),
      referenceAnswer: text(item.referenceAnswer),
      signalCategory: inferSignalCategory(item),
      criticalHardGate: item.criticalHardGate === true,
    };
  }

  function questionSignature(item) {
    return text(item.question).toLowerCase().replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()【】\[\]-]/g, "");
  }

  function tooSimilar(left, right) {
    var a = questionSignature(left);
    var b = questionSignature(right);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    var shorter = a.length <= b.length ? a : b;
    var longer = a.length > b.length ? a : b;
    var common = 0;
    for (var i = 0; i < shorter.length - 1; i += 1) {
      if (longer.includes(shorter.slice(i, i + 2))) common += 1;
    }
    return shorter.length > 5 && common / Math.max(1, shorter.length - 1) >= 0.72;
  }

  function buildQuestionQueue(interviewPackage, preferredIds) {
    var pool = interviewPackage && Array.isArray(interviewPackage.topQuestions) ? interviewPackage.topQuestions : [];
    var chosen = [];
    function add(item) {
      if (!item || chosen.some(function (row) { return row.id === item.id; })) return;
      if (chosen.some(function (row) { return row.signalCategory === item.signalCategory && tooSimilar(row, item); })) return;
      chosen.push(item);
    }
    list(preferredIds).forEach(function (questionId) { add(pool.find(function (item) { return item.id === questionId; })); });
    ["motivation", "evidence", "coreAbility", "riskBoundary"].forEach(function (signal) {
      add(pool.find(function (item) { return item.signalCategory === signal; }));
    });
    pool.forEach(function (item) { if (chosen.length < DEFAULT_MAIN_TARGET) add(item); });
    if (chosen.length < DEFAULT_MAIN_TARGET) {
      pool.forEach(function (item) {
        if (chosen.length < DEFAULT_MAIN_TARGET && !chosen.some(function (row) { return row.id === item.id; })) chosen.push(item);
      });
    }
    var planned = chosen.slice(0, DEFAULT_MAIN_TARGET);
    var critical = pool.find(function (item) { return item.criticalHardGate === true && !planned.some(function (row) { return row.id === item.id; }); });
    if (critical) planned.push(critical);
    return planned.slice(0, MAX_MAIN_QUESTIONS).map(function (item) { return item.id; });
  }

  function isSyntheticMaterial(item) {
    return Boolean(item && (item.isSynthetic === true || item.isDemo === true));
  }

  function isConfirmedMaterial(item) {
    return Boolean(item && item.confirmedByUser === true && !isSyntheticMaterial(item));
  }

  function selectCases(job, cases, limit, questionText) {
    job = job || {};
    var direction = text(job.jobDirection);
    var context = [direction, job.position, job.jd, questionText].map(text).join(" ").toLowerCase();
    var question = text(questionText).toLowerCase();
    return (Array.isArray(cases) ? cases : []).filter(function (item) {
      if (!isConfirmedMaterial(item)) return false;
      var roles = list(item.targetRoles);
      return !roles.length || roles.includes("通用") || !direction || roles.includes(direction) || (direction === "AI相关" && item.materialKind === "confirmedClassicCase");
    }).map(function (item, index) {
      var score = 0;
      var roles = list(item.targetRoles);
      if (direction && roles.includes(direction)) score += 8;
      if (item.materialPriority === "primary") score += question ? 2 : 5;
      if (item.materialPriority === "backup") score += 1;
      list(item.keywords).forEach(function (keyword) {
        var key = keyword.toLowerCase();
        if (question && question.includes(key)) score += 12;
        else if (context.includes(key)) score += 2;
      });
      list(item.questionTypes).forEach(function (value) {
        var normalized = value.toLowerCase();
        if (question && (question.includes(normalized) || normalized.includes(question))) score += 10;
      });
      return { item: item, score: score, index: index };
    }).sort(function (left, right) {
      return right.score - left.score || left.index - right.index;
    }).slice(0, Math.max(1, Number(limit) || 3)).map(function (row) { return clone(row.item); });
  }

  function normalizeEvaluation(evaluation) {
    if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) throw new Error("评估结果需要是一个完整的JSON对象。");
    var rawVerdict = text(evaluation.verdict || evaluation.result || evaluation.status);
    var key = rawVerdict.replace(/[\s_-]+/g, "").toLowerCase();
    var verdict = "";
    if (["enough", "pass", "passed", "够用", "通过", "足够", "可以继续"].includes(key)) verdict = "enough";
    else if (["needspatch", "needimprovement", "需要补一下", "需要补充", "需补充", "需要改进", "补一下", "暂时不会"].includes(key)) verdict = "needsPatch";
    else if (["risky", "risk", "有明显漏洞", "存在明显漏洞", "明显漏洞", "高风险"].includes(key)) verdict = "risky";
    if (!verdict) throw new Error("没有识别出评估结论。请使用“够用 / 需要补一下 / 有明显漏洞”中的一种。当前收到：“" + (rawVerdict || "空") + "”。");
    var candidateSource = evaluation.reusableMaterialCandidate || evaluation.reusableExperienceCandidate || evaluation.newReusableMaterial;
    var existingSource = evaluation.existingCaseSuggestion || evaluation.recommendedExistingCase;
    var existingCaseSuggestion = null;
    if (existingSource && typeof existingSource === "object" && !Array.isArray(existingSource)) {
      var existingTitle = text(existingSource.title || existingSource.caseTitle);
      var existingId = text(existingSource.caseId || existingSource.id);
      if (existingTitle || existingId) existingCaseSuggestion = { caseId: existingId, title: existingTitle, reason: text(existingSource.reason || existingSource.hint) };
    }
    var candidate = null;
    if (candidateSource && typeof candidateSource === "object" && !Array.isArray(candidateSource) && !isSyntheticMaterial(candidateSource)) {
      var candidateSummary = text(candidateSource.summary || candidateSource.caseSummary || candidateSource.description);
      var candidateTitle = text(candidateSource.suggestedTitle || candidateSource.title);
      if (candidateSummary || candidateTitle) {
        candidate = {
          suggestedTitle: candidateTitle || candidateSummary.slice(0, 36),
          summary: candidateSummary,
          whyReusable: text(candidateSource.whyReusable || candidateSource.reason),
          situation: text(candidateSource.situation || candidateSource.background),
          task: text(candidateSource.task),
          action: text(candidateSource.action || candidateSource.actualAction),
          result: text(candidateSource.result || candidateSource.outcome),
          skills: list(candidateSource.skills || candidateSource.capabilities)
        };
      }
    }
    return {
      verdict: verdict,
      feedback: text(evaluation.feedback || evaluation.reason || evaluation.assessment),
      keyImprovement: text(evaluation.keyImprovement || evaluation.improvement || evaluation.mostImportantImprovement),
      likelyFollowUp: text(evaluation.likelyFollowUp || evaluation.followUp || evaluation.nextQuestion),
      followUpPassStandard: text(evaluation.followUpPassStandard || evaluation.followUpStandard),
      sentenceToRemove: text(evaluation.sentenceToRemove),
      factToAdd: text(evaluation.factToAdd),
      referenceAnswer: text(evaluation.referenceAnswer),
      coveredSignals: list(evaluation.coveredSignals || evaluation.demonstratedSignals).filter(function (item) { return SIGNAL_CATEGORIES.includes(item); }),
      existingCaseSuggestion: existingCaseSuggestion,
      reusableMaterialCandidate: candidate
    };
  }

  function normalizePackage(parsed, meta) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("准备结果不是完整的JSON对象。请粘贴按提示词生成的结果。");
    var questions = (parsed.topQuestions || parsed.likelyQuestions || []).map(normalizeQuestion).filter(function (item) { return item.question; }).slice(0, 8);
    if (questions.length < 4) throw new Error("后台候选问题池至少需要4道问题，当前识别到" + questions.length + "道。");
    var strategy = (parsed.passStrategy || parsed.howToPass || []).map(normalizePassItem).filter(function (item) { return item.topic; });
    if (!strategy.length) throw new Error("缺少“怎么过关”分析，请按五类要求重新生成。");
    var blockers = list(parsed.topBlockers || parsed.likelyBlockers).slice(0, 3);
    var dangers = list(parsed.dangerousQuestions || parsed.topDangerousQuestions).slice(0, 3);
    var hr = (parsed.questionsToAskEmployer || parsed.hrQuestions || []).map(function (item) { return typeof item === "string" ? item : text(item && item.question); }).filter(Boolean).slice(0, 3);
    return {
      id: meta.id || id("interview-package"), jobId: meta.jobId, version: meta.version,
      status: "ready", source: clone(meta.source), createdAt: meta.createdAt,
      passStrategy: strategy, topBlockers: blockers, topQuestions: questions,
      highProbabilityFollowUps: list(parsed.highProbabilityFollowUps), dangerousQuestions: dangers,
      selfIntroduction60s: text(parsed.selfIntroduction60s), whyThisRole: text(parsed.whyThisRole),
      weakPointAnswers: parsed.weakPointAnswers && typeof parsed.weakPointAnswers === "object" ? clone(parsed.weakPointAnswers) : {},
      questionsToAskEmployer: hr, quickKnowledge: list(parsed.quickKnowledge || parsed.knowledgeToPrepare).slice(0, 3),
      missingUsefulFacts: list(parsed.missingUsefulFacts), truthCheck: list(parsed.truthCheck), raw: clone(parsed)
    };
  }

  function createSession(jobId, packageId, now, interviewPackage) {
    return {
      id: id("interview-session"), jobId: jobId, packageId: packageId, status: "active", currentIndex: 0,
      questionQueue: buildQuestionQueue(interviewPackage, []), plannedMainTarget: DEFAULT_MAIN_TARGET,
      minMainQuestions: MIN_MAIN_QUESTIONS, maxMainQuestions: MAX_MAIN_QUESTIONS, maxFollowUps: MAX_FOLLOW_UPS,
      coveredSignals: [], unresolvedWeaknesses: [], pendingFollowUp: null, currentHelp: null,
      referencePendingAdvance: null, consecutiveEnough: 0, completionReason: "", turns: [], createdAt: now, updatedAt: now
    };
  }

  function uniqueMainQuestionIds(session) {
    var seen = [];
    (session.turns || []).forEach(function (turn) {
      if (!turn.parentQuestionId && turn.questionId && !seen.includes(turn.questionId)) seen.push(turn.questionId);
    });
    return seen;
  }

  function sessionMetrics(session, interviewPackage) {
    var mainIds = uniqueMainQuestionIds(session || {});
    var followUpCount = (session && session.turns || []).filter(function (turn) { return Boolean(turn.parentQuestionId); }).length;
    var covered = list(session && session.coveredSignals).filter(function (item) { return SIGNAL_CATEGORIES.includes(item); });
    (session && session.turns || []).forEach(function (turn) {
      list(turn.coveredSignals).forEach(function (signal) { if (SIGNAL_CATEGORIES.includes(signal) && !covered.includes(signal)) covered.push(signal); });
      if (!turn.parentQuestionId) {
        var question = (interviewPackage && interviewPackage.topQuestions || []).find(function (item) { return item.id === turn.questionId; });
        if (question && !covered.includes(question.signalCategory)) covered.push(question.signalCategory);
      }
    });
    return { mainAnsweredCount: mainIds.length, followUpCount: followUpCount, coveredSignals: covered };
  }

  function shouldComplete(session, interviewPackage) {
    var metrics = sessionMetrics(session, interviewPackage);
    var mainIds = uniqueMainQuestionIds(session);
    var target = Number(session.plannedMainTarget || DEFAULT_MAIN_TARGET);
    var max = Number(session.maxMainQuestions || MAX_MAIN_QUESTIONS);
    var uncoveredCritical = (interviewPackage && interviewPackage.topQuestions || []).some(function (item) { return item.criticalHardGate === true && !mainIds.includes(item.id); });
    if (!uncoveredCritical && metrics.mainAnsweredCount >= MIN_MAIN_QUESTIONS && Number(session.consecutiveEnough || 0) >= 3 && metrics.coveredSignals.length >= 3) return "readyEarly";
    if (metrics.mainAnsweredCount >= max) return "maxBudgetReached";
    if (metrics.mainAnsweredCount >= target && !uncoveredCritical) return "timeBudgetReached";
    return "";
  }

  function reconcileSession(session, interviewPackage, now) {
    if (!session) return session;
    var next = clone(session);
    var answered = uniqueMainQuestionIds(next);
    var legacyCurrent = interviewPackage && interviewPackage.topQuestions && interviewPackage.topQuestions[next.currentIndex];
    var preferred = answered.slice();
    if (legacyCurrent && !preferred.includes(legacyCurrent.id)) preferred.push(legacyCurrent.id);
    if (!Array.isArray(next.questionQueue) || !next.questionQueue.length) next.questionQueue = buildQuestionQueue(interviewPackage, preferred);
    next.plannedMainTarget = Number(next.plannedMainTarget || DEFAULT_MAIN_TARGET);
    next.minMainQuestions = Number(next.minMainQuestions || MIN_MAIN_QUESTIONS);
    next.maxMainQuestions = Number(next.maxMainQuestions || MAX_MAIN_QUESTIONS);
    next.maxFollowUps = Number(next.maxFollowUps || MAX_FOLLOW_UPS);
    next.coveredSignals = sessionMetrics(next, interviewPackage).coveredSignals;
    next.unresolvedWeaknesses = Array.isArray(next.unresolvedWeaknesses) ? next.unresolvedWeaknesses : [];
    if (!next.pendingFollowUp && !next.referencePendingAdvance) {
      var firstUnanswered = next.questionQueue.findIndex(function (questionId) { return !answered.includes(questionId); });
      next.currentIndex = firstUnanswered < 0 ? next.questionQueue.length : firstUnanswered;
      var reason = shouldComplete(next, interviewPackage);
      if (next.status === "active" && reason) {
        next.status = "completed";
        next.completionReason = reason;
      }
    }
    next.updatedAt = now || next.updatedAt;
    return next;
  }

  function currentQuestion(session, interviewPackage) {
    if (!session || !interviewPackage || session.status === "completed") return null;
    if (session.pendingFollowUp) return clone(session.pendingFollowUp);
    var queue = Array.isArray(session.questionQueue) && session.questionQueue.length ? session.questionQueue : buildQuestionQueue(interviewPackage, uniqueMainQuestionIds(session));
    var answered = uniqueMainQuestionIds(session);
    var covered = sessionMetrics(session, interviewPackage).coveredSignals;
    var remaining = queue.map(function (questionId, position) {
      return { item: interviewPackage.topQuestions.find(function (question) { return question.id === questionId; }), position: position };
    }).filter(function (row) { return row.item && row.position >= Number(session.currentIndex || 0) && !answered.includes(row.item.id); });
    var selected = remaining.find(function (row) { return !covered.includes(row.item.signalCategory); }) || remaining[0];
    return selected ? Object.assign({ isFollowUp: false, parentQuestionId: "", queuePosition: selected.position }, clone(selected.item)) : null;
  }

  function revealHint(session, interviewPackage, now) {
    var next = clone(session);
    var question = currentQuestion(next, interviewPackage);
    if (!question) throw new Error("当前没有需要回答的问题。");
    if (!next.currentHelp || next.currentHelp.questionId !== question.id) next.currentHelp = { questionId: question.id, level: "hint", hintShownAt: now, referenceShownAt: "" };
    next.updatedAt = now;
    return next;
  }

  function revealReference(session, interviewPackage, now) {
    var next = clone(session);
    var question = currentQuestion(next, interviewPackage);
    if (!question) throw new Error("当前没有需要回答的问题。");
    if (!next.currentHelp || next.currentHelp.questionId !== question.id || next.currentHelp.level !== "hint") throw new Error("请先点击“不会”查看简短提示。");
    next.currentHelp.level = "reference";
    next.currentHelp.referenceShownAt = now;
    next.referencePendingAdvance = { isFollowUp: question.isFollowUp === true };
    next.updatedAt = now;
    return next;
  }

  function advanceAfterReference(session, interviewPackage, now) {
    var next = clone(session);
    if (!next.referencePendingAdvance) throw new Error("当前没有待确认的参考答案。");
    var question = currentQuestion(next, interviewPackage);
    if (!next.currentHelp && question) next.currentHelp = { questionId: question.id, level: "reference", hintShownAt: "", referenceShownAt: now };
    next.referencePendingAdvance = null;
    next.consecutiveEnough = 0;
    next.updatedAt = now;
    return next;
  }

  function applyEvaluation(session, interviewPackage, userAnswer, evaluation, now) {
    var next = reconcileSession(session, interviewPackage, now);
    if (next.referencePendingAdvance) throw new Error("参考答案已经显示，请先点击“看完，重新回答这一题”。");
    var question = currentQuestion(next, interviewPackage);
    if (!question) throw new Error("当前没有需要评估的问题。");
    if (!text(userAnswer)) throw new Error("请先回答；如果不会，请先点击“不会”查看简短提示。");
    evaluation = normalizeEvaluation(evaluation);
    var followUp = text(evaluation.likelyFollowUp);
    var helpLevel = next.currentHelp && next.currentHelp.questionId === question.id ? next.currentHelp.level : "none";
    var coveredSignals = [question.signalCategory].concat(evaluation.coveredSignals || []).filter(function (signal, index, values) { return SIGNAL_CATEGORIES.includes(signal) && values.indexOf(signal) === index; });
    next.turns.push({
      id: id("interview-turn"), questionId: question.id, parentQuestionId: question.parentQuestionId || "", question: question.question,
      userAnswer: text(userAnswer), verdict: evaluation.verdict, feedback: text(evaluation.feedback), keyImprovement: text(evaluation.keyImprovement),
      likelyFollowUp: followUp, sentenceToRemove: text(evaluation.sentenceToRemove), factToAdd: text(evaluation.factToAdd), assistanceLevel: helpLevel, hintShown: helpLevel === "hint" || helpLevel === "reference", referenceShown: helpLevel === "reference",
      existingCaseSuggestion: evaluation.existingCaseSuggestion ? clone(evaluation.existingCaseSuggestion) : null,
      coveredSignals: coveredSignals,
      reusableMaterialCandidate: evaluation.reusableMaterialCandidate ? clone(evaluation.reusableMaterialCandidate) : null,
      materialDecision: evaluation.reusableMaterialCandidate ? "pending" : "", savedExperienceId: "", createdAt: now
    });
    coveredSignals.forEach(function (signal) { if (!next.coveredSignals.includes(signal)) next.coveredSignals.push(signal); });
    next.currentHelp = null;
    if (evaluation.verdict !== "enough") {
      next.consecutiveEnough = 0;
      var metrics = sessionMetrics(next, interviewPackage);
      if (question.isFollowUp || metrics.followUpCount >= next.maxFollowUps) {
        next.pendingFollowUp = null;
        next.unresolvedWeaknesses.push(text(evaluation.keyImprovement || evaluation.feedback || question.question));
        next.currentIndex = Number(question.queuePosition == null ? next.currentIndex : question.queuePosition + 1);
      } else {
        next.pendingFollowUp = {
          id: question.id + "-followup-" + next.turns.length,
          question: followUp || "请重新回答：" + question.question,
          whyLikely: followUp ? "根据上一轮回答继续追问" : "只重练刚才暴露的关键问题",
          passStandard: text(evaluation.followUpPassStandard) || question.passStandard,
          answerApproach: question.answerApproach,
          signalCategory: question.signalCategory,
          queuePosition: question.queuePosition,
          evidenceOptions: [], followUps: [],
          referenceAnswer: text(evaluation.referenceAnswer) || question.referenceAnswer,
          isFollowUp: true, parentQuestionId: question.parentQuestionId || question.id
        };
      }
    } else {
      next.consecutiveEnough = Number(next.consecutiveEnough || 0) + 1;
      next.pendingFollowUp = null;
      next.currentIndex = Number(question.queuePosition == null ? next.currentIndex + 1 : question.queuePosition + 1);
    }
    var completionReason = !next.pendingFollowUp ? shouldComplete(next, interviewPackage) : "";
    if (completionReason) {
      next.status = "completed";
      next.completionReason = completionReason;
    } else if (!next.pendingFollowUp && !currentQuestion(next, interviewPackage)) {
      next.status = "completed";
      next.completionReason = "questionPoolExhausted";
    }
    next.updatedAt = now;
    return next;
  }

  function completionSummary(session, interviewPackage) {
    var turns = session && Array.isArray(session.turns) ? session.turns : [];
    var enough = turns.slice().reverse().find(function (item) { return item.verdict === "enough"; });
    var weakness = (session && session.unresolvedWeaknesses || []).slice(-1)[0] || "";
    if (!weakness) {
      var weakTurn = turns.slice().reverse().find(function (item) { return item.verdict !== "enough"; });
      weakness = weakTurn ? text(weakTurn.keyImprovement || weakTurn.feedback) : "";
    }
    return {
      ready: !weakness,
      readinessText: weakness ? "还需要补一个关键点" : "是",
      strongestAdvantage: enough ? text(enough.feedback) : "已经用真实经历完成了本轮核心回答。",
      keyReminder: weakness || (enough ? text(enough.keyImprovement) : "只说真实做过的事情。") || "只说真实做过的事情。",
      hrQuestion: (interviewPackage && interviewPackage.questionsToAskEmployer || [])[0] || ""
    };
  }

  function debrief(jobId, values, now) {
    values = values || {};
    if (!text(values.date)) throw new Error("请填写正式面试日期。");
    if (!text(values.actualQuestions)) throw new Error("请至少记录一个面试官实际问过的问题。");
    return {
      id: id("interview-debrief"), jobId: jobId, date: text(values.date), round: text(values.round), result: text(values.result) || "等待结果",
      actualQuestions: text(values.actualQuestions), actualAnswers: text(values.actualAnswers), stuckPoints: text(values.stuckPoints), followUps: text(values.followUps),
      jdDifferences: text(values.jdDifferences), salaryInfo: text(values.salaryInfo), workHoursInfo: text(values.workHoursInfo), restInfo: text(values.restInfo),
      probationInfo: text(values.probationInfo), trainingInfo: text(values.trainingInfo), nextImprovement: text(values.nextImprovement), createdAt: now, updatedAt: now
    };
  }

  function similarDebriefs(job, allJobs, byJob) {
    var direction = text(job.jobDirection);
    var tokens = text(job.position).toLowerCase().split(/[\s/·、，,（）()_-]+/).filter(function (token) { return token.length > 1; });
    var rows = [];
    Object.keys(byJob || {}).forEach(function (jobId) {
      if (jobId === job.id) return;
      var other = (allJobs || []).find(function (item) { return item.id === jobId; }) || {};
      var sameDirection = direction && text(other.jobDirection) === direction;
      var title = text(other.position).toLowerCase();
      var sameTitle = tokens.some(function (token) { return title.includes(token); });
      if (!sameDirection && !sameTitle) return;
      (Array.isArray(byJob[jobId]) ? byJob[jobId] : []).forEach(function (item) { rows.push(Object.assign({ sourceCompany: other.company || "公司待确认", sourcePosition: other.position || "岗位待确认" }, clone(item))); });
    });
    return rows.sort(function (a, b) { return String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")); }).slice(0, 3);
  }

  root.jobInterviewCore = { PASS_CATEGORIES: PASS_CATEGORIES.slice(), SIGNAL_CATEGORIES: SIGNAL_CATEGORIES.slice(), resumeSources: resumeSources, normalizePackage: normalizePackage, normalizeEvaluation: normalizeEvaluation, selectCases: selectCases, buildQuestionQueue: buildQuestionQueue, createSession: createSession, reconcileSession: reconcileSession, sessionMetrics: sessionMetrics, currentQuestion: currentQuestion, revealHint: revealHint, revealReference: revealReference, advanceAfterReference: advanceAfterReference, applyEvaluation: applyEvaluation, completionSummary: completionSummary, debrief: debrief, similarDebriefs: similarDebriefs };
  root.jobInterviewCore.isSyntheticMaterial = isSyntheticMaterial;
  root.jobInterviewCore.isConfirmedMaterial = isConfirmedMaterial;
  if (typeof module !== "undefined" && module.exports) module.exports = root.jobInterviewCore;
})(typeof window === "undefined" ? globalThis : window);

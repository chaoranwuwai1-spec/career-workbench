(function (global) {
  "use strict";

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  // “未提供/待确认”是识别状态，不是公司实体。它们既不能成为分组证据，
  // 也不能因为文本相同就把两个未知公司的岗位合并。
  function isUnknownCompanyValue(value) {
    var text = cleanText(value);
    return !text || /^(?:未知|未提供|未说明|未识别|公司待确认|待确认|请确认|识别不确定|不确定)$/.test(text);
  }

  function cleanOcrText(value) {
    return String(value == null ? "" : value)
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map(function (line) {
        var normalized = cleanText(line);
        // 中文OCR常把一个完整词拆成“工 作 地 点”。只移除相邻中日韩字符之间的空格，
        // 英文单词之间、数字与单位之间仍然保留，避免破坏薪资和英文JD。
        normalized = normalized.replace(/([\u3400-\u9fff\uf900-\ufaff])\s+(?=[\u3400-\u9fff\uf900-\ufaff])/g, "$1");
        normalized = normalized.replace(/([\u3400-\u9fff\uf900-\ufaff])\s+([：:，。；、])/g, "$1$2");
        normalized = normalized.replace(/([：:，。；、])\s+([\u3400-\u9fff\uf900-\ufaff])/g, "$1$2");
        return normalized;
      })
      .filter(Boolean)
      .join("\n");
  }

  function comparableLine(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\s·•丨|｜，。；：、,.!！?？()（）【】\[\]{}<>《》“”‘’'"`~_—–-]/g, "");
  }

  function lineBigrams(value) {
    var text = comparableLine(value);
    if (text.length < 2) return text ? [text] : [];
    var output = [];
    for (var index = 0; index < text.length - 1; index += 1) {
      output.push(text.slice(index, index + 2));
    }
    return output;
  }

  function lineSimilarity(left, right) {
    var leftText = comparableLine(left);
    var rightText = comparableLine(right);
    if (!leftText || !rightText) return 0;
    if (leftText === rightText) return 1;
    var leftPairs = lineBigrams(leftText);
    var rightPairs = lineBigrams(rightText);
    if (!leftPairs.length || !rightPairs.length) return 0;
    var remaining = rightPairs.slice();
    var matches = 0;
    leftPairs.forEach(function (pair) {
      var matchIndex = remaining.indexOf(pair);
      if (matchIndex >= 0) {
        matches += 1;
        remaining.splice(matchIndex, 1);
      }
    });
    return (2 * matches) / (leftPairs.length + rightPairs.length);
  }

  function linesMatch(left, right) {
    var normalized = comparableLine(left);
    if (!normalized) return false;
    if (normalized.length <= 7) return normalized === comparableLine(right);
    return lineSimilarity(left, right) >= 0.9;
  }

  function overlapSize(existingLines, incomingLines) {
    var maxSize = Math.min(16, existingLines.length, incomingLines.length);
    for (var size = maxSize; size >= 1; size -= 1) {
      var matches = true;
      for (var offset = 0; offset < size; offset += 1) {
        if (!linesMatch(existingLines[existingLines.length - size + offset], incomingLines[offset])) {
          matches = false;
          break;
        }
      }
      if (matches) return size;
    }
    return 0;
  }

  function isRepeatedLine(existingLines, line) {
    var normalized = comparableLine(line);
    if (!normalized) return true;
    return existingLines.some(function (existing) {
      var existingNormalized = comparableLine(existing);
      if (existingNormalized === normalized) return true;
      return normalized.length >= 12 && existingNormalized.length >= 12 && lineSimilarity(existing, line) >= 0.96;
    });
  }

  function mergeOcrTexts(items) {
    var merged = [];
    (Array.isArray(items) ? items : []).forEach(function (item) {
      var text = typeof item === "string" ? item : item && item.text;
      var incoming = cleanOcrText(text).split("\n").filter(Boolean);
      if (!incoming.length) return;
      var overlap = overlapSize(merged, incoming);
      incoming.slice(overlap).forEach(function (line) {
        if (!isRepeatedLine(merged, line)) merged.push(line);
      });
    });
    return merged.join("\n");
  }

  function linesFrom(raw) {
    return cleanOcrText(raw).split("\n").filter(Boolean);
  }

  function firstLineMatching(lines, expression) {
    for (var index = 0; index < lines.length; index += 1) {
      expression.lastIndex = 0;
      if (expression.test(lines[index])) return lines[index];
    }
    return "";
  }

  function trimSalaryFromTitle(line) {
    return cleanText(line)
      .replace(/\s*[（(]?\s*\[[^\n]*$/, "")
      .replace(/^[《<>”"'“\s]+/, "")
      .replace(/\s*[.…]{1,}.*$/, "")
      .replace(/^20\d{2}\s*(?:校园)?招聘\s*/, "")
      .replace(/[¥￥$£€]?\s*\d+(?:\.\d+)?\s*(?:-|–|—|~|至)\s*\d+(?:\.\d+)?\s*(?:k|K|万|千|元)(?:\s*\/\s*(?:月|年|天|小时|时))?(?:\s*·\s*\d+薪)?/g, "")
      .replace(/\d+(?:\.\d+)?\s*(?:k|K|万|千|元)以上/g, "")
      .trim();
  }

  function findCompanyCandidate(raw) {
    var lines = linesFrom(raw);
    var labeledCompany = lines.map(function (line) {
      var match = line.match(/^(?:公司名称|单位名称|招聘单位|宣讲单位|用人单位)\s*[：:]\s*(.+)$/);
      return match ? cleanText(match[1]) : "";
    }).filter(Boolean);
    lines.forEach(function (line, index) {
      if (/^(?:公司基本信息|单位基本信息|公司名称|单位名称)\s*[：:]?$/.test(line) && lines[index + 1]) labeledCompany.push(lines[index + 1]);
    });
    lines = labeledCompany.concat(lines);
    var companyPattern = /(?:有限公司|有限责任公司|股份(?:有限公司|公司)?|集团(?:公司)?|学校|学院|培训中心|工作室|事务所)$/;
    for (var index = 0; index < lines.length; index += 1) {
      var line = cleanText(lines[index]).replace(/^(?:公司(?:名称)?|招聘方|宣讲单位|招聘单位|用人单位|单位名称)\s*[：:]\s*/, "");
      var candidates = [line, cleanText(line.split(/[·丨|｜]/)[0])];
      var introduction = line.match(/^([\u3400-\u9fffA-Za-z（）()]{3,50}(?:有限公司|股份公司|有限责任公司))(?:成立于|招聘简章)/);
      if (introduction) candidates.unshift(introduction[1]);
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var candidate = candidates[candidateIndex];
        if (candidate.length >= 3 && candidate.length <= 60 && !/[，。；：:!?！？�]/.test(candidate)
          && !/^(?:我们|本公司|欢迎|加入|关于|为|与|负责)/.test(candidate) && companyPattern.test(candidate)) return candidate;
      }
    }
    return "";
  }

  function findPositionCandidate(raw) {
    var lines = linesFrom(raw).slice(0, 28);
    var positionPattern = /(?:教师|老师|讲师|助教|销售|业务员|业务助理|国际业务|外贸|运营|剪辑|编导|编辑|客服|行政|人事|财务|会计|工程师|设计师|产品经理|项目经理|顾问|翻译|主播|实习生|专员|主管|经理|经纪人|shipbroker|总监|(?:[\u3400-\u9fffA-Za-z0-9·（）()&+\-/]{2,32})(?:岗位|岗)|developer|engineer|teacher|sales|marketing|editor|designer|assistant)/i;
    var noisePattern = /^(?:职位描述|岗位职责|职位详情|任职要求|岗位要求|岗位类别|职位类别|职能类别|公司介绍|福利待遇|招聘信息|搜索|消息|我的|立即沟通|感兴趣|收藏|负责|要求|熟悉|具有|具备|能够|我们)/;
    var salaryLines = lines.filter(function (line) { return /\d+(?:\.\d+)?\s*(?:-|–|—|~|至)\s*\d+(?:\.\d+)?\s*(?:k|K|万|千|元)/.test(line); });
    var orderedLines = salaryLines.concat(lines.filter(function (line) { return salaryLines.indexOf(line) < 0; }));
    for (var index = 0; index < orderedLines.length; index += 1) {
      if (/^(?:岗位类别|职位类别|职能类别)\s*[：:]/.test(orderedLines[index])) continue;
      var line = trimSalaryFromTitle(orderedLines[index]).replace(/^(?:招聘岗位|应聘岗位|岗位名称|职位名称|招聘职位|岗位|职位)\s*[：:]?\s*/, "");
      if (/公司|集团/.test(line) && /[，,]/.test(line)) line = cleanText(line.split(/[，,]/).pop());
      line = line.replace(/((?:专员|业务员|销售|主管|经理|经纪人|教师|老师))\s+[a-zA-Z]{1,3}\s+[\u3400-\u9fff\s]+$/, "$1");
      if (line.length < 2 || line.length > 48 || noisePattern.test(line) || /[�。；!?！？]|信息技术.*人事|有限公司|股份公司/.test(line)) continue;
      if (/^(?:经理|主管|专员|招聘|业务)$/.test(line)) continue;
      if (positionPattern.test(line)) return line;
    }
    return "";
  }

  function findSalaryCandidate(raw) {
    var flexible = cleanOcrText(raw).match(/\d+(?:\.\d+)?\s*[kK万千]?\s*[-–—~至]\s*\d+(?:\.\d+)?\s*(?:[kK万千]|元)(?:\s*\/\s*(?:月|年|天|小时))?|\d+(?:\.\d+)?\s*(?:万元|万|元|[kK])\s*\/\s*(?:年|月|天|小时)/);
    if (flexible) return cleanText(flexible[0]);
    var match = cleanOcrText(raw).match(/[¥￥$£€]?\s*\d+(?:\.\d+)?\s*(?:-|–|—|~|至)\s*\d+(?:\.\d+)?\s*(?:k|K|万|千|元)(?:\s*\/\s*(?:月|年|天|小时|时))?(?:\s*·\s*\d+薪)?/);
    if (match) return cleanText(match[0]);
    var line = firstLineMatching(linesFrom(raw), /薪资|工资|待遇|面议|salary|pay/i);
    return line && /\d|面议/.test(line) ? cleanText(line.replace(/^.*?[：:]/, "")) : "";
  }

  function findCityCandidate(raw) {
    var labeled = cleanOcrText(raw).match(/(?:工作地点|工作城市|上班地址|工作地址|职位地点)\s*[：:；;]?\s*([^\n]{2,50})/i);
    if (labeled) return cleanText(labeled[1]);
    var cityPattern = /(北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|长沙|郑州|青岛|济南|厦门|福州|合肥|宁波|无锡|佛山|东莞|珠海|昆明|南宁|贵阳|海口|沈阳|大连|长春|哈尔滨|石家庄|太原|南昌|兰州|西宁|银川|呼和浩特|乌鲁木齐)(?:市)?(?:[·\s][^\n]{1,16})?/;
    var topText = linesFrom(raw).slice(0, 45).filter(function (line) {
      return !/公司|集团|宣讲单位|招聘单位|学校|学院|校园招聘|\[|\]/.test(line);
    }).join("\n");
    var regional = topText.match(/(潍坊|聊城|泰安|烟台|临沂)(?:市)?/);
    if (regional) return regional[0];
    var match = topText.match(cityPattern);
    return match ? cleanText(match[0]) : "";
  }

  function extractOcrHints(raw) {
    return {
      company: findCompanyCandidate(raw),
      position: findPositionCandidate(raw),
      salary: findSalaryCandidate(raw),
      city: findCityCandidate(raw),
    };
  }

  function valuesConflict(values) {
    var nonEmpty = values.filter(Boolean);
    if (nonEmpty.length < 2) return false;
    var reference = nonEmpty[0];
    return nonEmpty.slice(1).some(function (value) {
      var left = comparableLine(reference);
      var right = comparableLine(value);
      if (!left || !right) return false;
      if (left === right) return false;
      return lineSimilarity(reference, value) < 0.9;
    });
  }

  // 这里只检查各截图中明确识别出的公司/岗位是否互相冲突。
  // 后续截图没有重复显示公司或岗位很常见，不能因此判定为不同岗位。
  function assessSameJob(items) {
    var perImage = (Array.isArray(items) ? items : []).map(function (item, index) {
      var hints = extractOcrHints(item && item.text ? item.text : "");
      return {
        name: item && item.name ? item.name : "截图" + (index + 1),
        company: isUnknownCompanyValue(hints.company) ? "" : hints.company,
        position: hints.position,
      };
    });
    var conflictFields = [];
    if (valuesConflict(perImage.map(function (item) { return item.company; }))) conflictFields.push("公司名称");
    if (valuesConflict(perImage.map(function (item) { return item.position; }))) conflictFields.push("岗位名称");
    var hasIdentity = perImage.some(function (item) { return item.company || item.position; });
    return {
      status: conflictFields.length ? "conflict" : (hasIdentity ? "compatible" : "uncertain"),
      conflictFields: conflictFields,
      perImage: perImage,
    };
  }

  function identityMatches(left, right) {
    if (!left || !right) return false;
    var leftValue = comparableLine(left);
    var rightValue = comparableLine(right);
    if (!leftValue || !rightValue) return false;
    return leftValue === rightValue || lineSimilarity(left, right) >= 0.9;
  }

  function identitiesConflict(left, right) {
    if (!left || !right) return false;
    return !identityMatches(left, right);
  }

  function looksLikeContinuation(raw) {
    var lines = linesFrom(raw);
    if (!lines.length) return false;
    var first = lines[0];
    return /^(?:\d+[.、）)]|[（(]?\d+[）)]|[一二三四五六七八九十]+[、.]|任职要求|任职资格|岗位要求|工作职责|岗位职责|职位描述|岗位介绍|福利待遇|职位福利|工作时间|工作地点|薪资福利|加分项)/.test(first);
  }

  function looksLikeJobDetailPage(raw) {
    var text = cleanOcrText(raw);
    return /(?:任职要求|任职资格|岗位要求|工作职责|岗位职责|职位描述|岗位介绍|福利待遇|职位福利|工作时间|休息制度|技能要求|学历要求|经验要求|工作内容)/.test(text)
      || linesFrom(text).filter(function (line) { return /^(?:\d+[.、）)]|[（(]?\d+[）)])/.test(line); }).length >= 2;
  }

  function distinctiveLines(raw) {
    var noise = /^(?:职位描述|岗位职责|任职要求|岗位要求|福利待遇|职位福利|公司介绍|立即沟通|感兴趣|收藏|分享|举报|查看更多)$/;
    return linesFrom(raw).filter(function (line) {
      var comparable = comparableLine(line);
      return comparable.length >= 8 && !noise.test(cleanText(line));
    });
  }

  function sharedDistinctiveLineCount(left, right) {
    var leftLines = distinctiveLines(left);
    var rightLines = distinctiveLines(right);
    var used = {};
    var count = 0;
    leftLines.forEach(function (leftLine) {
      for (var index = 0; index < rightLines.length; index += 1) {
        if (used[index]) continue;
        if (linesMatch(leftLine, rightLines[index]) || lineSimilarity(leftLine, rightLines[index]) >= 0.84) {
          used[index] = true;
          count += 1;
          break;
        }
      }
    });
    return count;
  }

  function contentBigrams(raw) {
    var text = comparableLine(raw)
      .replace(/职位描述|岗位职责|任职要求|岗位要求|福利待遇|立即沟通|感兴趣|收藏|分享/g, "");
    var pairs = {};
    for (var index = 0; index < text.length - 1; index += 1) pairs[text.slice(index, index + 2)] = true;
    return pairs;
  }

  function contentSimilarity(left, right) {
    var leftPairs = contentBigrams(left);
    var rightPairs = contentBigrams(right);
    var leftKeys = Object.keys(leftPairs);
    var rightKeys = Object.keys(rightPairs);
    if (!leftKeys.length || !rightKeys.length) return 0;
    var intersection = leftKeys.filter(function (key) { return rightPairs[key]; }).length;
    var union = leftKeys.length + rightKeys.length - intersection;
    return union ? intersection / union : 0;
  }

  function groupIdentity(group) {
    var company = "";
    var position = "";
    var salary = "";
    var city = "";
    (group.items || []).forEach(function (item) {
      if (!company && item.hints.company && !isUnknownCompanyValue(item.hints.company)) company = item.hints.company;
      if (!position && item.hints.position) position = item.hints.position;
      if (!salary && item.hints.salary) salary = item.hints.salary;
      if (!city && item.hints.city) city = item.hints.city;
    });
    return { company: company, position: position, salary: salary, city: city };
  }

  function groupCandidateScore(group, item, isPrevious) {
    var identity = groupIdentity(group);
    var company = isUnknownCompanyValue(item.hints.company) ? "" : item.hints.company;
    var position = item.hints.position;
    if (identitiesConflict(identity.company, company) || identitiesConflict(identity.position, position)) {
      return -100;
    }
    var score = 0;
    // 公司相同也可能同时招聘多个岗位；只有公司和岗位共同一致，或存在续页证据时才自动归组。
    if (identityMatches(identity.company, company)) score += 5;
    // 只出现相同的通用岗位名（如“外贸业务员”）不足以证明是同一岗位；
    // 还需要公司一致、文字重叠或明显的续页结构，避免同方向岗位被误合并。
    if (identityMatches(identity.position, position)) score += 4;
    if (identityMatches(identity.salary, item.hints.salary)) score += 2;
    if (identityMatches(identity.city, item.hints.city)) score += 1;
    if (!company && !position && (identity.company || identity.position)) score += 1;
    var strongestSharedLines = 0;
    var strongestContentSimilarity = 0;
    (group.items || []).forEach(function (existingItem) {
      strongestSharedLines = Math.max(strongestSharedLines, sharedDistinctiveLineCount(existingItem.text, item.text));
      strongestContentSimilarity = Math.max(strongestContentSimilarity, contentSimilarity(existingItem.text, item.text));
    });
    if (strongestSharedLines >= 2) score += 7;
    else if (strongestSharedLines === 1) score += 5;
    else if (strongestContentSimilarity >= 0.48) score += 4;
    else if (strongestContentSimilarity >= 0.3) score += 2;
    if (isPrevious && group.items.length) {
      var previousText = group.items[group.items.length - 1].text;
      var existingLines = linesFrom(previousText);
      var incomingLines = linesFrom(item.text);
      if (overlapSize(existingLines, incomingLines) > 0) score += 6;
      else if (looksLikeContinuation(item.text)) score += 3;
    }
    return score;
  }

  // 一次导入可以属于同一求职方向下的多个岗位。这里保留逐图OCR结果，
  // 只生成“建议分组”；没有足够证据的截图保持独立并交给用户确认。
  function groupOcrResults(items) {
    var prepared = (Array.isArray(items) ? items : []).map(function (item, index) {
      var text = cleanOcrText(item && item.text ? item.text : "");
      return {
        id: item && item.id ? item.id : "screenshot-" + (index + 1),
        index: index,
        name: item && item.name ? item.name : "截图" + (index + 1),
        text: text,
        confidence: Number(item && item.confidence) || 0,
        error: cleanText(item && item.error),
        hints: extractOcrHints(text),
      };
    });
    var groups = [];
    prepared.forEach(function (item) {
      var bestGroup = null;
      var bestScore = -100;
      groups.forEach(function (group, groupIndex) {
        var score = groupCandidateScore(group, item, groupIndex === groups.length - 1);
        if (score > bestScore) {
          bestScore = score;
          bestGroup = group;
        }
      });
      var hasIdentity = Boolean(item.hints.company || item.hints.position);
      var previousGroup = groups.length ? groups[groups.length - 1] : null;
      var previousItem = previousGroup && previousGroup.items.length ? previousGroup.items[previousGroup.items.length - 1] : null;
      var overlapWithPrevious = previousItem ? overlapSize(linesFrom(previousItem.text), linesFrom(item.text)) : 0;
      var detailContinuation = !hasIdentity && bestGroup === previousGroup && (looksLikeContinuation(item.text) || looksLikeJobDetailPage(item.text));
      var safeToAttach = bestGroup && (
        bestScore >= 8
        || (!hasIdentity && bestScore >= 4)
        || detailContinuation
      );
      if (!safeToAttach) {
        bestGroup = {
          id: "job-group-" + (groups.length + 1),
          items: [],
        };
        groups.push(bestGroup);
      }
      if (safeToAttach && (bestScore < 9 || (!hasIdentity && !overlapWithPrevious))) {
        bestGroup.groupingUncertain = true;
        bestGroup.groupingReasons = bestGroup.groupingReasons || [];
        bestGroup.groupingReasons.push("岗位归属待确认：截图" + (item.index + 1) + "与本组有关联，但证据不足以自动确认");
      }
      bestGroup.items.push(item);
    });
    return groups.map(function (group, index) {
      var identity = groupIdentity(group);
      var hasText = group.items.some(function (item) { return Boolean(item.text); });
      var hasError = group.items.some(function (item) { return Boolean(item.error); });
      var lowConfidence = group.items.some(function (item) {
        return item.confidence > 0 && item.confidence < 60;
      });
      var needsConfirmation = !identity.company || !identity.position || lowConfidence || group.groupingUncertain;
      return {
        id: group.id || "job-group-" + (index + 1),
        screenshotIndexes: group.items.map(function (item) { return item.index; }),
        company: identity.company,
        position: identity.position,
        status: !hasText ? "failed" : (needsConfirmation || hasError ? "needs-confirmation" : "ready"),
        reasons: uniqueStrings([
          !identity.company ? "公司名称待确认" : "",
          !identity.position ? "岗位名称待确认" : "",
          lowConfidence ? "存在低可信度截图" : "",
          hasError ? "存在识别失败截图" : "",
          group.groupingUncertain ? (group.groupingReasons || []).join("；") : "",
        ]),
      };
    });
  }

  function uniqueStrings(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).map(cleanText).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function suggestJobDirection(source) {
    source = source || {};
    var text = [source.position, source.jobCategory, source.industry, source.raw]
      .filter(Boolean).join(" ").toLowerCase();
    var title = String(source.position || "").toLowerCase();
    if (/招聘主管|人事|人力资源|物流专员|shipbroker/.test(title)) return "其他";
    if (/海外销售|海外营销|国际销售|overseas sales/.test(title)) return "海外销售";
    if (/国际业务|international business/.test(title)) return "国际业务";
    if (/外贸|进出口|出口业务|foreign trade/.test(title)) return "外贸";
    if (/海外销售|海外营销|国际销售|overseas sales/.test(text)) return "海外销售";
    if (/国际业务|international business/.test(text)) return "国际业务";
    if (/外贸|进出口|出口业务|foreign trade/.test(text)) return "外贸";
    if (/人工智能|大模型|aigc|\bai\b|prompt|智能体/.test(text)) return "AI相关";
    if (/英语教师|英语老师|教师|老师|教学|助教|课程顾问|teacher|teaching/.test(text)) return "英语教育";
    return "其他";
  }

  global.jobScreenshotTools = {
    extractRequirement: function (raw, field) {
      var patterns = {
        educationRequirement: /(?:博士|硕士|研究生|本科|大专|专科|高中|中专)(?:及以上|以上|学历)?|学历不限|bachelor(?:'s)?(?: degree)?|master(?:'s)?(?: degree)?/ig,
        experienceRequirement: /经验不限|无经验要求|应届(?:毕业生)?|\d+\s*(?:[-–至]\s*\d+)?\s*年(?:以上)?(?:工作)?经验/ig,
        languageRequirement: /(?:CET[- ]?[46]\+?|雅思\s*\d?(?:\.\d)?|托福\s*\d{0,3}|JLPT\s*N[1-5])|(?:英语|日语|English|Japanese)[^。；;，,\n]{0,45}/ig,
        professionalRequirement: /专业不限|(?:国际贸易|商务英语|市场营销|计算机|教育学|日语|英语)(?:等)?(?:相关)?专业|相关专业|(?:专业要求|专业)\s*[：:]\s*[^。；;，,\n]{1,40}/ig,
        skillsRequirement: /(?:熟练使用|掌握|熟悉)\s*(?:Excel|Office|Word|PowerPoint|CRM|办公软件|数据处理|剪辑软件)|Excel|Office|CRM|数据分析|沟通能力|客户开发|开发客户/ig
      };
      if (!patterns[field]) return "";
      var matches = cleanOcrText(raw).match(patterns[field]) || [];
      return uniqueStrings(matches.map(function (value) { return value.split(/[，,]|学历|工作经验/)[0]; })).join("；");
    },
    reviewState: function (draft, confirmed) {
      var fields = {};
      Object.keys(draft || {}).forEach(function (key) {
        if (key.charAt(0) === "_") return;
        var value = cleanText(draft[key]);
        fields[key] = !value || /^(未提供|未说明|公司待确认)$/.test(value) ? "missing" : /待确认|识别不确定/.test(value) ? "uncertain" : "recognized";
      });
      return { fieldStatus: fields, jobStatus: confirmed ? "confirmed" : !cleanText(draft && draft.jd) ? "failed" : !cleanText(draft.position) || /未提供|待确认/.test(draft.position) ? "needs-confirmation" : "ready" };
    },
    validateAiGroups: function (payload, batch) {
      if (!payload || payload.batchId !== batch.id || !Array.isArray(payload.groups) || !payload.groups.length) throw new Error("批次不匹配或缺少岗位组");
      var used = {};
      payload.groups.forEach(function (group) {
        if (!Array.isArray(group.screenshotIds) || !group.screenshotIds.length) throw new Error("岗位组缺少截图");
        group.screenshotIds.forEach(function (id) {
          if (used[id] || !batch.results.some(function (item) { return item.id === id; })) throw new Error("截图重复分配或不属于当前批次：" + id);
          used[id] = true;
        });
      });
      if (Object.keys(used).length !== batch.results.length) throw new Error("存在未分配截图，请补齐分组");
      return payload.groups;
    },
    cleanOcrText: cleanOcrText,
    comparableLine: comparableLine,
    lineSimilarity: lineSimilarity,
    mergeOcrTexts: mergeOcrTexts,
    extractOcrHints: extractOcrHints,
    assessSameJob: assessSameJob,
    groupOcrResults: groupOcrResults,
    isUnknownCompanyValue: isUnknownCompanyValue,
    suggestJobDirection: suggestJobDirection,
  };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  function cleanText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function normalizedIdentity(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\s·•丨|｜，。；：、,.!！?？()（）【】\[\]{}<>《》“”‘’'"`~_—–-]/g, "");
  }

  function companyStatus(value) {
    var text = cleanText(value);
    if (!text || /^(?:未知|未提供|未说明|未识别)$/.test(text)) return "not-provided";
    if (/^(?:公司待确认|待确认|请确认|识别不确定|不确定)$/.test(text)) return "uncertain";
    return "known";
  }

  function bigrams(value) {
    var text = normalizedIdentity(value);
    if (!text) return [];
    if (text.length < 2) return [text];
    var output = [];
    for (var index = 0; index < text.length - 1; index += 1) {
      output.push(text.slice(index, index + 2));
    }
    return output;
  }

  function textSimilarity(left, right) {
    var leftText = normalizedIdentity(left);
    var rightText = normalizedIdentity(right);
    if (!leftText || !rightText) return 0;
    if (leftText === rightText) return 1;
    var leftPairs = bigrams(leftText);
    var rightPairs = bigrams(rightText);
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

  function hammingDistance(left, right) {
    var a = String(left || "");
    var b = String(right || "");
    if (!a || a.length !== b.length) return Infinity;
    var distance = 0;
    for (var index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) distance += 1;
    }
    return distance;
  }

  function aspectRatioClose(left, right) {
    var leftWidth = Number(left && left.width) || 0;
    var leftHeight = Number(left && left.height) || 0;
    var rightWidth = Number(right && right.width) || 0;
    var rightHeight = Number(right && right.height) || 0;
    if (!leftWidth || !leftHeight || !rightWidth || !rightHeight) return true;
    var first = leftWidth / leftHeight;
    var second = rightWidth / rightHeight;
    return Math.abs(first - second) / Math.max(first, second) <= 0.1;
  }

  function findScreenshotMatch(history, fingerprint) {
    var records = Array.isArray(history) ? history : [];
    var exact = records.find(function (record) {
      return record && fingerprint && record.contentHash && record.contentHash === fingerprint.contentHash;
    });
    if (exact) {
      return { type: "exact", record: exact, similarity: 1 };
    }
    var best = null;
    records.forEach(function (record) {
      if (!record || !record.perceptualHash || !fingerprint || !fingerprint.perceptualHash) return;
      if (!aspectRatioClose(record, fingerprint)) return;
      var distance = hammingDistance(record.perceptualHash, fingerprint.perceptualHash);
      var total = fingerprint.perceptualHash.length;
      if (!isFinite(distance) || !total) return;
      var similarity = 1 - distance / total;
      if (similarity < 0.92) return;
      if (!best || similarity > best.similarity) {
        best = { type: "similar", record: record, similarity: similarity };
      }
    });
    return best;
  }

  function coreJdText(job) {
    if (!job) return "";
    return [job.responsibilities, job.requirements, job.educationRequirement, job.experienceRequirement, job.jd]
      .map(cleanText)
      .filter(Boolean)
      .join(" ")
      .slice(0, 12000);
  }

  function findLikelyJobMatch(jobs, candidate) {
    var best = null;
    (Array.isArray(jobs) ? jobs : []).forEach(function (job) {
      if (!job || !candidate) return;
      var existingCompanyKnown = companyStatus(job.company) === "known";
      var candidateCompanyKnown = companyStatus(candidate.company) === "known";
      var bothCompaniesKnown = existingCompanyKnown && candidateCompanyKnown;
      var companySimilarity = bothCompaniesKnown ? textSimilarity(job.company, candidate.company) : 0;
      var positionSimilarity = textSimilarity(job.position, candidate.position);
      if (bothCompaniesKnown && companySimilarity < 0.88) return;
      if (positionSimilarity < 0.86) return;

      var existingCity = cleanText(job.city || job.location);
      var incomingCity = cleanText(candidate.city || candidate.location);
      var citySimilarity = existingCity && incomingCity ? textSimilarity(existingCity, incomingCity) : 0.65;
      if (existingCity && incomingCity && citySimilarity < 0.55) return;

      var existingCore = coreJdText(job);
      var incomingCore = coreJdText(candidate);
      var coreSimilarity = existingCore && incomingCore ? textSimilarity(existingCore, incomingCore) : 0;
      var companyExact = bothCompaniesKnown
        && normalizedIdentity(job.company) === normalizedIdentity(candidate.company);
      var positionExact = normalizedIdentity(job.position) === normalizedIdentity(candidate.position);
      var identityExact = companyExact && positionExact;
      var score = (bothCompaniesKnown ? companySimilarity * 0.28 : 0)
        + positionSimilarity * (bothCompaniesKnown ? 0.3 : 0.42)
        + citySimilarity * 0.1
        + coreSimilarity * (bothCompaniesKnown ? 0.32 : 0.48);
      var level = "";
      if (bothCompaniesKnown) {
        if (coreSimilarity >= 0.58 || (identityExact && citySimilarity >= 0.9 && coreSimilarity >= 0.35)) {
          level = "likely";
        } else if (identityExact && (citySimilarity >= 0.8 || coreSimilarity >= 0.25)) {
          level = "possible";
        }
      } else if (positionExact && coreSimilarity >= 0.68 && (!existingCity || !incomingCity || citySimilarity >= 0.55)) {
        level = "likely";
      } else if (positionExact && coreSimilarity >= 0.48 && (!existingCity || !incomingCity || citySimilarity >= 0.55)) {
        level = "possible";
      }
      if (!level) return;
      if (!best || score > best.score) {
        var reasons = [];
        if (bothCompaniesKnown) reasons.push("公司名称和岗位名称高度一致");
        else reasons.push("公司信息未确认，依据岗位名称和JD核心内容判断");
        if (existingCity && incomingCity && citySimilarity >= 0.8) reasons.push("工作地点接近");
        if (coreSimilarity >= 0.35) reasons.push("JD职责/要求内容相似");
        best = {
          level: level,
          job: job,
          score: score,
          coreSimilarity: coreSimilarity,
          reasons: reasons,
        };
      }
    });
    return best;
  }

  global.jobDuplicateTools = {
    normalizedIdentity: normalizedIdentity,
    textSimilarity: textSimilarity,
    hammingDistance: hammingDistance,
    findScreenshotMatch: findScreenshotMatch,
    findLikelyJobMatch: findLikelyJobMatch,
    companyStatus: companyStatus,
  };
})(typeof window !== "undefined" ? window : globalThis);

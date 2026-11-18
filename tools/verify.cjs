'use strict';
const assert = require('node:assert/strict');
const cases = {...require('../tests/storage-restore.cjs'), careerFlow: require('../tests/career-flows.cjs'), ...require('../tests/screenshot-ocr.cjs')};
const {isolated} = require('../tests/isolated-browser.cjs');
const required = ['empty','persist','native','cancel','legacy','array','rollback','interrupted','careerFlow','shotMiss','shotHit','shotRead','shotWrite','shotCorrupt','shotInvalid','shotGroup','shotAi','shotRetry','shotTransaction','shotEmpty','shotHistorical','shotMissing'];
// Both screenshot confirmation boundaries are mandatory.
required.push('shotSwitchPreview','shotDoubleConfirm');
Object.assign(cases,require('../tests/interview-flows.cjs'));
required.push('interviewLibrary','interviewIndependentFacts','interviewStarReview','interviewJobFacts','interviewPractice','interviewFailedDelete');
required.push('projectEditReload','projectDirectLink','projectQuestionFacts');
const realOcr = require('../tests/real-ocr-init.cjs');
Object.assign(cases,realOcr);
required.push('ocrChinese503','ocrEnglish503','ocrCoreUnavailable');
assert.deepEqual(Object.keys(cases).sort(), [...required].sort(), '测试清单不完整');
(async () => {
  let failures = 0;
  for (const name of required) {
    try { if (Object.hasOwn(realOcr,name)) await realOcr[name](); else await isolated(cases[name]); console.log('PASS', name); }
    catch (error) { failures++; console.error('FAIL', name, error); }
  }
  console.log('Passed:', required.length-failures, 'Failed:', failures);
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode=1; });

'use strict';

// Real 5.1.1 worker + WASM + models. Only resource locations and HTTP
// availability are controlled; recognize(), errorHandler and its results are real.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, expect} = require('playwright/test');

const mainUrl = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const main = require.resolve('tesseract.js/dist/tesseract.min.js');
const assets = new Map([
  ['/worker.min.js', require.resolve('tesseract.js/dist/worker.min.js')],
  ...['simd-lstm', 'lstm'].map(type => {
    const file = 'tesseract-core-' + type + '.wasm.js';
    return ['/' + file, require.resolve('tesseract.js-core/' + file)];
  }),
  ...['chi_sim','eng'].map(lang => ['/' + lang + '.traineddata.gz',
    require.resolve('@tesseract.js-data/' + lang + '/4.0.0_best_int/' + lang + '.traineddata.gz')])
]);

async function image(page, word) {
  const png = await page.evaluate(word => {
    const canvas = document.createElement('canvas');
    canvas.width = 760; canvas.height = 120;
    const g = canvas.getContext('2d');
    g.fillStyle = 'white'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'black'; g.font = '44px Arial'; g.fillText(word, 30, 78);
    return canvas.toDataURL().split(',')[1];
  }, word);
  return {name: word + '.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64')};
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const data = (await jobBatchStore.exportRecords()).stores;
    for (const row of data.screenshots) {
      row.bytes = Array.from(new Uint8Array(await row.blob.arrayBuffer()));
      delete row.blob;
    }
    return data;
  });
}

async function openImport(page, file) {
  await page.locator('[data-module="找工作"]').click();
  await page.locator('#screenshot-job-button').click();
  await page.locator('#job-screenshot-batch-direction').fill('其他');
  await page.locator('#job-screenshot-files').setInputFiles(file);
}

async function runFault(kind) {
  let fault = false, hits = 0;
  const unexpected = [];
  const server = http.createServer((req, res) => {
    const file = assets.get(req.url);
    if (req.method !== 'GET' || !file) {
      unexpected.push(req.method + ' ' + req.url);
      res.writeHead(404); return res.end();
    }
    const headers = {'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store',
      'Content-Type':file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'};
    const target = kind === 'core' ? req.url.startsWith('/tesseract-core-') : req.url === '/' + kind + '.traineddata.gz';
    if (fault && target) {
      hits++; res.writeHead(503,headers); return res.end('synthetic resource outage');
    }
    res.writeHead(200,headers);
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve,reject) => server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const address = '127.0.0.1:' + server.address().port;
  const base = 'http://' + address;
  let browser;
  try {
    browser = await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL || undefined,
      args:['--proxy-server=127.0.0.1:0','--proxy-bypass-list=<-loopback>;' + address,'--disable-quic']});
    const ctx = await browser.newContext({serviceWorkers:'block'});
    await ctx.route(/^https?:/i, route => {
      const url = route.request().url();
      if (url === mainUrl) return route.fulfill({path:main,contentType:'application/javascript'});
      if (url.startsWith(base + '/') && assets.has(new URL(url).pathname)) return route.continue();
      unexpected.push(url); return route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', error => {
      // Chromium also reports a worker-global importScripts error for the deliberately rejected core.
      if (!(fault && kind === 'core' && error.message.includes(base + '/tesseract-core-') &&
            error.message.includes('importScripts'))) unexpected.push(error.message);
    });
    await page.addInitScript(base => {
      // Supply local resource URLs to the unmodified npm library on every reload.
      let library;
      Object.defineProperty(window,'Tesseract',{configurable:true,get:()=>library,set:value=>{
        library = value;
        const create = value.createWorker;
        value.createWorker = (langs, oem, options) => create(langs,oem,{...options,
          workerPath:base+'/worker.min.js',corePath:base+'/',langPath:base,cacheMethod:'none'});
      }});
    }, base);
    await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
    const start = page.locator('#recognize-job-screenshots');
    const saved = page.locator('#job-batch-save-notice-0 p');
    const original = await image(page,'ORIGINAL JOB');
    const next = await image(page,'RETRY JOB');
    await openImport(page,original);
    await start.click();
    await expect(saved).toContainText('原始截图已保存',{timeout:60000});
    let before = await snapshot(page);
    // Exercise both retry controls on the existing saved batch. A failed
    // initialization must not persist a "recognizing" status or change its text.
    const warning = page.locator('#job-screenshot-warning');
    fault = true;
    for (const action of ['retry-screenshot','retry-group']) {
      const button = page.locator('[data-batch-action="'+action+'"]').first();
      if (!await button.isVisible()) await button.locator('xpath=ancestor::details[1]/summary').click();
      const previousHits = hits;
      await button.click();
      await expect.poll(()=>hits).toBeGreaterThan(previousHits);
      await expect(warning).toContainText(kind === 'core' ? 'importScripts' : '503');
      await expect(start).toBeEnabled();
      assert.deepEqual(await snapshot(page),before);
    }
    fault = false;
    await page.locator('[data-batch-action="retry-group"]').first().click();
    await expect.poll(async()=>{
      const data = await snapshot(page);
      return data.batches[0].batch.results[0].lastRecognizedAt;
    },{timeout:60000}).not.toBe(before.batches[0].batch.results[0].lastRecognizedAt);
    before = await snapshot(page);
    assert.equal(before.screenshots.length,1);
    assert.equal(before.recognitionCache.length,1);
    assert.equal(before.batches.length,1);
    assert.equal(before.batches[0].batch.results[0].text,'ORIGINAL JOB');

    fault = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.reload();
      assert.deepEqual(await snapshot(page),before);
      await openImport(page,next);
      await start.click();
      const warning = page.locator('#job-screenshot-warning');
      await expect(warning).toContainText(kind === 'core' ? 'OCR 核心' : kind,{timeout:15000});
      await expect(warning).toContainText(kind === 'core' ? 'importScripts' : '503');
      await expect(page.locator('#job-screenshot-progress')).toContainText('未完成');
      await expect(start).toBeEnabled();
      await expect(page.locator('#job-screenshot-file-list')).toContainText(next.name);
      assert.deepEqual(await snapshot(page),before);
    }
    assert.ok(hits >= 2, 'real resource must actually fail on both attempts');
    fault = false;
    await start.click(); // Same selected image. No re-selection or cache seeding.
    await expect(saved).toContainText('原始截图已保存',{timeout:60000});
    const after = await snapshot(page);
    assert.equal(after.batches.length,2);
    assert.deepEqual(after.batches.find(r=>r.id===before.batches[0].id),before.batches[0]);
    const added = after.batches.find(r=>r.id!==before.batches[0].id);
    assert.equal(added.batch.results[0].text,'RETRY JOB');
    assert.equal(after.screenshots.length,2);
    assert.equal(after.recognitionCache.length,2);
    assert.deepEqual(after.screenshots.find(r=>r.id===before.screenshots[0].id),before.screenshots[0]);
    assert.deepEqual(after.recognitionCache.find(r=>r.contentHash===before.recognitionCache[0].contentHash),before.recognitionCache[0]);
    await page.reload();
    assert.deepEqual(await snapshot(page),after);
    assert.deepEqual(unexpected,[]);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
}

module.exports = {
  ocrChinese503: () => runFault('chi_sim'),
  ocrEnglish503: () => runFault('eng'),
  ocrCoreUnavailable: () => runFault('core')
};

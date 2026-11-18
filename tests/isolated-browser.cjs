'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
exports.isolated = async function(run) {
  const browser = await chromium.launch({headless:true, ...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
  try {
    const ctx = await browser.newContext({offline:true, serviceWorkers:'block'});
    const errors=[];
    await ctx.route(/^https?:/i, route => {
      if(route.request().url()==='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js')
        return route.fulfill({contentType:'application/javascript',body:'window.Tesseract={createWorker:async()=>({recognize:async()=>({data:{text:"synthetic"}}),terminate:async()=>{}})}'});
      errors.push('Unexpected network: '+route.request().url());return route.abort();
    });
    const p=await ctx.newPage();
    p.on('pageerror',e=>errors.push(e.message));
    p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    // Console events persist across reloads even if business code catches the exception.
    await p.addInitScript(()=>{
      const proto=Storage.prototype;
      const prefix='careerWorkbench.';
      const allowed=new Set(['jobs','jobsToolkit','interview','jobsAiRecovery','jobsResumeRecovery','jobsRestoreProtection','jobsRestoreState'].map(k=>prefix+k+'.v1'));
      proto.setItem.call(localStorage,'personalAiWorkspace.jobs.v1','[{"id":"old-canary"}]');
      window.events=[];
      const deny=k=>{console.error('Forbidden storage access: '+String(k));throw Error('storage boundary')};
      for(const m of ['getItem','setItem','removeItem','clear','key']){
        const orig=proto[m];proto[m]=function(k,...args){
          if(!allowed.has(k)||m==='clear'||m==='key')deny(k);
          events.push([m,k]);
          if(m==='setItem' && k===prefix+'jobs.v1' && window.failure){window.tripped=true;throw Error('synthetic job write failure')}
          if(window.failure===2 && window.tripped && m!=='getItem' && k===prefix+'jobsToolkit.v1')throw Error('synthetic rollback failure');
          return orig.call(this,k,...args);
        };
      }
      const storage=window.localStorage;
      Object.defineProperty(window,'localStorage',{value:new Proxy(storage,{
        get(t,k){if(!['getItem','setItem','removeItem','clear','key'].includes(k))return deny(k);return t[k].bind(t)},
        ownKeys(){return deny('enumeration')},has(t,k){return deny(k)},getOwnPropertyDescriptor(t,k){return deny(k)},set(t,k){return deny(k)},deleteProperty(t,k){return deny(k)},defineProperty(t,k){return deny(k)}
      })});
      for(const m of ['open','deleteDatabase','databases']){
        const orig=IDBFactory.prototype[m]; if(orig)IDBFactory.prototype[m]=function(k,...args){if(m!=='open'||k!==prefix+'jobBatchAssets.v1')deny(k);events.push([m,k]);return orig.call(this,k,...args)};
      }
    });
    await p.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
    await p.locator('[data-module="找工作"]').click();
    await run(p);
    assert.deepEqual(errors,[]);
    await ctx.close();
  } finally {await browser.close()}
};

import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try {for(const original of (process.env.PORT_ONLY ? [false] : [true,false])) {
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!(original&&m.text().includes('404')))errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${original?5189:5188}/?capture=1&q=high${original?'&lockstep=1&prewarm=0':''}`);
 await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 if(original)await page.evaluate(async()=>{window.__APPLY_SHOT__('hero');await window.__PUMP__(90);});
 else {const f=await page.evaluate(()=>{const e=window.__ENGINE__,p=e.ctx.get('player');e.input.enabled=false;p.setControlEnabled(false);e.camera.position.set(12,1.75,18);e.camera.lookAt(-4,2.2,-6);p.teleport(e.camera.position,e.camera.rotation);e.ctx.get('weapons').debugPose('idle');return e.time.frame;});await page.waitForFunction(f=>window.__ENGINE__.time.frame>=f+90,f,{timeout:120000});}
 const name=original?'original':'port';await page.screenshot({path:`artifacts/${name}-before-flash.png`});
 if(original)await page.evaluate(async()=>{window.__ENGINE__.ctx.get('fx')._stageMuzzle();await window.__PUMP__(1);});
 else {await page.evaluate(()=>{const e=window.__ENGINE__,advance=e.advance;e.ctx.get('fx')._stageMuzzle();e.advance=function(){advance.call(e,1/60);queueMicrotask(()=>{window.__HOLOGY_VIEW__.paused=true;window.__FLASH_DONE__=true;});};});await page.waitForFunction(()=>window.__FLASH_DONE__,null,{timeout:90000});}
 await page.screenshot({path:`artifacts/${name}-muzzle.png`});
 const light=await page.evaluate(()=>window.__ENGINE__.ctx.get('fx').viewLights.lights.map(e=>({peak:e.peak,intensity:e.light.intensity,distance:e.light.distance})));console.log(name,light);
 const muzzle=await page.evaluate(()=>{const e=window.__ENGINE__;return {camera:e.camera.position.toArray(),muzzle:e.ctx.get('weapons').muzzleWorld(e.camera.position.clone()).toArray()};});
 if(!original){const distance=Math.hypot(...muzzle.muzzle.map((x,i)=>x-muzzle.camera[i]));assert.ok(distance>.25&&distance<2,'Muzzle query must retain logical world scale');}
 if(!original)checkLights(light);assert.equal(errors.length,0,errors.join('\n'));await page.close();
}}finally{await browser.close();}
function checkLights(lights){const active=lights.filter(l=>l.peak>0);assert.ok(active.length>0);assert.ok(active.every(l=>l.intensity<=l.peak*.0145&&l.distance<.3),'View flash must use presentation-scaled light intensity/range');}

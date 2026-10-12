import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const failures=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>failures.push(e.stack));page.on('console',m=>{if(m.type()==='warning'&&/Falling back|Skipping custom post-process/.test(m.text()))failures.push(m.text());if(m.type()==='error')failures.push(m.text());});
 await page.addInitScript(()=>{Error.stackTraceLimit=30;});await page.goto('http://127.0.0.1:5188/?capture=1&q=high');await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 const start=await page.evaluate(()=>{
  const e=window.__ENGINE__,p=e.ctx.get('player');e.input.frozen=true;e.input.enabled=false;p.setControlEnabled(false);
  e.camera.position.set(12,1.75,18);const look=e.camera.position.clone().set(-4,2.2,-6);e.camera.lookAt(look);e.camera.fov=75;e.camera.updateProjectionMatrix();p.teleport(e.camera.position,e.camera.rotation);
  e.ctx.get('weapons').debugPose('idle');return e.time.frame;
 });
 await page.waitForFunction(frame=>window.__ENGINE__.time.frame>=frame+90,start,{timeout:120000});await page.screenshot({path:'artifacts/port-hero.png'});
 console.log(await page.evaluate(()=>({baseExposure:window.__HOLOGY_VIEW__.view.baseToneMappingExposure,postExposure:window.__HOLOGY_VIEW__.view.postProcessSettings.tonemapExposure,grade:window.__HOLOGY_VIEW__.view.experimentalWebGpuBackend.colorGrading?.options,profile:window.__HOLOGY_VIEW__.getLastFrameProfile()?.gpuTimeMs,frame:window.__ENGINE__.time.frame,world:window.__ENGINE__.ctx.get('world').A.stats})));
 assert.equal(failures.length,0,failures.join('\n'));
}finally{await browser.close();}





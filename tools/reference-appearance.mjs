import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror', e=>console.error(e.stack));
 await page.goto('http://127.0.0.1:5189/?capture=1&lockstep=1&prewarm=0&q=high');
 await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 await page.evaluate(async()=>{window.__APPLY_SHOT__('hero'); await window.__PUMP__(90);});
 await page.screenshot({path:'artifacts/original-hero.png'});
 console.log(await page.evaluate(()=>{
 const r=window.__ENGINE__.ctx.get('render'),sky=window.__ENGINE__.ctx.get('sky');
 return {sun:sky.sunLight.intensity,color:sky.sunLight.color.toArray(),ambient:sky.ambientColor.toArray(),indirect:sky.indirectScale,settings:r.settings,meter:r.debugExposure(),exposureUniforms:Object.fromEntries(Object.entries(r.exposure??{}).filter(([k])=>k==='settings')),cam:window.__ENGINE__.camera.position.toArray()};
 }));
}finally{await browser.close();}


import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:5188/?capture=1&q=high');await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 const images=[];
 for(const enabled of [false,true]){
  const start=await page.evaluate(enabled=>{const e=window.__ENGINE__,p=e.ctx.get('player'),v=window.__HOLOGY_VIEW__;e.input.enabled=false;e.input.frozen=true;p.setControlEnabled(false);e.camera.position.set(12,1.75,18);e.camera.lookAt(-4,2.2,-6);p.teleport(e.camera.position,e.camera.rotation);e.ctx.get('weapons').debugPose('idle');v.view.setGTAOOptions({enabled,radius:1.35});return e.time.frame;},enabled);
  await page.waitForFunction(f=>window.__ENGINE__.time.frame>f+60,start,{timeout:120000});images.push((await page.screenshot({path:`artifacts/ao-${enabled?'on':'off'}.png`})).toString('base64'));
 }
 const diff=await page.evaluate(async images=>{const pixels=[];for(const s of images){const i=await createImageBitmap(await(await fetch('data:image/png;base64,'+s)).blob());const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);pixels.push(x.getImageData(0,0,c.width,c.height).data);}let sum=0,n=0;for(let y=400;y<650;y++)for(let x=200;x<1000;x++)for(let ch=0;ch<3;ch++){const j=(y*1440+x)*4+ch;sum+=pixels[0][j]-pixels[1][j];n++;}return sum/n;},images);
 const passes=await page.evaluate(()=>window.__HOLOGY_VIEW__.getLastFrameProfile().passes.filter(p=>p.name.includes('GTAO')).map(p=>p.name));assert.ok(diff>0.1,`AO did not darken geometry: ${diff}`);assert.equal(errors.length,0,errors.join('\n'));console.log({meanDarkening:diff,passes});
}finally{await browser.close();}

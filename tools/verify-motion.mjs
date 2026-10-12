import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
const failures=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>failures.push(e.stack));
 page.on('console',m=>{if(m.type()==='error'||/Skipping custom post-process|Falling back/.test(m.text()))failures.push(m.text());});
 await page.goto('http://127.0.0.1:5188/?capture=1&q=high');
 await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 const captures=[];
 for(const enabled of [false,true]) {
  await page.evaluate(enabled=>{
   const e=window.__ENGINE__,v=window.__HOLOGY_VIEW__,p=e.ctx.get('player');
   e.input.enabled=false;e.input.frozen=true;p.setControlEnabled(false);
   e.camera.position.set(12,1.75,18);e.camera.lookAt(-4,2.2,-6);e.camera.updateProjectionMatrix();
   p.teleport(e.camera.position,e.camera.rotation);
   const yaw=e.camera.rotation.y,advance=e.__savedAdvance??e.advance;e.__savedAdvance=advance;
   v.view.setMotionBlurOptions({enabled});window.__MOTION_DONE__=false;let frame=0;
   e.advance=function(){frame++;if(frame>30)e.camera.rotation.y=yaw+(frame-30)*0.018;advance.call(e,1/60);
    if(frame===60)queueMicrotask(()=>{v.paused=true;window.__MOTION_DONE__=true;});};
   v.paused=false;
  },enabled);
  await page.waitForFunction(()=>window.__MOTION_DONE__,null,{timeout:120000});
  const capture=await page.screenshot({path:`artifacts/motion-${enabled?'on':'off'}.png`});captures.push(capture.toString('base64'));
 }
 const difference=await page.evaluate(async images=>{
  const pixels=[];for(const image of images){const b=await createImageBitmap(await(await fetch('data:image/png;base64,'+image)).blob());const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);pixels.push(x.getImageData(0,0,c.width,c.height).data);}
  let diff=0,count=0;for(let y=220;y<500;y++)for(let x=300;x<1100;x++)for(let c=0;c<3;c++){const i=(y*1440+x)*4+c;diff+=Math.abs(pixels[0][i]-pixels[1][i]);count++;}return diff/count;
 },captures);
 assert.ok(difference>0.5,`Motion blur output did not change: ${difference}`);
 assert.equal(failures.length,0,failures.join('\n'));
 console.log('PASS Camera-turn motion blur changes world pixels',difference);
}finally{await browser.close();}


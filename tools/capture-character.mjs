import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
 await page.goto(process.env.PORT_URL??'http://127.0.0.1:5188');
 await page.waitForFunction(()=>window.__READY__,null,{timeout:120000});
 const start=await page.evaluate(()=>{
  const e=window.__ENGINE__, p=e.ctx.get('player'), ph=e.ctx.get('physics');
  const position=e.camera.position.clone().addScaledVector(p.forward,7);
  position.y=ph.groundHeight(position.x,position.z,10)+0.03;
  const actor=e.ctx.get('ai').spawn('vanguard',position,Math.atan2(e.camera.position.x-position.x,e.camera.position.z-position.z));
  actor.staged={crouch:false,speed:0,fire:false,reload:0};
  return e.time.frame;
 });
 await page.waitForFunction(frame=>window.__ENGINE__.time.frame>frame+45,start,{timeout:90000});
 await page.screenshot({path:fileURLToPath(new URL('../artifacts/character.png',import.meta.url))});
 console.log('Character visual check',errors);
 if(errors.length) process.exitCode=1;
} finally {await browser.close();}

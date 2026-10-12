import {chromium} from 'playwright';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const {PNG}=createRequire(import.meta.url)('../../Claude-of-Duty/node_modules/pngjs');
const manifest=JSON.parse(await fs.readFile('public/port-textures/manifest.json'));
function stats(buffer){const png=PNG.sync.read(buffer);let raw=0,linear=0;for(let i=0;i<png.data.length;i+=4){for(let c=0;c<3;c++){const x=png.data[i+c]/255;raw+=x;linear+=x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4;}}return {raw:raw/(png.width*png.height*3),decodedLinear:linear/(png.width*png.height*3)};}
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5188/tools/bake.html');
 await page.waitForFunction(()=>window.bakeReady,null,{timeout:90000});
 for(const name of ['plaster','sand','wood']){
  const [key,entry]=Object.entries(manifest).find(([k])=>k.startsWith(name+'|'));
  const baked=await page.evaluate(k=>window.bakeSurface(k),key);
  console.log(name,{three169Bake:stats(Buffer.from(baked.albedo,'base64')),original180Bake:stats(await fs.readFile('public/port-textures/'+entry.albedo))});
 }
}finally{await browser.close();}

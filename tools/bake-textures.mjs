import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const base = process.env.PORT_URL ?? 'http://127.0.0.1:5188';
const manifestPath = new URL('../public/port-textures/manifest.json',import.meta.url);
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage();
 page.on('pageerror',error=>console.error(error));
 await page.goto(`${base}/tools/bake.html`);
 await page.waitForFunction(()=>window.bakeReady,{timeout:120000});
 for(const [key,entry] of Object.entries(manifest)) {
  const result=await page.evaluate(key=>window.bakeSurface(key),key);
  for(const channel of ['albedo','normal','orm']) {
   await fs.writeFile(new URL(`../public/port-textures/${entry[channel]}`,import.meta.url),Buffer.from(result[channel],'base64'));
  }
  entry.size=result.size;
  console.log('Baked',key);
 }
 await fs.writeFile(manifestPath,JSON.stringify(manifest));
} finally {await browser.close();}

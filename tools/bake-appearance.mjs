import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>console.error(e.stack));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.goto((process.env.PORT_URL??'http://127.0.0.1:5188')+'/tools/bake-appearance.html');
 await page.waitForFunction(()=>window.appearanceReady,null,{timeout:120000});
 const data=await page.evaluate(()=>window.exportAppearance());
 const dir=new URL('../public/appearance/',import.meta.url);await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(new URL('sky-day.rgba16f',dir),Buffer.from(data.sky,'base64'));
 for(const name of ['detailAlbedo','detailNormal','macro'])await fs.writeFile(new URL(`${name}.png`,dir),Buffer.from(data[name],'base64'));
 await fs.writeFile(new URL('day.json',dir),JSON.stringify(data.metadata,null,2));
 console.log('Exported original HDR sky and shared maps',data.metadata);
}finally{await browser.close();}

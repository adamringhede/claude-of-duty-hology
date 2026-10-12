import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const dir=new URL('../public/appearance/',import.meta.url);
const surfaceDir=new URL('../public/port-textures/',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',surfaceDir)));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.error(e.stack));
 await page.goto('http://127.0.0.1:5189/?capture=1&lockstep=1&prewarm=0&q=high');
 await page.waitForFunction(()=>window.__READY__,null,{timeout:180000});
 await page.evaluate(()=>{
 window.exportMap=(texture,target)=>{
  const renderer=window.__ENGINE__.ctx.get('render').renderer;
  const pixels=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
  const canvas=document.createElement('canvas');canvas.width=target.width;canvas.height=target.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),target.width,target.height),0,0);
  return canvas.toDataURL('image/png').split(',')[1];
 };
 });
 for(const [key,entry] of Object.entries(manifest)){
  const result=await page.evaluate(key=>{
   const lib=window.__ENGINE__.ctx.get('materials'),set=lib._sets.get(key);if(!set)throw new Error(key);
   return Object.fromEntries(['albedo','normal','orm'].map(channel=>[channel,window.exportMap(set[channel],lib._forge._owned.find(t=>t.texture===set[channel]))]));
  },key);
  for(const channel of ['albedo','normal','orm'])await fs.writeFile(new URL(entry[channel],surfaceDir),Buffer.from(result[channel],'base64'));
 }
 await fs.mkdir(dir,{recursive:true});
 const shared=await page.evaluate(()=>{
  const lib=window.__ENGINE__.ctx.get('materials');return Object.fromEntries([['detailAlbedo','detailAlbedo'],['detailNormal','detailNormal'],['macro','macro']].map(([name,key])=>[name,window.exportMap(lib._shared[key],lib._forge._owned.find(t=>t.texture===lib._shared[key]))]));
 });
 for(const [name,data] of Object.entries(shared))await fs.writeFile(new URL(`${name}.png`,dir),Buffer.from(data,'base64'));
 const metadata=await page.evaluate(async()=>{
  const e=window.__ENGINE__,sky=e.ctx.get('sky'),renderer=e.ctx.get('render').renderer;
  const {blit}=await import('/src/sky/fullscreen.js');
  function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
  window.exportSky=quality=>{
   const width=quality?2048:1024,height=width/2;
   const target=new sky.envEquirect.constructor(width,height,{type:sky.envEquirect.texture.type,depthBuffer:false});
   const material=sky.dome.envMaterial;const original=material.fragmentShader;if(quality)material.fragmentShader=original.replace('skSample( normalize( dir ), 0 )','skSample( normalize( dir ), 1 )');material.needsUpdate=true;
   blit(renderer,material,target);const data=new Uint16Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,data);
   const result=base64(new Uint8Array(data.buffer));material.fragmentShader=original;material.needsUpdate=true;target.dispose();return result;
  };
  return {width:2048,height:1024,environmentWidth:1024,environmentHeight:512,hour:sky.hour,sunDirection:sky.sunDirection.toArray(),sunColor:sky.sunLight.color.toArray(),sunIntensity:sky.sunLight.intensity,ambientColor:sky.ambientColor.toArray(),indirectScale:sky.indirectScale,exposureBias:sky.exposureBias};
 });
 for(const [name,quality] of [['sky-day',1],['sky-environment',0]])await fs.writeFile(new URL(`${name}.rgba16f`,dir),Buffer.from(await page.evaluate(q=>window.exportSky(q),quality),'base64'));
 await fs.writeFile(new URL('day.json',dir),JSON.stringify(metadata,null,2));
 console.log('Synced original Three.js 0.180 textures and atmospheric sky',metadata);
}finally{await browser.close();}


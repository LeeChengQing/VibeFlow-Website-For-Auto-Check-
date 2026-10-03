import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {performance as nodePerformance} from 'node:perf_hooks';

type Recording={intervals:number[];tasks:number[];positions:number[];elapsed:number};
declare global{interface Window{__perf:{recording:boolean;previous:number;started:number;data:Recording;begin:()=>void;end:()=>Recording;startupTasks:number[]}}}
const percentile=(values:number[],p:number)=>values[Math.min(values.length-1,Math.ceil(values.length*p)-1)]||0;
const round=(n:number)=>Math.round(n*1000)/1000;
async function scriptTime(cdp:CDPSession){const {metrics}=await cdp.send('Performance.getMetrics');return metrics.find((m:{name:string})=>m.name==='ScriptDuration')?.value||0;}
async function record(page:Page,cdp:CDPSession,name:string,action:()=>Promise<void>){
  const scriptBefore=await scriptTime(cdp);await page.evaluate(()=>window.__perf.begin());
  await action();const data=await page.evaluate(()=>window.__perf.end());const scriptMs=((await scriptTime(cdp))-scriptBefore)*1000;
  const sorted=data.intervals.slice().sort((a,b)=>a-b),worst=sorted.slice(-Math.max(1,Math.ceil(sorted.length*.01)));
  expect(data.intervals.length).toBeGreaterThan(30);
  return {phase:name,seconds:round(data.elapsed/1000),frames:sorted.length,averageFps:round(1000*sorted.length/sorted.reduce((a,b)=>a+b,0)),
    p95Ms:round(percentile(sorted,.95)),onePercentLowFps:round(1000/(worst.reduce((a,b)=>a+b,0)/worst.length)),
    above20Percent:round(sorted.filter(n=>n>20).length/sorted.length*100),longTaskCount:data.tasks.length,maxLongTaskMs:round(Math.max(0,...data.tasks)),
    scriptMsPerFrame:round(scriptMs/sorted.length),minY:Math.min(...data.positions),maxY:Math.max(...data.positions)};
}
async function cadence(duration:number,action:(i:number)=>Promise<void>){
  const start=nodePerformance.now();for(let i=0;nodePerformance.now()-start<duration;i++){
    await action(i);const next=start+(i+1)*50;await new Promise(resolve=>setTimeout(resolve,Math.max(0,next-nodePerformance.now())));
  }
}
for(const cpuRate of [1,4])test(`production rendering: ${cpuRate}x CPU`,async({page,browser},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});
  await page.addInitScript(()=>{
    const data:Recording={intervals:[],tasks:[],positions:[],elapsed:0};
    window.__perf={recording:false,previous:0,started:0,data,startupTasks:[],begin(){this.data={intervals:[],tasks:[],positions:[],elapsed:0};this.previous=0;this.started=performance.now();this.recording=true;},end(){this.recording=false;this.data.elapsed=performance.now()-this.started;return this.data;}};
    new PerformanceObserver(list=>{for(const entry of list.getEntries()){window.__perf.startupTasks.push(entry.duration);if(window.__perf.recording&&entry.startTime>=window.__perf.started)window.__perf.data.tasks.push(entry.duration);}}).observe({type:'longtask',buffered:true});
    // Measurement only: this sampler is separate from the application scheduler.
    const sample=(now:number)=>{const p=window.__perf;if(p.recording){if(p.previous)p.data.intervals.push(now-p.previous);p.data.positions.push(scrollY);p.previous=now;}requestAnimationFrame(sample);};requestAnimationFrame(sample);
  });
  await page.goto('/');await page.locator('.showcase-bento-grid').waitFor();await page.waitForTimeout(3000);
  const startup=await page.evaluate(()=>({tasks:window.__perf.startupTasks,hardware:navigator.hardwareConcurrency,memory:(navigator as Navigator&{deviceMemory?:number}).deviceMemory,mode:document.documentElement.dataset.perf||'normal'}));
  const height=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  const delta=Math.ceil(height/150);await page.mouse.move(5,450);
  const phases=[];
  phases.push(await record(page,cdp,'scroll down 8s',()=>cadence(8000,()=>page.mouse.wheel(0,delta))));
  expect(await page.evaluate(()=>scrollY)).toBeGreaterThanOrEqual(height-4);
  await page.waitForTimeout(300);
  phases.push(await record(page,cdp,'scroll up 8s',()=>cadence(8000,()=>page.mouse.wheel(0,-delta))));
  expect(await page.evaluate(()=>scrollY)).toBeLessThanOrEqual(4);
  await page.locator('#showcase').scrollIntoViewIfNeeded();await page.waitForTimeout(1200);
  const card=await page.locator('#showcase .magic-bento-card').first().boundingBox();expect(card).not.toBeNull();
  phases.push(await record(page,cdp,'MagicBento pointer 3s',()=>cadence(3000,i=>page.mouse.move(card!.x+80+Math.sin(i*.2)*40,Math.max(140,card!.y+100)+Math.cos(i*.2)*35))));
  const orb=await page.locator('.support-orb').boundingBox();expect(orb).not.toBeNull();
  phases.push(await record(page,cdp,'SupportOrb pointer 3s',()=>cadence(3000,i=>page.mouse.move(orb!.x+orb!.width/2+Math.sin(i*.2)*20,orb!.y+orb!.height/2+Math.cos(i*.2)*20))));
  const label=process.env.PERF_LABEL||'after';
  const result={label,cpuRate,chrome:browser.version(),viewport:'1440x900 @1x',cadenceMs:50,startup,
    finalMode:await page.evaluate(()=>document.documentElement.dataset.perf||'normal'),phases,errors};
  mkdirSync('.local/perf',{recursive:true});writeFileSync(`.local/perf/${label}-${cpuRate}x.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));await testInfo.attach('metrics',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(errors).toEqual([]);
  if(process.env.PERF_ENFORCE==='true')for(const phase of phases){
    expect.soft(phase.p95Ms,`${phase.phase}: p95`).toBeLessThanOrEqual(16.7);
    expect.soft(phase.above20Percent,`${phase.phase}: frames >20ms`).toBeLessThan(1);
    expect.soft(phase.onePercentLowFps,`${phase.phase}: 1% low`).toBeGreaterThanOrEqual(55);
    expect.soft(phase.longTaskCount,`${phase.phase}: long tasks`).toBe(0);
    expect.soft(phase.scriptMsPerFrame,`${phase.phase}: average script/frame`).toBeLessThan(4);
  }
});

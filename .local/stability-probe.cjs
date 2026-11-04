// Current methodology; legacy raw files are retained separately.
const {chromium}=require('@playwright/test'),fs=require('fs');
const traceMode=process.argv.includes('--trace');
function stats(rows){const a=rows.map(r=>r.dt).sort((a,b)=>a-b),n=a.length;if(!n)return {n:0};const q=p=>a[Math.max(0,Math.ceil(n*p)-1)],tail=a.slice(-Math.ceil(n*.01));return {n,median:q(.5),p95:q(.95),p99:q(.99),low1:1000/(tail.reduce((s,x)=>s+x,0)/tail.length),over833:a.filter(x=>x>8.33).length,over1667:a.filter(x=>x>16.67).length,longest:a[n-1]};}
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[];
 for(const width of traceMode?[390]:[360,390,430])for(let run=0;run<(traceMode?1:3);run++){
  const c=await b.newContext({viewport:{width,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await c.newPage();
  await p.addInitScript(()=>{
   Object.defineProperty(navigator,'webdriver',{get:()=>false});
   const data=window.frameAudit={frames:[],visibility:[],longTasks:[],events:[],marks:[]};let started=false,done=false,reveal=false,previous=null,phase='initialization',ring,tick,root;
   new PerformanceObserver(l=>data.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});
   document.addEventListener('visibilitychange',()=>data.visibility.push({t:performance.now(),hidden:document.hidden}));
   for(const name of ['intro:prewarm','intro:reveal','intro:done'])addEventListener(name,()=>{data.events.push({name,t:performance.now()});if(name==='intro:reveal')reveal=true;if(name==='intro:done')done=true});
   const frame=t=>{
    if(!root?.isConnected&&!done){root=document.querySelector('#site-intro');ring=root?.querySelector('.si-ring');tick=root?.querySelector('.si-tick')}
    const r=ring?parseFloat(ring.style.strokeDashoffset):NaN,k=tick?parseFloat(tick.style.strokeDashoffset):NaN;
    if(r>0&&r<1)started=true;
    const next=done?'idle':!started?'initialization':reveal?'reveal':r>0?'circle':k===1?'gap':k>0?'checkmark':'hold';
    if(next!==phase){phase=next;data.marks.push({phase,t});performance.mark('intro-audit:'+phase)}
    if(previous)data.frames.push({start:previous.t,end:t,dt:t-previous.t,phase:previous.phase===phase?phase:'boundary',active:!['initialization','idle'].includes(previous.phase),hidden:document.hidden||previous.hidden});
    previous={t,phase,hidden:document.hidden};
    if(!done||t-data.events.find(e=>e.name==='intro:done').t<500)requestAnimationFrame(frame);else data.complete=true;
   };requestAnimationFrame(frame);
  });
  let cd;if(traceMode){cd=await c.newCDPSession(p);await cd.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'})}
  await p.goto('http://127.0.0.1:3003/');await p.waitForFunction(()=>window.frameAudit.complete);
  const data=await p.evaluate(()=>({...window.frameAudit,resources:performance.getEntriesByType('resource').map(e=>({start:e.startTime,end:e.responseEnd,type:e.initiatorType})),fonts:document.fonts.status,hidden:document.hidden}));
  if(traceMode){const completed=new Promise(r=>cd.once('Tracing.tracingComplete',r));await cd.send('Tracing.end');const {stream}=await completed;let text='';while(true){const part=await cd.send('IO.read',{handle:stream});text+=part.data;if(part.eof)break}await cd.send('IO.close',{handle:stream});fs.writeFileSync('.local/fps-audit/methodology-trace.json',text)}
  const active=data.frames.filter(f=>f.active&&!f.hidden);
  for(const f of active){f.loading=data.resources.some(r=>r.start<f.end&&r.end>f.start);f.longTask=data.longTasks.some(r=>r.start<f.end&&r.start+r.duration>f.start)}
  const quiet=active.filter(f=>!f.loading),stages={};for(const stage of ['circle','gap','checkmark','hold','reveal'])stages[stage]=stats(quiet.filter(f=>f.phase===stage));
  const clusters=[];let cluster;for(const f of active){if(f.dt>8.33){if(!cluster||cluster.phase!==f.phase||cluster.end!==f.start){cluster={phase:f.phase,start:f.start,end:f.end,count:0,max:0,loading:0,longTasks:0};clusters.push(cluster)}cluster.end=f.end;cluster.count++;cluster.max=Math.max(cluster.max,f.dt);cluster.loading+=+f.loading;cluster.longTasks+=+f.longTask}else cluster=null}
  const row={width,run,startClass:'fresh-context; cold/warm cache state uncontrolled',initialization:stats(data.frames.filter(f=>f.phase==='initialization'&&!f.hidden)),invalid:data.hidden||data.visibility.some(e=>e.hidden)||data.frames.some(f=>f.hidden),raw:stats(active),quiet:stats(quiet),idle:stats(data.frames.filter(f=>f.phase==='idle'&&!f.hidden)),excludedLoading:active.length-quiet.length,stages,clusters,data};results.push(row);console.log(JSON.stringify({...row,data:undefined,clusters:undefined,stages:undefined,idle:undefined}));await c.close();
 }
 fs.writeFileSync(`.local/fps-audit/methodology-${traceMode?'diagnostic':'results'}.json`,JSON.stringify(results));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});

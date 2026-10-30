const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const num = new Intl.NumberFormat('en-US');
let current = null;
let visibleGeneration = 0;
let active = false;
let ready = false;
let worker;
let replayTimer = null;
let liveHistory = [];
let pendingConfig = null;
let hasRun = false;
const keys = ['size', 'population', 'generations'];
const labels = {quick_last:'QUICKSORT / LAST', quick_median3:'QUICKSORT / MEDIAN', insertion:'INSERTION SORT', merge:'MERGE SORT'};

function config() {
  return {
    algorithm:$('algorithm').value,
    size:Number($('size').value),
    population:Number($('population').value),
    generations:Number($('generations').value),
    seed:Number($('seed').value),
    mutation_rate:0.7,
    elites:2
  };
}
function updateControls(){
  for(const id of keys) $(id+'-value').textContent=$(id).value;
  const cfg=config();
  $('budget').textContent=num.format(cfg.population*(cfg.generations+1));
}
for(const id of keys) $(id).addEventListener('input',updateControls);
updateControls();
function svg(tag,attr={},text){
  const elem=document.createElementNS(NS,tag);
  for(const [name,value] of Object.entries(attr))elem.setAttribute(name,String(value));
  if(text!==undefined)elem.textContent=text;
  return elem;
}
function renderChart(history, selected, totalGenerations = history.length-1){
  const root=$('chart');root.replaceChildren();
  if(!history.length)return;
  const width=760,height=280,left=42,right=15,top=18,bottom=19;
  const innerW=width-left-right,innerH=height-top-bottom;
  const high=Math.max(1,...history.flatMap(x=>[x.best,x.random_best]));
  const low=Math.max(0,Math.floor(Math.min(...history.flatMap(x=>[x.best,x.random_best]))*.86));
  const maxY=Math.ceil(high*1.08);
  const scaleX=i=>left+innerW*i/Math.max(1,totalGenerations);
  const scaleY=value=>top+innerH*(1-(value-low)/Math.max(1,maxY-low));
  for(let i=0;i<5;i++){
    const value=low+(maxY-low)*(4-i)/4,y=scaleY(value);
    root.append(svg('line',{x1:left,x2:width-right,y1:y,y2:y,stroke:'#3a4138','stroke-dasharray':'3 7'}));
    root.append(svg('text',{x:left-9,y:y+4,fill:'#939c8f','font-size':'11','text-anchor':'end','font-family':'monospace'},String(Math.round(value))));
  }
  const seen=history.slice(0,selected+1);
  const draw=(key,color)=>{
    const points=seen.map((d,i)=>[scaleX(i),scaleY(d[key])]);
    const path=points.map(([x,y],i)=>`${i===0?'M':'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    root.append(svg('path',{d:path,fill:'none',stroke:color,'stroke-width':key==='best'?3.2:2.4,'stroke-linejoin':'round','stroke-linecap':'round'}));
    return points;
  };
  const baseline=draw('random_best','#fd7559');
  const evolved=draw('best','#eafa65');
  const point=evolved[evolved.length-1];
  if(point){
    root.append(svg('line',{x1:point[0],x2:point[0],y1:top,y2:height-bottom,stroke:'#7e8c66','stroke-dasharray':'4 6'}));
    root.append(svg('circle',{cx:point[0],cy:point[1],r:6,fill:'#eafa65',stroke:'#151712','stroke-width':3}));
    const other=baseline[baseline.length-1];
    root.append(svg('circle',{cx:other[0],cy:other[1],r:4.5,fill:'#fd7559'}));
  }
  $('axis-end').textContent='GEN '+totalGenerations;
}
function renderGenome(values){
  const root=$('genome');root.replaceChildren();
  if(!values?.length)return;
  for(const [i,v] of values.entries()){
    const bar=document.createElement('span');bar.className='gene';bar.style.height=(8+91*(v+1)/values.length)+'%';bar.title='Index '+i+' = '+v;root.append(bar);
  }
}
function updateScores(point){
  $('ga-score').textContent=num.format(point.best);
  $('random-score').textContent=num.format(point.random_best);
  const diff=point.best-point.random_best;
  $('advantage').textContent=(diff>0?'+':'')+num.format(diff);
  $('advantage').style.color=diff<0?'#fd7559':diff>0?'#eafa65':'#efeee7';
  $('finding').textContent=diff>0
    ? `Evolution leads random search by ${num.format(diff)} comparisons at this generation. Higher means a harder input.`
    : diff<0
      ? `Random search leads by ${num.format(-diff)} comparisons. Evolution is not guaranteed to win.`
      : 'Both search methods have found inputs with the same comparison count.';
}
function showGeneration(index){
  if(!current?.history.length)return;
  visibleGeneration=Math.max(0,Math.min(current.history.length-1,index));
  const point=current.history[visibleGeneration];
  $('timeline').value=String(visibleGeneration);
  $('generation-label').textContent='GENERATION '+String(visibleGeneration).padStart(2,'0');
  $('gen-count').textContent=`GENERATION ${visibleGeneration} / ${current.history.length-1}`;
  updateScores(point);
  renderChart(current.history,visibleGeneration);
  renderGenome(point.genome);
  $('genome').setAttribute('aria-label',`Best candidate at generation ${visibleGeneration}: ${point.genome.join(', ')}`);
  renderCross({other_algorithms:point.cross_algorithms||current.other_algorithms,config:current.config});
  $('replay-status').textContent=visibleGeneration===0?'INITIAL POPULATION — THESE ARE THE STARTING CANDIDATES.'
    :visibleGeneration===current.history.length-1?'LAST GENERATION — BEST INPUT FOUND AFTER THE SEARCH.'
    :`GENERATION ${visibleGeneration}: THE BEST-SO-FAR ARRAY AND ITS FITNESS.`;
}
function stopReplay(){
  if(replayTimer!==null){clearInterval(replayTimer);replayTimer=null;}
  $('play').textContent='▶ WATCH EVOLUTION';
  $('play').setAttribute('aria-pressed','false');
}
function playReplay(){
  if(!current || active || current.history.length<2)return;
  stopReplay();
  if(visibleGeneration>=current.history.length-1)showGeneration(0);
  $('play').textContent='Ⅱ PAUSE REPLAY';
  $('play').setAttribute('aria-pressed','true');
  $('live-state').textContent='REPLAY / STORED PYTHON RESULTS';
  replayTimer=setInterval(()=>{
    if(visibleGeneration>=current.history.length-1){
      stopReplay();$('live-state').textContent='REPLAY FINISHED';return;
    }
    showGeneration(visibleGeneration+1);
  },Number($('speed').value));
}
function renderCross(result){
  const root=$('cross-results');root.replaceChildren();
  const max=Math.max(...Object.values(result.other_algorithms),1);
  for(const [key,score] of Object.entries(result.other_algorithms)){
    const row=document.createElement('div');row.className='cross-row';
    const label=document.createElement('span');label.textContent=labels[key];
    const track=document.createElement('div');track.className='cross-track';
    const bar=document.createElement('div');bar.className='cross-bar'+(key===result.config.algorithm?' target':'');bar.style.width=score/max*100+'%';track.append(bar);
    const count=document.createElement('strong');count.textContent=String(score);
    row.append(label,track,count);root.append(row);
  }
}
function adopt(result,preview=false){
  stopReplay();
  current=result;
  liveHistory=[];
  $('timeline').max=String(result.history.length-1);
  $('live-state').textContent=preview?'SAMPLE EXPERIMENT — NOT LIVE':'PYTHON SEARCH FINISHED';
  for(const id of ['timeline','previous','next','copy','export','play'])$(id).disabled=false;
  if(preview){showGeneration(result.history.length-1);$('replay-status').textContent='PRELOADED SAMPLE — CLICK LAUNCH EVOLUTION TO RUN YOUR OWN AI EXPERIMENT.';}
  else if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    showGeneration(result.history.length-1);
    $('replay-status').textContent='SEARCH FINISHED. PRESS WATCH EVOLUTION TO REPLAY THE RESULTS.';
  }else{showGeneration(0);playReplay();}
}
function setRunning(on){
  active=on;
  $('run').disabled=on||!ready;
  $('run-label').textContent=on?'SEARCH IN PROGRESS…':'LAUNCH EVOLUTION';
  if(on){$('live-state').textContent='RUNNING / PYTHON';}
}
function handleMessage({data}){
  if(data.type==='status'){$('engine-status').textContent=data.message;return;}
  if(data.type==='ready'){
    ready=true;$('run').disabled=false;
    $('run-label').textContent='LAUNCH EVOLUTION';
    $('engine-status').textContent='● PYTHON ENGINE READY — RUNS LOCALLY';
    return;
  }
  if(data.type==='progress'){
    if(active){
      const point=data.value;
      liveHistory.push(point);
      $('live-state').textContent=`LIVE PYTHON SEARCH / GEN ${point.generation}`;
      $('generation-label').textContent='GENERATION '+String(point.generation).padStart(2,'0');
      $('gen-count').textContent=`LIVE GENERATION ${point.generation} / ${pendingConfig.generations}`;
      updateScores(point);
      renderChart(liveHistory,liveHistory.length-1,pendingConfig.generations);
      renderGenome(point.genome);
      renderCross({other_algorithms:point.cross_algorithms,config:pendingConfig});
      $('replay-status').textContent='SEARCHING IN PYTHON… ANIMATED REPLAY FOLLOWS THE RESULT.';
    }
    return;
  }
  if(data.type==='result'){
    setRunning(false);
    adopt(data.value);
    $('engine-status').textContent=`● COMPLETE · ${num.format(data.value.evaluations_per_strategy)} EVALUATIONS PER STRATEGY`;
    return;
  }
  if(data.type==='error'){
    setRunning(false);
    $('engine-status').textContent='ENGINE ERROR: '+data.message;
    $('live-state').textContent='ENGINE ERROR';
    $('replay-status').textContent='THE EXPERIMENT FAILED. REVIEW THE ENGINE ERROR AND RETRY.';
    for(const id of ['timeline','previous','next','copy','export','play'])$(id).disabled=true;
  }
}
$('run').addEventListener('click',()=>{
  if(active||!ready)return;
  const cfg=config();
  if(!Number.isSafeInteger(cfg.seed)||cfg.seed<0||cfg.seed>=2**32){$('engine-status').textContent='Seed must be an integer between 0 and 4294967295.';return;}
  stopReplay();
  hasRun=true;
  current=null;
  pendingConfig=cfg;
  liveHistory=[];
  for(const id of ['timeline','previous','next','copy','export','play'])$(id).disabled=true;
  setRunning(true);
  $('engine-status').textContent='Evolving permutations in Python…';
  worker.postMessage({type:'run',config:cfg});
});
$('timeline').addEventListener('input',event=>{stopReplay();showGeneration(Number(event.target.value));});
$('previous').addEventListener('click',()=>{stopReplay();showGeneration(visibleGeneration-1);});
$('next').addEventListener('click',()=>{stopReplay();showGeneration(visibleGeneration+1);});
$('play').addEventListener('click',()=>{if(replayTimer!==null){stopReplay();$('live-state').textContent='REPLAY PAUSED';}else playReplay();});
$('speed').addEventListener('change',()=>{if(replayTimer!==null)playReplay();});
$('copy').addEventListener('click',async()=>{
  if(!current)return;
  try{await navigator.clipboard.writeText(JSON.stringify(current.history[visibleGeneration].genome));
    $('copy').textContent='COPIED ✓';setTimeout(()=>$('copy').textContent='COPY ARRAY ↗',1200);
  }catch{$('copy').textContent='COPY FAILED';}
});
$('export').addEventListener('click',()=>{
  if(!current)return;
  const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='algohunter-experiment.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
});

// Render a reproducible report before the relatively large Python runtime loads.
fetch('./sample.json').then(response=>{if(!response.ok)throw Error('Preview unavailable');return response.json();}).then(result=>{
  if(!current && !hasRun && !active)adopt(result,true);
}).catch(()=>{if(!hasRun && !current)$('live-state').textContent='AWAITING EXPERIMENT';});
try{
  worker=new Worker('./worker.js');
  worker.addEventListener('message',handleMessage);
  worker.addEventListener('error',()=>handleMessage({data:{type:'error',message:'Worker failed. Serve this site over HTTP(S), not file://.'}}));
  worker.postMessage({type:'init'});
}catch(error){handleMessage({data:{type:'error',message:String(error.message||error)}});}

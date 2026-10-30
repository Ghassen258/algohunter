import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const sample = JSON.parse(readFileSync(new URL('../web/sample.json', import.meta.url), 'utf8'));

function browserStub() {
  const dom = new Map();
  const el = id => {
    if (!dom.has(id)) {
      dom.set(id, {
        value:({size:'32',population:'40',generations:'35',seed:'42',algorithm:'quick_last',speed:'1600'})[id] ?? '',
        disabled: false, textContent:'', innerHTML:'', style:{}, children:[], listeners:{}, attributes:{},
        addEventListener(type,fn){this.listeners[type]=fn;},
        setAttribute(name,value){this.attributes[name]=value;},
        replaceChildren(...children){this.children=[...children];},
        append(...children){this.children.push(...children);}
      });
    }
    return dom.get(id);
  };
  let tick = null;
  class WorkerMock {
    constructor(){this.events={};}
    addEventListener(name,fn){this.events[name]=fn;}
    postMessage(message){
      if(message.type==='init')this.events.message({data:{type:'ready'}});
      if(message.type==='run'){
        for(const value of sample.history)this.events.message({data:{type:'progress',value}});
        this.events.message({data:{type:'result',value:sample}});
      }
    }
  }
  const document={getElementById:el,createElement:()=>el('created'+Math.random()),createElementNS:()=>({setAttribute(){},textContent:'',children:[],append(child){this.children.push(child);}})};
  const context=vm.createContext({document,Worker:WorkerMock,fetch:async()=>({ok:true,json:async()=>sample}),
    Intl,JSON,Number,Math,Object,Array,String,console,globalThis:{matchMedia:()=>({matches:false})},
    setInterval(fn){tick=fn;return 1;},clearInterval(){tick=null;},setTimeout(){},
    navigator:{clipboard:{writeText:async()=>{}}}});
  vm.runInContext(source,context);
  return {el,getTick:()=>tick,context};
}

test('precomputed preview clearly labeled, Python run automatically replays generations', async()=>{
  const {el,getTick} = browserStub();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(el('live-state').textContent,/SAMPLE EXPERIMENT/);
  assert.equal(el('play').disabled,false);
  assert.match(el('replay-status').textContent,/PRELOADED SAMPLE/);

  el('run').listeners.click();
  assert.equal(el('live-state').textContent,'WATCHING 1 GENERATION AT A TIME');
  assert.equal(el('play').attributes['aria-pressed'],'true');
  assert.match(el('gen-count').textContent,/GENERATION 0 \/ 35/);
  assert.equal(el('ga-score').textContent,String(sample.history[0].best));
  assert.ok(getTick());

  getTick()();
  assert.match(el('gen-count').textContent,/GENERATION 1 \/ 35/);
  assert.equal(el('ga-score').textContent,String(sample.history[1].best));
  el('play').listeners.click();
  assert.equal(getTick(),null);
  assert.equal(el('play').attributes['aria-pressed'],'false');

  el('next').listeners.click();
  assert.match(el('gen-count').textContent,/GENERATION 2 \/ 35/);
  el('play').listeners.click();
  for(let i=0;i<35;i++)getTick()?.();
  assert.match(el('gen-count').textContent,/GENERATION 35 \/ 35/);
  assert.equal(el('ga-score').textContent,String(sample.history.at(-1).best));
  assert.equal(getTick(),null);
});

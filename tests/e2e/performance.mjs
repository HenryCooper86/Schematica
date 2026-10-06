export async function runPerformance({ js }) {
  return js(`(async()=>{
    const {Store,addNode,newDoc}=await import('/src/state.js');
    const {createRenderer,diagramMarkup}=await import('/src/render.js');
    const {searchBoard}=await import('/src/explore.js');
    const {checkDoc}=await import('/src/drc.js');
    const {checkLayout}=await import('/src/layout-checks.js');
    const {buildExportSVG}=await import('/src/export.js');
    const s=new Store();addNode(s,'generic',0,0);const template=s.doc.nodes[0];
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='position:fixed;left:0;top:0;width:1200px;height:800px';document.body.append(svg);
    const renderer=createRenderer(svg),results=[];
    const summarize=samples=>{samples.sort((a,b)=>a-b);return {samples:samples.length,medianMs:(samples[14]+samples[15])/2,p95Ms:samples[28],minMs:samples[0],maxMs:samples[29]};};
    const measure=fn=>{for(let i=0;i<3;i++)fn();const samples=[];for(let i=0;i<30;i++){const start=performance.now();fn();samples.push(performance.now()-start);}return summarize(samples);};
    for(const count of [100,500,1000]){
      const doc=newDoc('Benchmark '+count);doc.nodes=Array.from({length:count},(_,i)=>({...structuredClone(template),id:'n'+i,label:'Component '+i,x:(i%20)*300,y:Math.floor(i/20)*180}));
      doc.wires=Array.from({length:count-1},(_,i)=>({id:'w'+i,bus:'gpio',from:{node:'n'+i,port:'right'},to:{node:'n'+(i+1),port:'left'},label:'Signal '+i,arrow:null,style:null,flow:null}));
      const options={selection:new Set()},view={x:0,y:0,zoom:1};
      const render=measure(()=>{renderer.render(doc,view,options);svg.getBoundingClientRect();});
      const markup=measure(()=>diagramMarkup(doc));
      const drag=measure(()=>{doc.nodes[0].x++;renderer.render(doc,view,options);svg.getBoundingClientRect();});
      let selectionIndex=0;
      const selection=measure(()=>{options.selection=new Set(['n'+selectionIndex++]);renderer.render(doc,view,options);svg.getBoundingClientRect();});
      const frameSamples=[];
      for(let i=0;i<33;i++){const start=performance.now();doc.nodes[0].y++;renderer.render(doc,view,options);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(i>=3)frameSamples.push(performance.now()-start);}
      results.push({scheduledFrame:summarize(frameSamples),nodes:count,wires:doc.wires.length,render,markup,drag,selection,search:measure(()=>searchBoard(doc,'Component 9')),checks:measure(()=>checkDoc(doc)),layout:measure(()=>checkLayout(doc)),export:measure(()=>buildExportSVG(doc)),svgElements:svg.querySelectorAll('*').length,heapBytes:performance.memory?.usedJSHeapSize??null});
    }
    svg.remove();return {version:2,measurement:{samples:30,warmup:3,synchronous:'JavaScript renderer/analysis work, excluding event transport and paint',scheduledFrame:'Programmatic edit through two animation frames; scheduling proxy, not native input-to-paint latency'},userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,results};
  })()`);
}

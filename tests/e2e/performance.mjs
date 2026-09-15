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
    const measure=fn=>{const samples=[];let value;for(let i=0;i<5;i++){const start=performance.now();value=fn();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);return {medianMs:samples[2],p95Ms:samples[4]};};
    for(const count of [100,500,1000]){
      const doc=newDoc('Benchmark '+count);doc.nodes=Array.from({length:count},(_,i)=>({...structuredClone(template),id:'n'+i,label:'Component '+i,x:(i%20)*300,y:Math.floor(i/20)*180}));
      doc.wires=Array.from({length:count-1},(_,i)=>({id:'w'+i,bus:'gpio',from:{node:'n'+i,port:'right'},to:{node:'n'+(i+1),port:'left'},label:'Signal '+i,arrow:null,style:null,flow:null}));
      const options={selection:new Set()},view={x:0,y:0,zoom:1};
      const render=measure(()=>{renderer.render(doc,view,options);svg.getBoundingClientRect();});
      const markup=measure(()=>diagramMarkup(doc));
      const drag=measure(()=>{doc.nodes[0].x++;renderer.render(doc,view,options);svg.getBoundingClientRect();});
      results.push({nodes:count,wires:doc.wires.length,render,markup,drag,search:measure(()=>searchBoard(doc,'Component 9')),checks:measure(()=>checkDoc(doc)),layout:measure(()=>checkLayout(doc)),export:measure(()=>buildExportSVG(doc)),svgElements:svg.querySelectorAll('*').length,heapBytes:performance.memory?.usedJSHeapSize??null});
    }
    svg.remove();return {version:1,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGiB:navigator.deviceMemory??null,results};
  })()`);
}

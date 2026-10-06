export async function runEnhancementChecks({ js, check }) {
  const results = await js(`(async()=>{
    const {EXAMPLES}=await import('/src/examples.js');
    const {createRenderer}=await import('/src/render.js');
    const {renderChangePreview}=await import('/src/ui/change-preview.js');
    const before=structuredClone(EXAMPLES.find(e=>e.id==='declared-uart-reference').doc);
    const after=structuredClone(before);
    after.nodes[0].x+=100;
    after.nodes.push({...structuredClone(after.nodes[0]),id:'added-part',label:'Added part',x:1800});
    const oldLast=after.nodes.splice(4,1)[0];after.wires=after.wires.filter(w=>w.from.node!==oldLast.id&&w.to.node!==oldLast.id);
    after.wires[0].to={node:after.nodes[2].id,port:'left'};
    const host=document.createElement('div');document.body.append(host);
    const snapshot=JSON.stringify(before);
    renderChangePreview(host,before,after);
    const svgs=host.querySelectorAll('svg');
    const visual={sharedScale:svgs.length===2&&svgs[0].getAttribute('viewBox')===svgs[1].getAttribute('viewBox'),
      highlights:!!host.querySelector('.delta-added')&&!!host.querySelector('.delta-removed')&&!!host.querySelector('.delta-rewired')&&!!host.querySelector('.delta-moved'),
      unchanged:JSON.stringify(before)===snapshot};
    const focus=host.querySelector('[data-change-focus]');focus.value='0';focus.dispatchEvent(new Event('change'));
    visual.focus=!!host.querySelector('.delta-focus')&&!!host.querySelector('.delta-muted');host.remove();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);
    const renderer=createRenderer(svg),doc=structuredClone(before),ui={selection:new Set()};
    renderer.renderDiagram(doc,ui);
    const node=svg.querySelector('.node'),wire=svg.querySelector('.wire'),unchanged=svg.querySelectorAll('.node')[3];
    const path=wire.querySelector('path').getAttribute('d');
    doc.nodes[0].x+=50;renderer.renderDiagram(doc,ui);
    const incremental={stable:svg.querySelectorAll('.node')[3]===unchanged,
      moved:svg.querySelector('.node')!==node&&svg.querySelector('.wire').querySelector('path').getAttribute('d')!==path};
    const stable=svg.querySelectorAll('.node')[3];ui.selection.add(doc.nodes[1].id);renderer.renderDiagram(doc,ui);
    incremental.selection=svg.querySelectorAll('.node')[3]===stable;
    doc.nodes.reverse();renderer.renderDiagram(doc,ui);
    incremental.order=[...svg.querySelectorAll('.node')].map(n=>n.dataset.id).join()===doc.nodes.map(n=>n.id).join();
    doc.nodes.pop();doc.wires=[];renderer.renderDiagram(doc,ui);
    incremental.removal=svg.querySelectorAll('.node').length===doc.nodes.length&&!svg.querySelector('.wire');
    renderer.renderDiagram(before,{});incremental.restore=svg.querySelectorAll('.node').length===before.nodes.length;
    svg.remove();return {visual,incremental};
  })()`);
  check('visual previews share scale and mark additions, removals, rewiring, and movement', results.visual.sharedScale && results.visual.highlights);
  check('visual preview focus highlights changes without editing the source', results.visual.focus && results.visual.unchanged);
  check('drag redraw preserves unaffected SVG items while updating the moved node and connected wire', results.incremental.stable && results.incremental.moved);
  check('selection redraw preserves unrelated SVG items', results.incremental.selection);
  check('incremental rendering preserves stacking order, removes deleted items, and restores snapshots', results.incremental.order && results.incremental.removal && results.incremental.restore);
}

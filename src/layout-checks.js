import { nodeRect, wireScene, curveIntersectsRect, rectsIntersect } from './geometry.js';
import { tr } from './i18n.js';

export { curveIntersectsRect } from './geometry.js';

export function checkLayout(doc, limit = 200) {
  const findings = [];
  const byId = new Map(doc.nodes.map(n => [n.id,n]));
  const nodes = doc.nodes.map(n=>({node:n,rect:nodeRect(n)}));
  const { routes, labels } = wireScene(doc);
  const wires = doc.wires.filter(w=>byId.has(w.from.node)&&byId.has(w.to.node)).map(w=> {
    return {wire:w,geo:routes.get(w.id),label:labels.get(w.id)};
  });
  const add = (rule,ids,message,evidence,suggestion,supportedFixes=[]) => {
    findings.push({level:'warning',rule,ids,message,evidence,suggestion,supportedFixes});
    return findings.length >= limit;
  };
  const overlap = (a,b) => ({width:Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),height:Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)});
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) {
    const a=nodes[i],b=nodes[j];
    if(rectsIntersect(a.rect,b.rect) && add('layout/node-overlap',[a.node.id,b.node.id],tr('{a} overlaps {b}.',{a:a.node.label,b:b.node.label}),overlap(a.rect,b.rect),tr('Move one of these parts until their cards no longer overlap.'))) return findings;
  }
  for(const entry of wires) for(const {node,rect} of nodes) {
    const {wire,geo,label}=entry;
    if(label.label && rectsIntersect(label,rect) && add('layout/label-node-overlap',[wire.id,node.id],tr('A wire label overlaps {name}.',{name:node.label}),{label:label.label,...overlap(label,rect)},tr('Move the part or shorten the wire label while keeping its meaning.'),['update_wire.label'])) return findings;
    if(node.id!==wire.from.node&&node.id!==wire.to.node&&curveIntersectsRect(geo,rect)
      && add('layout/wire-through-node',[wire.id,node.id],tr('A wire crosses the card for {name}.',{name:node.label}),{tolerancePx:.5},tr('Move the crossed part or a connected endpoint to give the wire a clear path.'))) return findings;
  }
  for(let i=0;i<wires.length;i++) for(let j=i+1;j<wires.length;j++) {
    const a=wires[i],b=wires[j];
    if(a.label.label&&b.label.label&&rectsIntersect(a.label,b.label)
      && add('layout/label-overlap',[a.wire.id,b.wire.id],tr('Two wire labels overlap.'),overlap(a.label,b.label),tr('Shorten a wire label or move an endpoint to separate the labels.'),['update_wire.label'])) return findings;
  }
  return findings;
}

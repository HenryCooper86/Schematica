// Compare importer connectivity against an independently parsed KiCad export.
export async function runKiCadChecks({ js, check, manifest }) {
  const results = [];
  for (const fixture of manifest.fixtures) {
    const result = await js(`(async()=>{
      const {importKiCad}=await import('/src/kicad.js');
      const {serialize,deserialize}=await import('/src/serialize.js');
      const response=await fetch(${JSON.stringify(fixture.url)});if(!response.ok)throw Error('Fixture fetch failed');
      const xml=await response.text();let doc;
      try{doc=importKiCad(xml)}catch(error){return {rejected:true,message:error.message}}
      const {doc:restored,warnings}=deserialize(serialize(doc));
      const components=restored.nodes.filter(n=>!n.id.startsWith('net'));
      const byId=new Map(restored.nodes.map(n=>[n.id,n]));
      const nets=restored.nodes.filter(n=>n.id.startsWith('net')).map(n=>({name:n.label,pins:restored.wires.filter(w=>w.to.node===n.id).map(w=>{const part=byId.get(w.from.node);return [part.label,part.part.ports.find(p=>p.id===w.from.port).name]}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>a.name.localeCompare(b.name));
      const transfer=new DataTransfer();transfer.items.add(new File([serialize(restored)],'kicad.json'));const input=document.getElementById('file-input');input.files=transfer.files;input.dispatchEvent(new Event('change'));
      return {components:components.map(n=>n.label).sort(),nets,warnings,wires:restored.wires.length,nodes:restored.nodes.length};
    })()`);
    if (fixture.expectedRejection) {
      check(`${fixture.name}: unsupported pin count is rejected explicitly`, result.rejected && result.message.includes(`${manifest.portLimit} connected pins`), result.message);
    } else {
      check(`${fixture.name}: KiCad component references survive save/reload`, JSON.stringify(result.components) === JSON.stringify(fixture.components), {components:result.components?.length,expected:fixture.components.length,error:result.message});
      // Compare sets independent of locale sorting used by the native browser.
      const normalize = nets => nets?.map(n=>JSON.stringify([n.name,n.pins.map(p=>JSON.stringify(p)).sort()])).sort();
      check(`${fixture.name}: every net and connected pin survives save/reload`, JSON.stringify(normalize(result.nets)) === JSON.stringify(normalize(fixture.nets)), {nets:result.nets?.length,wires:result.wires});
      check(`${fixture.name}: no import normalization warnings`, result.warnings?.length === 0, result.warnings);
      check(`${fixture.name}: imported board renders all parts and net junctions`, await js(`document.querySelectorAll('#canvas .node').length===${result.nodes}`));
    }
    results.push({name:fixture.name,...result});
  }
  return results;
}

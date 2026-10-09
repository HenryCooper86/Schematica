// Real browser geometry catches controls that render outside their modal card.
export async function runLayoutChecks({ js, send, check, sleep, screenshot }) {
  const noteResults = await js(`(async()=>{
    const {diagramMarkup}=await import('/src/render.js');
    const {buildExportSVG}=await import('/src/export.js');
    const texts=[
      'Check camera compatibility against https://d-robotics.github.io/rdk_doc/en/Quick_start/accessory/overview/',
      'W'.repeat(70),
      '接口说明：ESP32-S3、CSI、UART。'+'👩🏽‍🔧'.repeat(18)
    ];
    const doc={schema:1,title:'Note wrapping',nodes:[],wires:[],zones:[],journey:[],notes:texts.map((text,i)=>({id:'note-wrap-'+i,x:20+i*180,y:20,text}))};
    const fixture=document.createElement('div');document.body.append(fixture);
    const results=[];
    try {
      for(const exported of [false,true]) for(const zoom of [0.53,1,2]) {
        fixture.innerHTML=exported?buildExportSVG(doc):'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">'+diagramMarkup(doc)+'</svg>';
        fixture.style.transform='scale('+zoom+')';
        const notes=[...fixture.querySelectorAll('.note')];
        const failures=[];
        for(const [i,note] of notes.entries()) {
          const box=note.querySelector('rect').getBoundingClientRect();
          const lines=[...note.querySelectorAll('text')];
          // Fractional zoom introduces subpixel rounding in DOM rectangles.
          for(const line of lines) {const r=line.getBoundingClientRect();if(r.left<box.left+9*zoom-0.1||r.right>box.right-9*zoom+0.1||r.top<box.top-0.1||r.bottom>box.bottom+0.1) failures.push({text:line.textContent,line:r.toJSON(),box:box.toJSON()});}
          if(lines.map(t=>t.textContent).join('').replace(/\\s/g,'')!==texts[i].replace(/\\s/g,'')) failures.push('lost text');
        }
        results.push({exported,zoom,notes:notes.length,failures});
      }
    } finally {fixture.remove();}
    return results;
  })()`);
  for (const result of noteResults) check(`note text stays within its border at ${result.zoom}x in ${result.exported ? 'SVG export' : 'canvas markup'}`, result.notes===3&&!result.failures.length, JSON.stringify(result));
  const cases = [
    ['export-dialog', "document.getElementById('btn-export').click()"],
    ['drc-dialog', "document.getElementById('btn-check').click()"],
    ['bom-dialog', "document.getElementById('btn-bom').click()"],
    ['shortcuts-dialog', "document.getElementById('btn-shortcuts').click()"],
    ['rec-dialog', "document.getElementById('btn-rec').click()"],
    ['part-dialog', "document.getElementById('parts-new').click()"],
    ['compare-dialog', "document.getElementById('compare-dialog').showModal()"],
  ];
  for (const lang of ['en', 'zh']) {
    await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('${lang}')})()`);
    for (const [width, height] of [[1366,768],[390,844],[320,568],[844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      for (const [id, open] of cases) {
        await js(`${open};true`);
        await sleep(30);
        const result = await js(`(()=>{
          const dialog=document.getElementById('${id}'),card=dialog.querySelector('.rec-card, .review-card'),r=card.getBoundingClientRect();
          const actions=[...card.querySelectorAll('.rec-buttons button')].filter(b=>b.getClientRects().length);
          const escaped=actions.filter(b=>{const a=b.getBoundingClientRect();return a.left<r.left-1||a.right>r.right+1}).map(b=>b.id);
          const last=actions.at(-1);last?.scrollIntoView({block:'nearest'});
          const end=last?.getBoundingClientRect();
          return {open:dialog.open,width:card.clientWidth,scrollWidth:card.scrollWidth,escaped,
            fits:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,
            reachable:!end||(end.top>=0&&end.bottom<=innerHeight)};
        })()`);
        check(`${id} contains controls at ${width}x${height} (${lang})`, result.open && result.fits && result.scrollWidth <= result.width+1 && !result.escaped.length && result.reachable, JSON.stringify(result));
        if (screenshot && id==='export-dialog' && lang==='en' && (width===1366||width===390)) {
          await js(`document.querySelector('#export-dialog .rec-card').scrollTop=0;true`);
          await screenshot(`/tmp/schematica-export-${width}.png`);
        }
        await js(`document.getElementById('${id}').close();true`);
      }
      await js(`document.getElementById('btn-examples').click();true`);
      const menu = await js(`(()=>{const m=document.getElementById('examples-menu');m.querySelector('button:last-child').scrollIntoView({block:'nearest'});const r=m.getBoundingClientRect(),last=m.querySelector('button:last-child').getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,width:m.clientWidth,scrollWidth:m.scrollWidth,lastVisible:last.bottom<=r.bottom+1}})()`);
      check(`example menu stays in the viewport and its last entry is reachable at ${width}x${height} (${lang})`, menu.fits&&menu.lastVisible&&menu.scrollWidth<=menu.width+1, JSON.stringify(menu));
      await js(`document.getElementById('btn-examples').click();document.getElementById('btn-engineering').click();true`);
      const tabs = await js(`[...document.querySelectorAll('#engineering-dialog nav [data-tab]')].map(b=>b.dataset.tab)`);
      for (const tab of tabs) {
        await js(`document.querySelector('#engineering-dialog [data-tab="${tab}"]').click();true`);
        const result = await js(`(()=>{const d=document.getElementById('engineering-dialog'),b=document.getElementById('engineering-body'),r=d.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,width:b.clientWidth,scrollWidth:b.scrollWidth,height:b.clientHeight}})()`);
        check(`engineering ${tab} fits at ${width}x${height} (${lang})`,result.fits&&result.scrollWidth<=result.width+1&&result.height>0,JSON.stringify(result));
      }
      await js(`document.querySelector('#engineering-dialog [data-action=close]').click();true`);
      await js(`(async()=>{const {Store}=await import('/src/state.js');const {EXAMPLES}=await import('/src/examples.js');const {createEditPreview}=await import('/src/ai/preview.js');const {showEditPreview}=await import('/src/ui/ai-preview.js');const s=new Store(structuredClone(EXAMPLES.find(e=>e.id==='declared-uart-reference').doc));const p=createEditPreview(s);p.draft.doc.nodes[0].x+=100;showEditPreview(p,()=>{});})()`);
      const preview = await js(`(()=>{const d=document.getElementById('ai-preview-dialog'),r=d.getBoundingClientRect(),b=d.querySelector('#ai-preview-apply');b.scrollIntoView({block:'nearest'});const a=b.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,width:d.clientWidth,scrollWidth:d.scrollWidth,reachable:a.top>=0&&a.bottom<=innerHeight}})()`);
      check(`visual change preview fits and apply is reachable at ${width}x${height} (${lang})`,preview.fits&&preview.scrollWidth<=preview.width+1&&preview.reachable,JSON.stringify(preview));
      await js(`document.getElementById('ai-preview-discard').click();true`);
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('en')})()`);
}

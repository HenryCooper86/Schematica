// Real browser geometry catches controls that render outside their modal card.
export async function runLayoutChecks({ js, send, check, sleep, screenshot }) {
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
    }
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await js(`(async()=>{const {setLang}=await import('/src/i18n.js');setLang('en')})()`);
}

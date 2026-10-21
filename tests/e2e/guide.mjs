export async function runGuideChecks({ send, js, check, origin, sleep }) {
  let editorReady = false;
  await send('Page.navigate', { url: origin + '/' });
  for (let i = 0; i < 60; i++) {
    if (await js(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.getElementById('security-panel')`).catch(() => false)) { editorReady = true; break; }
    await sleep(50);
  }
  if (!editorReady) throw Error('Editor did not initialize before checking toolbar documentation.');
  const toolbarControls = await js(`[...document.querySelectorAll('#toolbar button, #toolbar a')].map(control => control.dataset.tool || control.id).filter(Boolean)`);
  const before = await js(`localStorage.getItem('schematica.autosave')`);
  await send('Page.navigate', { url: origin + '/guide.html' });
  for (let i = 0; i < 60; i++) {
    if (await js(`!!document.querySelector('[data-guide-part]')`)) break;
    await sleep(50);
  }
  const missingControls = await js(`(() => {
    const documented = new Set([...document.querySelectorAll('#guide-toolbar-reference [data-guide-control]')].map(entry => entry.dataset.guideControl));
    return ${JSON.stringify(toolbarControls)}.filter(id => !documented.has(id));
  })()`);
  check('the illustrated guide documents every rendered toolbar control', missingControls.length === 0, missingControls.join(', '));
  check('reading the guide leaves the working board untouched', await js(`localStorage.getItem('schematica.autosave')`) === before);
  await js(`document.getElementById('guide-part-search').value = 'servo'; document.getElementById('guide-part-search').dispatchEvent(new Event('input')); true`);
  check('palette search opens matching categories and shows the actual part badges and ports', await js(`!!document.querySelector('[data-guide-part="servo"] svg') && document.querySelector('[data-guide-part="servo"]').getBoundingClientRect().height > 0 && !document.querySelector('[data-guide-part="battery"]') && document.querySelector('[data-guide-part="servo"]').textContent.includes('Default ports:')`));
  await js(`document.getElementById('btn-lang').click(); true`);
  check('guide descriptions and headings switch to Chinese while retaining search', await js(`document.documentElement.lang === 'zh-CN' && document.getElementById('toolbar-reference').textContent.includes('选择与移动') && document.getElementById('guide-part-search').value === 'servo' && document.querySelector('[data-guide-part="servo"]').textContent.includes('默认端口')`));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await js(`document.getElementById('guide-part-search').scrollIntoView(); true`);
  check('narrow guide keeps icons and explanations within the viewport', await js(`document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.guide-control')].every(el => el.getBoundingClientRect().right <= innerWidth + 1)`));
  await js(`document.getElementById('btn-lang').click(); document.getElementById('guide-part-search').value = ''; document.getElementById('guide-part-search').dispatchEvent(new Event('input')); true`);
  check('clearing search restores all palette categories and English descriptions', await js(`(async () => { const { CATEGORIES, PARTS } = await import('/src/palette.js'); return document.querySelectorAll('.guide-category').length === CATEGORIES.length && document.querySelectorAll('[data-guide-part]').length === Object.keys(PARTS).length && document.getElementById('toolbar-reference').textContent.includes('Select / move'); })()`));
  await send('Emulation.clearDeviceMetricsOverride');
}

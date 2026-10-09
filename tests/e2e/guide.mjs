export async function runGuideChecks({ send, js, check, origin, sleep }) {
  await send('Page.navigate', { url: origin + '/' });
  for (let i = 0; i < 60; i++) {
    if (await js(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete' && !!document.getElementById('btn-guide')`).catch(() => false)) break;
    await sleep(50);
  }
  const before = await js(`localStorage.getItem('schematica.autosave')`);
  await send('Page.navigate', { url: origin + '/guide.html' });
  for (let i = 0; i < 60; i++) {
    if (await js(`document.querySelectorAll('[data-guide-part]').length === 107`)) break;
    await sleep(50);
  }
  check('illustrated guide contains toolbar symbols and all catalogue parts', await js(`document.querySelectorAll('#guide-toolbar-reference [data-guide-control]').length === 37 && document.querySelectorAll('[data-guide-part]').length === 107 && document.querySelectorAll('#guide-panel-reference svg').length >= 20`));
  check('reading the guide leaves the working board untouched', await js(`localStorage.getItem('schematica.autosave')`) === before);
  await js(`document.getElementById('guide-part-search').value = 'servo'; document.getElementById('guide-part-search').dispatchEvent(new Event('input')); true`);
  check('palette search opens matching categories and shows the actual part badges and ports', await js(`!!document.querySelector('[data-guide-part="servo"] svg') && document.querySelector('[data-guide-part="servo"]').getBoundingClientRect().height > 0 && !document.querySelector('[data-guide-part="battery"]') && document.querySelector('[data-guide-part="servo"]').textContent.includes('Default ports:')`));
  await js(`document.getElementById('btn-lang').click(); true`);
  check('guide descriptions and headings switch to Chinese while retaining search', await js(`document.documentElement.lang === 'zh-CN' && document.getElementById('toolbar-reference').textContent.includes('选择与移动') && document.getElementById('guide-part-search').value === 'servo' && document.querySelector('[data-guide-part="servo"]').textContent.includes('默认端口')`));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await js(`document.getElementById('guide-part-search').scrollIntoView(); true`);
  check('narrow guide keeps icons and explanations within the viewport', await js(`document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('.guide-control')].every(el => el.getBoundingClientRect().right <= innerWidth + 1)`));
  await js(`document.getElementById('btn-lang').click(); document.getElementById('guide-part-search').value = ''; document.getElementById('guide-part-search').dispatchEvent(new Event('input')); true`);
  check('clearing search restores all palette categories and English descriptions', await js(`document.querySelectorAll('.guide-category').length === 13 && document.querySelectorAll('[data-guide-part]').length === 107 && document.getElementById('toolbar-reference').textContent.includes('Select / move')`));
  await send('Emulation.clearDeviceMetricsOverride');
}

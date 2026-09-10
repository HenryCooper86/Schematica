import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme, getTheme, setThemePreference, getThemePreference, exportThemeStyles } from '../src/theme.js';
import { buildExportSVG, copyPNG } from '../src/export.js';
import { newDoc } from '../src/state.js';

test('theme preference persists independently of the board and follows system changes', () => {
  const values = new Map(); const media = {matches:false,addEventListener(){},removeEventListener(){}};
  initTheme({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},media});
  assert.equal(getTheme(),'dark');setThemePreference('system');assert.equal(getTheme(),'dark');
  media.matches=true;assert.equal(getTheme(),'light');assert.equal(getThemePreference(),'system');
  setThemePreference('light');assert.equal(values.get('schematica.theme'),'light');
  assert.equal(newDoc().theme,undefined);initTheme();
});
test('light and automatic SVG exports carry scoped theme styles and preserve semantic accents',()=>{
  const doc=newDoc();doc.nodes=[{id:'a',kind:'mcu',label:'A',x:0,y:0,color:'#ff00ff'}];
  const light=buildExportSVG(doc,{theme:'light'}),auto=buildExportSVG(doc,{theme:'auto'});
  assert.match(light,/data-export-theme="light"/);assert.match(light,/stop-color:#fff/);assert.match(light,/#ff00ff/);
  assert.match(auto,/@media\(prefers-color-scheme:light\)/);
  assert.equal(exportThemeStyles('invalid'), '');
  assert.doesNotMatch(buildExportSVG(doc,{theme:'dark'}),/data-export-theme/);
});
test('clipboard unsupported environments reject cleanly', async()=>{
  await assert.rejects(copyPNG('<svg/>',{},null,null),/unavailable/);
});

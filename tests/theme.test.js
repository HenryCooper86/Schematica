import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme, getTheme, setThemePreference, getThemePreference, onThemeChange, exportThemeStyles } from '../src/theme.js';
import { buildExportSVG, copyPNG } from '../src/export.js';
import { newDoc } from '../src/state.js';
import * as theme from '../src/theme.js';

test('theme preference persists independently of the board and follows system changes', () => {
  const values = new Map(); const media = {matches:false,addEventListener(){},removeEventListener(){}};
  initTheme({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},media});
  assert.equal(getTheme(),'dark');setThemePreference('system');assert.equal(getTheme(),'dark');
  media.matches=true;assert.equal(getTheme(),'light');assert.equal(getThemePreference(),'system');
  setThemePreference('light');assert.equal(values.get('schematica.theme'),'light');
  assert.equal(newDoc().theme,undefined);initTheme();
});

function mediaQuery(matches) {
  const listeners = new Set();
  return {
    matches,
    addEventListener(type, fn) { if (type === 'change') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'change') listeners.delete(fn); },
    change(value) { this.matches = value; for (const fn of listeners) fn(); },
  };
}

test('new devices default to System and notify the interface when system appearance changes', () => {
  const media = mediaQuery(true), seen = [];
  const off = onThemeChange(theme => seen.push(theme));
  try {
    initTheme({ media });
    assert.equal(getThemePreference(), 'system');
    assert.equal(getTheme(), 'light');
    media.change(false);
    assert.equal(getTheme(), 'dark');
    assert.deepEqual(seen, ['light', 'dark']);
    setThemePreference('light');
    media.change(true); media.change(false);
    assert.equal(getTheme(), 'light', 'an explicit choice overrides the operating system');
  } finally { off(); initTheme(); }
});

test('saved mode survives initialization and invalid or unavailable storage falls back to System', () => {
  try {
    for (const preference of ['light', 'dark', 'system']) {
      initTheme({ storage: { getItem: () => preference }, media: mediaQuery(true) });
      assert.equal(getThemePreference(), preference);
      assert.equal(getTheme(), preference === 'system' ? 'light' : preference);
    }
    initTheme({ storage: { getItem: () => 'obsolete' }, media: mediaQuery(true) });
    assert.equal(getThemePreference(), 'system');
    assert.equal(getTheme(), 'light');
    initTheme({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, media: mediaQuery(false) });
    assert.equal(getThemePreference(), 'system');
    setThemePreference('light');
    assert.equal(getTheme(), 'light', 'switching still works with blocked storage');
  } finally { initTheme(); }
});

test('reinitialization stops listening to the previous system appearance query', () => {
  const first = mediaQuery(false), second = mediaQuery(true), seen = [];
  initTheme({ media: first });
  initTheme({ media: second });
  const off = onThemeChange(theme => seen.push(theme));
  try {
    first.change(true);
    assert.deepEqual(seen, []);
    second.change(false);
    assert.deepEqual(seen, ['dark']);
  } finally { off(); initTheme(); }
});

test('click cycling goes Light → Dark → System and remembers each choice', () => {
  const saved = [], media = mediaQuery(false);
  initTheme({ storage: { getItem: () => 'system', setItem: (key, value) => saved.push([key, value]) }, media });
  try {
    for (const [mode, resolved] of [['light', 'light'], ['dark', 'dark'], ['system', 'dark'], ['light', 'light']]) {
      theme.cycleThemePreference();
      assert.equal(getThemePreference(), mode);
      assert.equal(getTheme(), resolved);
    }
    assert.deepEqual(saved.map(([key, value]) => { assert.equal(key, 'schematica.theme'); return value; }), ['light', 'dark', 'system', 'light']);
    setThemePreference('system');
    media.change(true);
    assert.equal(getThemePreference(), 'system');
    assert.equal(theme.nextThemePreference(), 'light', 'the next mode follows the saved choice, not the resolved OS theme');
  } finally { initTheme(); }
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

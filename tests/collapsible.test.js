import test from 'node:test';
import assert from 'node:assert/strict';
import { panelHeader } from '../src/ui/collapsible.js';

test('panelHeader escapes the title it interpolates', () => {
  const html = panelHeader('<img src=x onerror=alert(1)> & "quoted"', 'props');
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'), html);
  assert.ok(html.includes('data-panel="props"'));
});

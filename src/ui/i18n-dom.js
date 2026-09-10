// Translates the markup that was present at load, in place. The first call
// walks the listed roots and remembers every text node and attribute it
// touched together with its original English; every later call replays that
// list and never walks the DOM again, so a language switch retranslates
// exactly what the walk saw and nothing else. Anything rendered after load
// translates itself: the self-rendering panels (props, journey, assistant,
// legend, examples menu, toast, palette body) and the dialog bodies (the BOM
// table, the design-rule list, the part editor's rows) redraw through
// onLanguageChange. Two opt-outs keep the replay off state-dependent text:
// `data-i18n="off"` for an element's own text, `data-i18n-attrs="off"` for
// its title/placeholder/aria-label.
import { trd, getLang, setLang, onLanguageChange } from '../i18n.js';

// #hintbar is not here: it is built from the shortcut table and redrawn on a
// language switch, so it has nothing for the static walk to remember.
const ROOTS = ['#toolbar', '#explore-panel', '#canvas', '#palette-search', '#present-overlay', 'dialog'];
const ATTRS = ['title', 'placeholder', 'aria-label'];
const LETTER = /[A-Za-z]/;
const originals = new WeakMap(); // node -> { text, lead, tail } | { attrs: { name: original } }
const touched = []; // every node the walk remembered, in visit order
let walked = false;

// Re-applies a remembered original in the current language. Replaying the
// remembered text (never the live nodeValue) is what makes switching back and
// forth lossless.
function apply(node) {
  const rec = originals.get(node);
  if (!rec) return;
  if (rec.attrs) {
    for (const [a, original] of Object.entries(rec.attrs)) node.setAttribute(a, trd(original));
  } else {
    node.nodeValue = rec.lead + trd(rec.text) + rec.tail;
  }
}

function remember(node, rec) {
  originals.set(node, rec);
  touched.push(node);
  apply(node);
}

function translateText(node) {
  if (originals.has(node)) return;
  // The walk runs once, on the original English, so this is the one point
  // where testing the live text for a letter (skipping bare whitespace and
  // punctuation nodes) is meaningful.
  const raw = node.nodeValue;
  const trimmed = raw.trim();
  if (!LETTER.test(trimmed)) return;
  const lead = raw.slice(0, raw.indexOf(trimmed));
  const tail = raw.slice(raw.indexOf(trimmed) + trimmed.length);
  remember(node, { text: trimmed, lead, tail });
}

function translateAttrs(el) {
  if (originals.has(el)) return;
  // An element whose title/aria-label depends on state (the palette and panel
  // toggles say Hide or Show) writes them itself and translates them on a
  // language change: replaying the load-time value would undo that.
  if (el.getAttribute('data-i18n-attrs') === 'off') return;
  const attrs = {};
  for (const a of ATTRS) if (el.hasAttribute(a) && LETTER.test(el.getAttribute(a))) attrs[a] = el.getAttribute(a);
  if (Object.keys(attrs).length) remember(el, { attrs });
}

function walk(el, textOff) {
  if (el.nodeType !== 1) return;
  translateAttrs(el);
  const off = textOff || el.getAttribute('data-i18n') === 'off';
  for (const child of [...el.childNodes]) {
    if (child.nodeType === 3) {
      if (!off) translateText(child);
    } else if (child.nodeType === 1 && !['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'SVG', 'svg', 'KBD', 'CODE'].includes(child.tagName)) {
      walk(child, off);
    } else if (child.nodeType === 1) {
      translateAttrs(child); // inputs keep their value but translate placeholder/title/aria-label
    }
  }
}

export function translateStatic() {
  if (walked) {
    for (const node of touched) apply(node);
    return;
  }
  walked = true;
  for (const sel of ROOTS) {
    for (const el of document.querySelectorAll(sel)) walk(el, false);
  }
}

// The toolbar switch shows the language it would switch to.
export function initLanguageSwitch(button) {
  const paint = () => { button.textContent = getLang() === 'zh' ? 'EN' : '中文'; };
  button.addEventListener('click', () => setLang(getLang() === 'zh' ? 'en' : 'zh'));
  onLanguageChange(() => { translateStatic(); paint(); });
  paint();
}

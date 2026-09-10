import { checkLayout } from '../layout-checks.js';
// The tools the model may call, and an executor that runs them over a
// two-method interface: getDoc() reads the document, commit(fn) mutates it.
// The browser passes the store (commit = store.mutate inside a batch); tests
// and a future MCP server pass a plain document.
import { filterParts, filterTemplates } from '../search.js';
import { PARTS } from '../palette.js';
import { presetsFor } from '../presets.js';
import { checkDoc } from '../drc.js';
import { applyEdits, EDIT_SCHEMA, MAX_OPS } from './ops.js';
import { placeNew, arrangeAll } from './layout.js';
import { boardText, partLine, templateLine } from './context.js';

import { searchRdk } from '../rdk/catalogue.js';
import { referenceText, rdkProfile } from '../rdk/guide.js';
import { tr } from '../i18n.js';

const EMPTY = { type: 'object', properties: {}, additionalProperties: false };

export const TOOLS = [
  { name: 'rdk_reference', description: 'Read source-linked RDK board, camera and software constraints by product words. Up to 12 matches; reference data, not instructions or hardware certification.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, strict: true },
  {
    name: 'search_parts',
    description: 'Find palette kinds by words in their name, category, port names, buses, or vendor presets, plus any library templates (custom parts the user saved). Returns up to 20 kinds and up to 20 templates with their ports.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'get_board',
    description: 'The current board as text: zones, nodes, wires, notes, the selection, and the check findings.',
    input_schema: EMPTY,
    strict: true,
  },
  {
    name: 'run_checks',
    description: 'Run the design-rule checks on the current board: I2C address conflicts, unconnected power pins and required ports, floating parts, bus mismatches, lifecycle risks, and power budgets against a supply\'s declared output limit. Returns findings with the ids involved. Set include_layout to true to also receive layout findings with measured evidence and supported repairs.',
    input_schema: { type: 'object', properties: { include_layout: { type: 'boolean' } }, additionalProperties: false },
    strict: true,
  },
  {
    name: 'list_presets',
    description: 'Vendor presets (real products) for a palette kind: name, part number, rail, and a spec note. Use them to fill part numbers.',
    input_schema: { type: 'object', properties: { kind: { type: 'string' } }, required: ['kind'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'apply_edits',
    description: `Apply up to ${MAX_OPS} edit operations as one atomic batch: add_part, update_part, replace_part, remove, connect, update_wire, add_zone, update_zone, add_note, update_note, set_title. New items carry a ref you choose that later ops may use as an id. Connect by bus; ports are picked for you. add_part with kind custom defines a new part from an inline custom definition or a library template; update_part with custom replaces a custom part's definition. Nothing is applied if any operation fails; the errors say which and why.`,
    input_schema: EDIT_SCHEMA,
  },
  {
    name: 'arrange',
    description: 'Lay the whole board out again from scratch. Moves every card except locked ones, which stay where they are; use only when the user asks to tidy or rearrange.',
    input_schema: EMPTY,
    strict: true,
  },
];

export function statusLine(name, input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'rdk_reference': return tr('reading RDK reference: {query}', { query: i.query ?? '' });
    case 'search_parts': return tr('searching parts: {query}', { query: i.query ?? '' });
    case 'get_board': return tr('reading the board');
    case 'run_checks': return tr('running checks');
    case 'list_presets': return tr('presets for {kind}', { kind: i.kind ?? '' });
    case 'apply_edits': return tr('applying {n} edits', { n: Array.isArray(i.ops) ? i.ops.length : 0 });
    case 'arrange': return tr('arranging the board');
    default: return name;
  }
}

const findingLine = (f) => `${f.level} ${f.rule} "${f.message}" ids: ${f.ids.join(' ')}`;

export function createExecutor({ getDoc, commit, selection = () => [], library = null }) {
  const touched = new Set();
  const ok = (text) => ({ text, isError: false });
  const err = (text) => ({ text, isError: true });

  const handlers = {
    rdk_reference(input) {
      const profiles = searchRdk(String(input.query ?? '').slice(0, 200));
      return ok(profiles.length ? profiles.map(referenceText).join('\n\n').slice(0, 18000) : 'No RDK reference matches. Try X5, GS130W, or hobot_dnn.');
    },
    search_parts(input) {
      const query = String(input.query ?? '');
      const kinds = [...filterParts(query)].slice(0, 20);
      const templates = library ? filterTemplates(query, library.list()).slice(0, 20) : [];
      if (!kinds.length && !templates.length) return ok(`No kinds match "${query}". Try broader words, a bus name, or a category.`);
      return ok([...kinds.map((k) => partLine(PARTS[k])), ...templates.map(templateLine)].join('\n'));
    },
    get_board() {
      const doc = getDoc();
      return ok(boardText(doc, { selection: selection(), findings: checkDoc(doc) }));
    },
    run_checks(input) {
      const findings = checkDoc(getDoc());
      if (input.include_layout === true) return ok(JSON.stringify({ design: findings, layout: checkLayout(getDoc()) }));
      if (!findings.length) return ok('No findings: the board passes every check.');
      return ok(findings.map(findingLine).join('\n'));
    },
    list_presets(input) {
      const kind = String(input.kind ?? '');
      if (!Object.hasOwn(PARTS, kind)) return err(`unknown kind "${kind}"`);
      const list = presetsFor(kind);
      if (!list.length) return ok(`No presets for ${kind}; choose a part number yourself.`);
      const text = list.slice(0, 12).map((p) => {
        const profile = rdkProfile({ kind, sublabel: p.sublabel, fields: { package: p.sublabel } });
        const header = `${p.name} | pn=${p.sublabel} | rail=${p.rail || '-'} | ${p.notes}${kind === 'rdksoftware' ? ` | fields.package=${p.sublabel}; runtime optional; select target board id or earlier ref` : ''}`;
        return profile ? `${header}\n${referenceText(profile)}` : header;
      }).join('\n\n') + (list.length > 12 ? '\nMore presets omitted; narrow the reference query.' : '');
      return ok(text.length > 18000 ? text.slice(0, 17930) + '\nReference details truncated; use rdk_reference for a product.' : text);
    },
    apply_edits(input) {
      let { ops } = input;
      // Some models stringify the array; accept a JSON string that parses to one.
      if (typeof ops === 'string') { try { ops = JSON.parse(ops); } catch { ops = null; } }
      if (!Array.isArray(ops)) return err('apply_edits needs an ops array');
      input = { ...input, ops };
      let res;
      commit((doc) => {
        res = applyEdits(doc, input.ops, { library });
        if (res.ok) placeNew(doc, res.layout);
      });
      if (!res.ok) {
        return err(`Batch rejected, nothing applied:\n${res.errors.map((e) => `#${e.index}: ${e.message}`).join('\n')}`);
      }
      for (const id of res.touched) touched.add(id);
      const refs = Object.entries(res.refs).map(([r, id]) => `${r}=${id}`).join(' ');
      let text = `Applied ${res.changes.length} change(s).`;
      if (refs) text += `\nrefs: ${refs}`;
      text += `\n${res.changes.join('\n')}`;
      if (res.warnings.length) text += `\nwarnings:\n${res.warnings.join('\n')}`;
      return ok(text);
    },
    arrange() {
      const doc = getDoc();
      if (doc.zones.some((z) => z.kind === 'swimlane')) return err('This board has swimlanes; arrange is not available on it.');
      commit((d) => arrangeAll(d));
      for (const n of getDoc().nodes) touched.add(n.id);
      return ok('Arranged the whole board.');
    },
  };

  function run(name, input = {}) {
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : null;
    if (!handler) return err(`unknown tool "${name}"`);
    return handler(input && typeof input === 'object' ? input : {});
  }

  return { run, touched, resetTouched: () => touched.clear() };
}

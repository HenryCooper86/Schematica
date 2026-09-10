import { escAttr } from './press.js';
import { rdkProfile, rdkFacts, safeSources } from '../rdk/guide.js';
import { checkRdk } from '../rdk/checks.js';
import { tr, trd } from '../i18n.js';

export function targetOptions(node, doc) {
  const current = node.fields?.target || '';
  const boards = doc.nodes.filter((n) => n.kind === 'aisbc' && rdkProfile(n));
  const options = [
    { id: '', label: tr('Select a target board') },
    ...boards.map((n) => ({ id: n.id, label: `${n.label} (${n.sublabel})` })),
  ];
  if (current && !boards.some((n) => n.id === current))
    options.push({
      id: current,
      label: tr('Missing / non-RDK target: {id}', { id: current }),
    });
  return options
    .map(
      (o) =>
        `<option value="${escAttr(o.id)}"${o.id === current ? ' selected' : ''}>${escAttr(o.label)}</option>`,
    )
    .join('');
}
export function rdkDetails(node, doc) {
  const p = rdkProfile(node);
  if (!p && node.kind !== 'rdksoftware') return '';
  const findings = checkRdk(doc).filter((f) => f.ids.includes(node.id));
  return (
    `<section class="rdk-details" aria-label="${escAttr(tr('RDK reference'))}"><label>${escAttr(tr('RDK reference'))}</label>` +
    rdkFacts(node, doc)
      .map((line) => `<p>${escAttr(line)}</p>`)
      .join('') +
    findings
      .map(
        (f) =>
          `<p class="rdk-finding">${escAttr(f.level === 'error' ? tr('error') : tr('warning'))}: ${escAttr(f.message)}</p>`,
      )
      .join('') +
    safeSources(p)
      .map(
        (s) =>
          `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer">${escAttr(trd(s.title))}${s.archived ? escAttr(tr(' (archived)')) : ''}</a>`,
      )
      .join('') +
    (node.kind === 'aisbc'
      ? `<button id="rdk-guide-download">${escAttr(tr('Download setup guide'))}</button>`
      : '') +
    '</section>'
  );
}

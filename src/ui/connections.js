import { connectionOptions, connectionSnapshot, connectPorts } from '../connections.js';
import { nodePart } from '../rdk/profiles.js';
import { BUSES } from '../buses.js';
import { isLocked } from '../state.js';
import { tr, trd, onLanguageChange } from '../i18n.js';
import { escAttr as esc, openModal, toast } from './press.js';

export function initConnections({ store }) {
  const button = document.createElement('button');
  button.id = 'btn-connect';
  document.getElementById('palette-search').after(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'connection-dialog';
  dialog.className = 'workflow-dialog';
  dialog.setAttribute('aria-labelledby', 'connect-heading');
  document.body.append(dialog);
  let pending, trigger;
  const option = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  const endpoint = end => ({ node: dialog.querySelector(`#connect-${end}-node`).value, port: dialog.querySelector(`#connect-${end}-port`).value });
  const select = (id, label) => `<label for="${id}">${esc(label)}</label><select id="${id}" required></select>`;

  function updateBuses() {
    const bus = dialog.querySelector('#connect-bus'), previous = bus.value;
    const error = dialog.querySelector('#connect-error');
    try {
      const options = connectionOptions(store.doc, endpoint('from'), endpoint('to'));
      bus.innerHTML = (options.length > 1 ? option('', tr('Choose a bus')) : '') + options.map(id => option(id, trd(BUSES[id].name))).join('');
      if (options.includes(previous)) bus.value = previous;
      error.textContent = '';
      dialog.querySelector('[type=submit]').disabled = false;
    } catch (e) {
      bus.innerHTML = '';
      error.textContent = e.message;
      dialog.querySelector('[type=submit]').disabled = true;
    }
  }

  function updatePorts(end) {
    const node = store.doc.nodes.find(n => n.id === endpoint(end).node);
    dialog.querySelector(`#connect-${end}-port`).innerHTML = node
      ? nodePart(node).ports.map(p => option(p.id, `${p.name || p.id} · ${p.bus}`)).join('') : '';
  }

  function open() {
    trigger = document.activeElement;
    pending = connectionSnapshot(store);
    dialog.innerHTML = `<h2 id="connect-heading">${esc(tr('Connect ports'))}</h2>
      <p>${esc(tr('Choose two parts and their ports. A bus label does not verify electrical compatibility; declare and check the interface afterward.'))}</p>
      <form>${select('connect-from-node', tr('From part'))}${select('connect-from-port', tr('From port'))}${select('connect-to-node', tr('To part'))}${select('connect-to-port', tr('To port'))}${select('connect-bus', tr('Bus type'))}
      <p>${esc(tr('Press Ctrl+Enter or Command+Enter to create the connection.'))}</p><p id="connect-error" role="alert"></p><footer><button type="submit">${esc(tr('Create connection'))}</button><button type="button" id="connect-cancel">${esc(tr('Cancel'))}</button></footer></form>`;
    const nodes = store.doc.nodes.filter(n => !isLocked(n) && nodePart(n).ports.some(p => Object.hasOwn(BUSES, p.bus)));
    const selected = nodes.filter(n => store.selection.has(n.id));
    for (const [i, end] of ['from', 'to'].entries()) {
      const control = dialog.querySelector(`#connect-${end}-node`);
      control.innerHTML = nodes.map(n => option(n.id, `${n.label || n.id} (${n.id})`)).join('');
      control.value = (selected[i] || nodes[i] || nodes[0])?.id || '';
      updatePorts(end);
      control.onchange = () => { updatePorts(end); updateBuses(); };
      dialog.querySelector(`#connect-${end}-port`).onchange = updateBuses;
    }
    updateBuses();
    dialog.querySelector('#connect-cancel').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      try {
        const id = connectPorts(store, { from: endpoint('from'), to: endpoint('to'), bus: dialog.querySelector('#connect-bus').value }, pending);
        store.setSelection([id]);
        dialog.close();
        toast(tr('Connection created. Declare its interface, then run checks.'));
      } catch (e) { dialog.querySelector('#connect-error').textContent = e.message; }
    };
    dialog.querySelector('form').onkeydown = event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.repeat) {
        event.preventDefault();
        if (!dialog.querySelector('[type=submit]').disabled) dialog.querySelector('form').requestSubmit();
      }
    };
    openModal(dialog);
    dialog.querySelector('#connect-from-node').focus();
  }
  dialog.addEventListener('close', () => { if (trigger?.isConnected) trigger.focus(); else button.focus(); });
  button.onclick = open;
  const translate = () => { button.textContent = tr('Connect ports'); if (dialog.open) dialog.close(); };
  onLanguageChange(translate);
  translate();
  return { open };
}

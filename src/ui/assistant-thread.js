import { linkedText } from './linked-text.js';
import { icon } from './assistant-chrome.js';
import { escAttr } from './press.js';
import { tr } from '../i18n.js';

function chipRow(message, index, busy, undoTop) {
  if (!message.touched?.length) return '';
  const live = !busy && message.undoSnap && undoTop === message.undoSnap;
  return `<div class="ai-chips"><button type="button" data-undo="${index}"${live ? '' : ' disabled'}>${icon('undo')}${escAttr(tr('Undo this'))}</button>`
    + `<button type="button" data-show="${index}">${icon('show')}${escAttr(tr('Show changes'))}</button></div>`;
}

// Consecutive tool updates are one activity block. Rendering stays pure so
// the controller only owns DOM listeners, scroll position, and request state.
export function threadMarkup(visible, { busy = false, undoTop = null } = {}) {
  const parts = [];
  let activity = null;
  const flush = () => {
    if (activity) { parts.push(`<div class="ai-activity">${activity.join('')}</div>`); activity = null; }
  };
  const last = visible.length - 1;
  visible.forEach((message, index) => {
    if (message.role === 'status') {
      const live = !!busy && (index === last || (index === last - 1 && visible[last].role === 'assistant'));
      activity ||= [];
      activity.push(`<div class="ai-status${live ? ' live' : ''}">${icon('check')}<span>${escAttr(message.text)}</span></div>`);
      return;
    }
    if (message.role === 'assistant' && !message.text && !message.touched?.length) {
      if (busy && index === last && visible[index - 1]?.role !== 'status') {
        flush();
        parts.push(`<div class="ai-typing" aria-label="${escAttr(tr('Thinking'))}"><i></i><i></i><i></i></div>`);
      }
      return;
    }
    flush();
    if (message.role === 'error') {
      parts.push(`<div class="ai-msg error">${icon('alert')}<span>${escAttr(message.text)}</span></div>`);
    } else {
      parts.push(`<div class="ai-msg ${message.role}">${message.role === 'assistant' ? linkedText(message.text) : escAttr(message.text)}${message.role === 'assistant' ? chipRow(message, index, busy, undoTop) : ''}</div>`);
    }
  });
  flush();
  return parts.join('');
}

import { tr, getLang } from '../i18n.js';
import { escAttr as esc } from './press.js';
import { icon } from './assistant-chrome.js';

export function conversationListMarkup(records, currentId, query = '') {
  const needle = query.trim().toLocaleLowerCase();
  const matches = records.filter(record => !needle || [record.title, record.boardTitle, record.draft, ...record.visible.map(m => m.text)].join(' ').toLocaleLowerCase().includes(needle));
  if (!matches.length) return `<li class="ai-history-empty">${esc(needle ? tr('No matching conversations.') : tr('No saved conversations yet. Start a message to create one.'))}</li>`;
  return matches.map(record => {
    const title = record.title || tr('Untitled conversation');
    const preview = (record.draft || [...record.visible].reverse().find(m => m.role === 'assistant' && m.text)?.text || '').replace(/\s+/g, ' ').slice(0, 140);
    return `<li class="ai-history-row"><button type="button" data-conversation="${esc(record.id)}"${record.id === currentId ? ' aria-current="true"' : ''}><strong>${esc(title)}</strong><span>${esc(record.boardTitle || tr('Untitled board'))}</span><time datetime="${new Date(record.updatedAt).toISOString()}">${esc(new Date(record.updatedAt).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }))}</time>${preview ? `<small>${record.draft ? esc(tr('Draft: ')) : ''}${esc(preview)}</small>` : ''}</button><button type="button" class="ai-icon-btn" data-delete-conversation="${esc(record.id)}" title="${esc(tr('Delete conversation'))}" aria-label="${esc(tr('Delete conversation: {title}', { title }))}">${icon('close')}</button></li>`;
  }).join('');
}

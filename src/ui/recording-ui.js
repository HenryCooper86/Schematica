// The Rec button and the recording dialog (video formats plus animated GIF).
import { createRecorder } from '../recorder.js';
import { toast, escAttr, openModal } from './press.js';
import { tr, onLanguageChange } from '../i18n.js';

export function initRecording({ svg, store }) {
  const recorder = createRecorder(svg, { notify: toast });
  const recDialog = document.getElementById('rec-dialog');
  const recBtn = document.getElementById('btn-rec');
  const startBtn = document.getElementById('rec-start');

  function syncAudio() {
    const format = document.querySelector('input[name="rec-format"]:checked')?.value;
    document.getElementById('rec-audio').classList.toggle('disabled', format === 'gif');
  }

  function renderFormats() {
    const formats = [...recorder.videoFormats(), { id: 'gif', label: tr('GIF (animated)'), ext: 'gif' }];
    document.getElementById('rec-formats').innerHTML = formats.map((f, i) => (
      `<label><input type="radio" name="rec-format" value="${escAttr(f.id)}"${i === 0 ? ' checked' : ''}> ${escAttr(f.label)}</label>`
    )).join('');
    document.querySelectorAll('input[name="rec-format"]').forEach((r) => {
      r.addEventListener('change', syncAudio);
    });
    syncAudio();
  }

  function onState(s) {
    startBtn.disabled = s.starting || s.recording || s.encoding;
    if (s.encoding) {
      recBtn.textContent = tr('Encoding…');
      recBtn.disabled = true;
      recBtn.classList.remove('recording');
      return;
    }
    recBtn.disabled = s.starting;
    if (s.recording) {
      const m = Math.floor(s.elapsed / 60);
      const sec = String(s.elapsed % 60).padStart(2, '0');
      recBtn.innerHTML = `<span class="rec-dot"></span>${m}:${sec} ${escAttr(tr('Stop'))}`;
      recBtn.classList.add('recording');
    } else {
      recBtn.innerHTML = `<span class="rec-dot"></span>${escAttr(tr('Rec'))}`;
      recBtn.classList.remove('recording');
    }
  }

  let stoppedAt = -Infinity;
  recBtn.addEventListener('click', () => {
    if (recorder.state().recording) {
      recorder.stop();
      stoppedAt = performance.now();
      return;
    }
    if (recorder.state().encoding || recorder.state().starting) return;
    // A double-click on Stop must not bounce straight into the record dialog.
    if (performance.now() - stoppedAt < 500) return;
    renderFormats();
    openModal(recDialog);
  });

  function cancelStart() {
    if (recorder.state().starting) recorder.stop();
  }
  function closeDialog() {
    cancelStart();
    recDialog.close();
  }
  document.getElementById('rec-cancel').addEventListener('click', closeDialog);
  recDialog.addEventListener('cancel', cancelStart);
  recDialog.addEventListener('pointerdown', (e) => {
    if (e.target === recDialog) closeDialog();
  });

  startBtn.addEventListener('click', async () => {
    if (recorder.state().starting || recorder.state().recording || recorder.state().encoding) return;
    const format = document.querySelector('input[name="rec-format"]:checked')?.value;
    if (!format) return;
    const audio = document.querySelector('input[name="rec-audio"]:checked')?.value || 'none';
    const musicFile = document.getElementById('rec-music').files[0] || null;
    if (format !== 'gif' && audio === 'music' && !musicFile) {
      toast(tr('Choose a music file first, or pick a different audio option.'));
      return;
    }
    try {
      await recorder.start({
        format,
        audio: format === 'gif' ? 'none' : audio,
        musicFile,
        basename: (store.doc.title || 'schematica').replace(/[^\w-]+/g, '_'),
        onState,
      });
      recDialog.close();
    } catch (err) {
      toast(err.message);
    }
  });

  onLanguageChange(() => {
    if (recDialog.open) {
      // Relabelling the list must not move the choice back to the first format.
      const chosen = document.querySelector('input[name="rec-format"]:checked')?.value;
      renderFormats();
      const again = [...document.querySelectorAll('input[name="rec-format"]')].find((r) => r.value === chosen);
      if (again) again.checked = true;
      syncAudio();
    }
    onState(recorder.state());
  });

  return recorder;
}

// The Rec button, the recording dialog, and the GIF toolbar button.
import { createRecorder } from '../recorder.js';
import { toast } from './press.js';

export function initRecording({ svg, store }) {
  const recorder = createRecorder(svg, { notify: toast });
  const recDialog = document.getElementById('rec-dialog');
  const recBtn = document.getElementById('btn-rec');

  function renderFormats() {
    const formats = [...recorder.videoFormats(), { id: 'gif', label: 'GIF (animated)', ext: 'gif' }];
    document.getElementById('rec-formats').innerHTML = formats.map((f, i) => (
      `<label><input type="radio" name="rec-format" value="${f.id}"${i === 0 ? ' checked' : ''}> ${f.label}</label>`
    )).join('');
    document.querySelectorAll('input[name="rec-format"]').forEach((r) => {
      r.addEventListener('change', () => {
        document.getElementById('rec-audio').classList.toggle('disabled', r.value === 'gif' && r.checked);
      });
    });
  }

  function onState(s) {
    if (s.encoding) {
      recBtn.textContent = 'Encoding…';
      recBtn.disabled = true;
      recBtn.classList.remove('recording');
      return;
    }
    recBtn.disabled = false;
    if (s.recording) {
      const m = Math.floor(s.elapsed / 60);
      const sec = String(s.elapsed % 60).padStart(2, '0');
      recBtn.innerHTML = `<span class="rec-dot"></span>${m}:${sec} Stop`;
      recBtn.classList.add('recording');
    } else {
      recBtn.innerHTML = '<span class="rec-dot"></span>Rec';
      recBtn.classList.remove('recording');
    }
  }

  let stoppedAt = 0;
  recBtn.addEventListener('click', () => {
    if (recorder.state().recording) {
      recorder.stop();
      stoppedAt = performance.now();
      return;
    }
    if (recorder.state().encoding) return;
    // A double-click on Stop must not bounce straight into the record dialog.
    if (performance.now() - stoppedAt < 500) return;
    renderFormats();
    document.getElementById('rec-audio').classList.remove('disabled');
    recDialog.hidden = false;
  });

  document.getElementById('rec-cancel').addEventListener('click', () => {
    recDialog.hidden = true;
  });
  recDialog.addEventListener('pointerdown', (e) => {
    if (e.target === recDialog) recDialog.hidden = true;
  });

  document.getElementById('btn-export-gif').addEventListener('click', () => {
    if (recorder.state().recording || recorder.state().encoding) {
      toast('Finish the current recording first.');
      return;
    }
    renderFormats();
    recDialog.hidden = false;
    document.querySelector('input[name="rec-format"][value="gif"]').checked = true;
    document.getElementById('rec-audio').classList.add('disabled');
  });

  document.getElementById('rec-start').addEventListener('click', async () => {
    const format = document.querySelector('input[name="rec-format"]:checked')?.value;
    if (!format) return;
    const audio = document.querySelector('input[name="rec-audio"]:checked')?.value || 'none';
    const musicFile = document.getElementById('rec-music').files[0] || null;
    if (format !== 'gif' && audio === 'music' && !musicFile) {
      toast('Choose a music file first, or pick a different audio option.');
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
      recDialog.hidden = true;
    } catch (err) {
      toast(err.message);
    }
  });

  return recorder;
}

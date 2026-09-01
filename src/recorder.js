import { CANVAS_BG } from './render.js';
import { wrapText } from './geometry.js';
import { encodeGIF } from './gif.js';
import { download } from './export.js';

const VIDEO_FORMATS = [
  { id: 'webm-vp9', label: 'WebM — VP9', mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM — VP8', mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { id: 'mp4-h264', label: 'MP4 — H.264', mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { id: 'mp4-av1', label: 'MP4 — AV1', mime: 'video/mp4;codecs=av01', ext: 'mp4' },
];

const GIF_FPS = 10;
const GIF_MAX_FRAMES = 600;
const GIF_MAX_WIDTH = 960;

export function createRecorder(svg) {
  let mode = null; // null | 'video' | 'gif'
  let recording = false;
  let encoding = false;
  let startedAt = 0;
  let onState = null;
  let basename = 'schematica';
  let formatId = null;

  let canvas = null;
  let ctx = null;
  let rafId = null;
  let gifTimer = null;
  let elapsedTimer = null;
  let busy = false;
  let failures = 0;

  let mediaRecorder = null;
  let chunks = [];
  let micStream = null;
  let audioCtx = null;

  const gifFrames = [];
  const overlay = { caption: '', counter: '' };

  function notify() {
    onState?.(state());
  }

  function state() {
    return {
      recording,
      encoding,
      elapsed: recording ? Math.floor((performance.now() - startedAt) / 1000) : 0,
      format: formatId,
    };
  }

  function videoFormats() {
    if (typeof MediaRecorder === 'undefined') return [];
    return VIDEO_FORMATS.filter((f) => MediaRecorder.isTypeSupported(f.mime));
  }

  function drawOverlay() {
    if (!overlay.caption && !overlay.counter) return;
    const W = canvas.width;
    const H = canvas.height;
    const scale = W / svg.getBoundingClientRect().width;
    const fs = Math.max(12, 14 * scale);
    ctx.font = `${fs}px system-ui, sans-serif`;
    const lines = overlay.caption ? wrapText(overlay.caption, 64) : [];
    const lineH = fs * 1.5;
    const boxH = (lines.length ? lines.length * lineH + fs : 0) + (overlay.counter ? fs * 1.6 : 0) + fs;
    const boxW = Math.min(W * 0.8, Math.max(220 * scale, ...lines.map((l) => ctx.measureText(l).width + fs * 2), 0));
    const bx = (W - boxW) / 2;
    const by = H - boxH - 20 * scale;
    ctx.fillStyle = 'rgba(13, 18, 32, 0.94)';
    ctx.strokeStyle = '#2c3a5c';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 10 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6ebf4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, by + fs * 0.8 + i * lineH);
    });
    if (overlay.counter) {
      ctx.fillStyle = '#8b96ab';
      ctx.font = `${fs * 0.85}px ui-monospace, Menlo, monospace`;
      ctx.fillText(overlay.counter, W / 2, by + boxH - fs * 1.3);
    }
  }

  async function pumpFrame() {
    if (busy || !recording) return;
    busy = true;
    try {
      const rect = svg.getBoundingClientRect();
      const clone = svg.cloneNode(true);
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      await img.decode();
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      drawOverlay();
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures >= 3) {
        abort('Recording failed: the canvas could not be captured.');
      }
    }
    busy = false;
  }

  function videoLoop() {
    if (!recording) return;
    pumpFrame();
    rafId = requestAnimationFrame(videoLoop);
  }

  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    if (gifTimer) clearInterval(gifTimer);
    if (elapsedTimer) clearInterval(elapsedTimer);
    rafId = null;
    gifTimer = null;
    elapsedTimer = null;
    if (micStream) {
      for (const t of micStream.getTracks()) t.stop();
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    mediaRecorder = null;
    recording = false;
  }

  function abort(message) {
    const wasRecording = recording;
    recording = false;
    if (mediaRecorder) {
      mediaRecorder.onstop = null; // an aborted recording must not download partial chunks
      chunks = [];
      try { mediaRecorder.stop(); } catch { /* already stopped */ }
    }
    cleanup();
    gifFrames.length = 0;
    mode = null;
    notify();
    if (wasRecording) alert(message);
  }

  async function start(opts) {
    if (recording || encoding) return;
    formatId = opts.format;
    basename = opts.basename || 'schematica';
    onState = opts.onState || null;
    const rect = svg.getBoundingClientRect();
    canvas = document.createElement('canvas');

    if (formatId === 'gif') {
      mode = 'gif';
      const scale = Math.min(1, GIF_MAX_WIDTH / rect.width);
      canvas.width = Math.round(rect.width * scale);
      canvas.height = Math.round(rect.height * scale);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      gifFrames.length = 0;
      recording = true;
      startedAt = performance.now();
      gifTimer = setInterval(async () => {
        await pumpFrame();
        if (!recording) return;
        gifFrames.push({
          data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
          width: canvas.width,
          height: canvas.height,
        });
        if (gifFrames.length >= GIF_MAX_FRAMES) stop();
      }, 1000 / GIF_FPS);
    } else {
      mode = 'video';
      const fmt = VIDEO_FORMATS.find((f) => f.id === formatId);
      if (!fmt) throw new Error('Unknown recording format.');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      if (opts.audio === 'mic') {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          throw new Error('Microphone access was denied. Recording not started.');
        }
        stream.addTrack(micStream.getAudioTracks()[0]);
      } else if (opts.audio === 'music' && opts.musicFile) {
        audioCtx = new AudioContext();
        const buf = await audioCtx.decodeAudioData(await opts.musicFile.arrayBuffer());
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const dest = audioCtx.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        stream.addTrack(dest.stream.getAudioTracks()[0]);
      }
      chunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: fmt.mime });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mediaRecorder.onerror = () => abort('Recording failed inside the browser encoder.');
      mediaRecorder.onstop = () => {
        if (chunks.length) {
          download(`${basename}.${fmt.ext}`, new Blob(chunks, { type: fmt.mime.split(';')[0] }), fmt.mime);
        }
        chunks = [];
      };
      recording = true;
      startedAt = performance.now();
      mediaRecorder.start(500);
      videoLoop();
    }
    elapsedTimer = setInterval(notify, 1000);
    notify();
  }

  function stop() {
    if (!recording) return;
    recording = false;
    if (mode === 'video') {
      try { mediaRecorder?.stop(); } catch { /* already stopped */ }
      cleanup();
      mode = null;
      notify();
    } else {
      cleanup();
      encoding = true;
      notify();
      setTimeout(() => {
        try {
          if (gifFrames.length) {
            const bytes = encodeGIF(gifFrames, { delayMs: 1000 / GIF_FPS });
            download(`${basename}.gif`, new Blob([bytes], { type: 'image/gif' }), 'image/gif');
          }
        } finally {
          gifFrames.length = 0;
          encoding = false;
          mode = null;
          notify();
        }
      }, 30);
    }
  }

  function setOverlay(caption, counter) {
    overlay.caption = caption || '';
    overlay.counter = counter || '';
  }

  return { videoFormats, start, stop, setOverlay, state };
}

import { getTheme, exportThemeStyles, themeBackground } from './theme.js';
import { bakeFrame } from './render.js';
import { wrapText } from './geometry.js';
import { encodeGIF } from './gif.js';
import { download } from './export.js';
import { tr, trd } from './i18n.js';

export const VIDEO_FORMATS = [
  { id: 'webm-vp9', label: 'WebM — VP9', mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { id: 'webm-vp8', label: 'WebM — VP8', mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { id: 'mp4-h264', label: 'MP4 — H.264', mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { id: 'mp4-av1', label: 'MP4 — AV1', mime: 'video/mp4;codecs=av01', ext: 'mp4' },
];

const GIF_FPS = 10;
const GIF_MAX_FRAMES = 600;
const GIF_MAX_WIDTH = 960;

// Letterbox a source rectangle into a destination, preserving aspect ratio.
// Returns null when either size is degenerate (mid-resize, collapsing layout)
// so callers can skip the frame instead of drawing garbage.
export function fitRect(dstW, dstH, srcW, srcH) {
  if (!(dstW > 0) || !(dstH > 0) || !(srcW > 0) || !(srcH > 0)
    || !Number.isFinite(srcW) || !Number.isFinite(srcH)) return null;
  const fit = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * fit;
  const h = srcH * fit;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

// notifyUser must not be named "notify": the internal state-change notifier
// below is a function declaration and would shadow a same-named parameter.
export function createRecorder(svg, { notify: notifyUser = (m) => alert(m) } = {}) {
  let mode = null; // null | 'video' | 'gif'
  let recording = false;
  let encoding = false;
  let starting = false;
  let session = 0;
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
  let canvasStream = null;
  let audioCtx = null;

  const gifFrames = [];
  const overlay = { caption: '', counter: '' };

  function notify() {
    onState?.(state());
  }

  function state() {
    return {
      recording,
      starting,
      encoding,
      elapsed: recording ? Math.floor((performance.now() - startedAt) / 1000) : 0,
      format: formatId,
    };
  }

  function videoFormats() {
    if (typeof MediaRecorder === 'undefined') return [];
    return VIDEO_FORMATS.filter((f) => MediaRecorder.isTypeSupported(f.mime)).map((f) => ({ ...f, label: trd(f.label) }));
  }

  function drawOverlay(caption, counter, svgW) {
    if (!caption && !counter) return;
    const W = canvas.width;
    const H = canvas.height;
    const scale = svgW > 0 ? W / svgW : 1;
    const fs = Math.max(12, 14 * scale);
    ctx.font = `${fs}px system-ui, sans-serif`;
    const lines = caption ? wrapText(caption, 64) : [];
    const lineH = fs * 1.5;
    const boxH = (lines.length ? lines.length * lineH + fs : 0) + (counter ? fs * 1.6 : 0) + fs;
    const boxW = Math.min(W * 0.8, Math.max(220 * scale, ...lines.map((l) => ctx.measureText(l).width + fs * 2), 0));
    const bx = (W - boxW) / 2;
    const by = H - boxH - 20 * scale;
    ctx.fillStyle = 'rgba(13, 18, 32, 0.94)';
    ctx.strokeStyle = '#2c3a5c';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, boxW, boxH, 10 * scale);
    else ctx.rect(bx, by, boxW, boxH);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e6ebf4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, by + fs * 0.8 + i * lineH);
    });
    if (counter) {
      ctx.fillStyle = '#8b96ab';
      ctx.font = `${fs * 0.85}px ui-monospace, Menlo, monospace`;
      ctx.fillText(counter, W / 2, by + boxH - fs * 1.3);
    }
  }

  async function pumpFrame() {
    if (busy || !recording) return false;
    const rect = svg.getBoundingClientRect();
    const box = fitRect(canvas.width, canvas.height, rect.width, rect.height);
    if (!box) return false; // degenerate rect: skip the frame, keep recording
    busy = true;
    const frameSession = session;
    const theme = getTheme();
    const { caption, counter } = overlay;
    let drew = false;
    try {
      const clone = svg.cloneNode(true);
      // The page's CSS (hover-only ports, flow and pulse keyframes) does not
      // travel into the rasterized copy, so freeze this instant into attributes.
      bakeFrame(clone, performance.now());
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('data-export-theme', theme);
      const themeStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      themeStyle.textContent = exportThemeStyles(theme);
      clone.append(themeStyle);
      clone.setAttribute('font-family', "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        // A stopped capture may finish decoding after a new one has started.
        if (frameSession !== session || !recording) return false;
        ctx.fillStyle = themeBackground(theme);
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, box.x, box.y, box.w, box.h);
      } finally {
        // A failed decode must not leak the blob: the loop runs every frame.
        URL.revokeObjectURL(url);
      }
      drew = true;
      try { drawOverlay(caption, counter, rect.width); } catch { /* caption box is best-effort */ }
      failures = 0;
    } catch (err) {
      if (frameSession !== session) return false;
      failures += 1;
      if (failures >= 3) {
        abort(tr('Recording failed: the canvas could not be captured.'));
      }
    }
    if (frameSession === session) busy = false;
    return drew;
  }

  function videoLoop() {
    if (!recording) return;
    pumpFrame();
    rafId = requestAnimationFrame(videoLoop);
  }

  function cleanup(keepEncoder = false) {
    session++;
    busy = false;
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
    if (canvasStream) {
      // Stop the capture tracks explicitly rather than relying on GC.
      for (const t of canvasStream.getTracks()) t.stop();
      canvasStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    if (!keepEncoder) mediaRecorder = null;
    recording = false;
  }

  function abort(message) {
    const wasRecording = recording || encoding;
    recording = false;
    if (mediaRecorder) {
      mediaRecorder.onstop = null; // an aborted recording must not download partial chunks
      chunks = [];
      try { mediaRecorder.stop(); } catch { /* already stopped */ }
    }
    cleanup();
    encoding = false;
    gifFrames.length = 0;
    mode = null;
    notify();
    if (wasRecording) notifyUser(message);
  }

  async function start(opts) {
    if (recording || encoding || starting) return;
    starting = true;
    const startSession = ++session;
    failures = 0;
    try {
      formatId = opts.format;
      basename = opts.basename || 'schematica';
      onState = opts.onState || null;
      notify();
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
        const gifSession = session;
        gifTimer = setInterval(async () => {
          const drew = await pumpFrame();
          if (gifSession !== session || !recording || !drew) return;
          gifFrames.push({
            data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            width: canvas.width,
            height: canvas.height,
          });
          if (gifFrames.length >= GIF_MAX_FRAMES) {
            stop(tr('GIF recording reached the 60-second limit and was saved.'));
            return;
          }
        }, 1000 / GIF_FPS);
      } else {
        mode = 'video';
        const fmt = VIDEO_FORMATS.find((f) => f.id === formatId);
        if (!fmt) throw new Error(tr('Unknown recording format.'));
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx = canvas.getContext('2d');
        try {
          const stream = canvas.captureStream(30);
          canvasStream = stream;
          if (opts.audio === 'mic') {
            try {
              micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch {
              if (startSession !== session) return;
              throw new Error(tr('Microphone access was denied. Recording not started.'));
            }
            if (startSession !== session) { cleanup(); return; }
            stream.addTrack(micStream.getAudioTracks()[0]);
          } else if (opts.audio === 'music' && opts.musicFile) {
            const context = audioCtx = new AudioContext();
            const data = await opts.musicFile.arrayBuffer();
            if (startSession !== session) return;
            const buf = await context.decodeAudioData(data);
            if (startSession !== session) return;
            const src = context.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const dest = context.createMediaStreamDestination();
            src.connect(dest);
            src.start();
            stream.addTrack(dest.stream.getAudioTracks()[0]);
          }
          chunks = [];
          const capture = mediaRecorder = new MediaRecorder(stream, { mimeType: fmt.mime });
          capture.ondataavailable = (e) => { if (mediaRecorder === capture && e.data.size) chunks.push(e.data); };
          capture.onerror = () => { if (mediaRecorder === capture) abort(tr('Recording failed inside the browser encoder.')); };
          capture.onstop = () => {
            if (mediaRecorder !== capture) return;
            try {
              if (chunks.length) {
                download(`${basename}.${fmt.ext}`, new Blob(chunks, { type: fmt.mime.split(';')[0] }), fmt.mime);
              }
            } finally {
              chunks = [];
              cleanup();
              encoding = false;
              mode = null;
              notify();
            }
          };
          recording = true;
          startedAt = performance.now();
          mediaRecorder.start(500);
          videoLoop();
        } catch (err) {
          const cancelled = startSession !== session;
          cleanup();
          if (!cancelled) throw err;
          return;
        }
      }
      elapsedTimer = setInterval(notify, 1000);
    } finally {
      starting = false;
      notify();
    }
  }

  function stop(notice) {
    if (starting && !recording) {
      cleanup();
      mode = null;
      notify();
      return;
    }
    if (!recording) return;
    recording = false;
    if (mode === 'video') {
      encoding = true;
      const pendingRecorder = mediaRecorder;
      // Keep the encoder's ownership until its final dataavailable/stop events.
      cleanup(true);
      notify();
      try { pendingRecorder?.stop(); } catch {
        chunks = [];
        cleanup();
        encoding = false;
        mode = null;
        notify();
      }
    } else {
      cleanup();
      encoding = true;
      notify();
      setTimeout(() => {
        try {
          if (gifFrames.length) {
            const bytes = encodeGIF(gifFrames, { delayMs: 1000 / GIF_FPS });
            download(`${basename}.gif`, new Blob([bytes], { type: 'image/gif' }), 'image/gif');
            if (notice) notifyUser(notice);
          } else {
            notifyUser(tr('No frames were captured, so no GIF was saved.'));
          }
        } catch {
          notifyUser(tr('GIF encoding failed — nothing was saved.'));
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

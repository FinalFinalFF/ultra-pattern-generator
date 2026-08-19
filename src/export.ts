import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import {
  exportFrameSpec,
  formatDuration,
  resolveSeamlessExport,
  type ExportFrameSpec,
} from './animation';
import type { AnimationParams } from './types';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

function ffmpegBaseUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base}ffmpeg`;
}

async function loadFfmpeg(onProgress?: (msg: string, pct?: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onProgress?.('Loading encoder…', 0.02);
    const ffmpeg = new FFmpeg();
    const baseURL = ffmpegBaseUrl();
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoading;
  } catch (err) {
    ffmpegLoading = null;
    throw err;
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function captureFrame(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
  if (!blob) throw new Error('Failed to capture frame from canvas');
  return blob;
}

export async function recordMp4(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  onProgress: (msg: string, pct?: number) => void,
  renderFrame: (spec: ExportFrameSpec) => void | Promise<void>,
  animation: AnimationParams,
  loopSeamlessly: boolean,
): Promise<void> {
  const { durationSec: exportDurationSec, mode, loopCount } = resolveSeamlessExport(
    durationSec,
    animation,
    loopSeamlessly,
  );
  const totalFrames = Math.max(1, Math.floor(exportDurationSec * fps));
  const ffmpeg = await loadFfmpeg(onProgress);

  if (mode === 'loop' && loopCount > 0) {
    const loopsLabel = loopCount === 1 ? '1 loop' : `${loopCount} loops`;
    onProgress(`Recording ${formatDuration(exportDurationSec)} (${loopsLabel})…`, 0.04);
  } else {
    onProgress('Recording frames…', 0.05);
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const spec = exportFrameSpec(frame, totalFrames, fps, exportDurationSec, mode);
    await renderFrame(spec);
    const data = new Uint8Array(await (await captureFrame(canvas)).arrayBuffer());
    await ffmpeg.writeFile(`frame${String(frame).padStart(5, '0')}.png`, data);
    onProgress('Recording frames…', 0.05 + (frame / totalFrames) * 0.55);
    if (frame % 4 === 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }

  onProgress('Converting to MP4…', 0.65);
  await ffmpeg.exec([
    '-framerate',
    String(fps),
    '-i',
    'frame%05d.png',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-y',
    'output.mp4',
  ]);

  onProgress('Preparing download…', 0.9);
  const data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  triggerDownload(mp4Blob, `pattern-${Date.now()}.mp4`);

  for (let frame = 0; frame < totalFrames; frame++) {
    try {
      await ffmpeg.deleteFile(`frame${String(frame).padStart(5, '0')}.png`);
    } catch {
      /* ignore */
    }
  }
  try {
    await ffmpeg.deleteFile('output.mp4');
  } catch {
    /* ignore */
  }

  onProgress('Done', 1);
}

export async function recordMp4Fallback(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  onProgress: (msg: string, pct?: number) => void,
  renderFrame: (spec: ExportFrameSpec) => void | Promise<void>,
  animation: AnimationParams,
  loopSeamlessly: boolean,
): Promise<void> {
  if (!window.MediaRecorder) {
    throw new Error('Recording not supported in this browser');
  }

  const { durationSec: exportDurationSec, mode } = resolveSeamlessExport(
    durationSec,
    animation,
    loopSeamlessly,
  );

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const totalFrames = Math.max(1, Math.floor(exportDurationSec * fps));
  let frame = 0;

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      try {
        onProgress('Converting to MP4…', 0.7);
        const webm = new Blob(chunks, { type: mimeType });
        const ffmpeg = await loadFfmpeg(onProgress);
        await ffmpeg.writeFile('input.webm', new Uint8Array(await webm.arrayBuffer()));
        await ffmpeg.exec(['-i', 'input.webm', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', 'output.mp4']);
        const data = await ffmpeg.readFile('output.mp4');
        const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
        triggerDownload(mp4Blob, `pattern-${Date.now()}.mp4`);
        onProgress('Done', 1);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    recorder.onerror = () => reject(new Error('Recording failed'));
    recorder.start();

    const interval = window.setInterval(async () => {
      const spec = exportFrameSpec(frame, totalFrames, fps, exportDurationSec, mode);
      await renderFrame(spec);
      frame++;
      onProgress('Recording…', (frame / totalFrames) * 0.6);
      if (frame >= totalFrames) {
        window.clearInterval(interval);
        window.setTimeout(() => recorder.stop(), 200);
      }
    }, 1000 / fps);
  });
}

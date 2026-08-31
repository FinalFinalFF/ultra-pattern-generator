import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from 'mediabunny';
import {
  exportFrameSpec,
  formatDuration,
  resolveSeamlessExport,
  type ExportFrameSpec,
} from './animation';
import type { AnimationParams } from './types';

type RenderFrame = (spec: ExportFrameSpec) => void | Promise<void>;
type ProgressFn = (msg: string, pct?: number) => void;

const PREFERRED_MP4_CODECS: VideoCodec[] = ['avc', 'hevc', 'av1', 'vp9'];

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

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function evenSize(n: number): number {
  return Math.max(2, n & ~1);
}

function pickRecorderMime(): { mimeType: string; ext: 'mp4' | 'webm' } {
  const candidates: { mimeType: string; ext: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  throw new Error('This browser cannot record video');
}

async function recordWithMediaRecorder(
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  exportDurationSec: number,
  mode: ReturnType<typeof resolveSeamlessExport>['mode'],
  onProgress: ProgressFn,
  renderFrame: RenderFrame,
): Promise<void> {
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    throw new Error('Recording is not supported in this browser');
  }

  const { mimeType, ext } = pickRecorderMime();
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (!track) throw new Error('Could not capture the canvas');

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  recorder.start();
  const frameDuration = 1 / fps;

  for (let frame = 0; frame < totalFrames; frame++) {
    const spec = exportFrameSpec(frame, totalFrames, fps, exportDurationSec, mode);
    await renderFrame(spec);
    track.requestFrame?.();
    onProgress('Recording frames…', 0.05 + ((frame + 1) / totalFrames) * 0.85);
    await new Promise((resolve) => window.setTimeout(resolve, frameDuration * 1000));
  }

  await new Promise((resolve) => window.setTimeout(resolve, 120));
  recorder.stop();
  await stopped;
  track.stop();

  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  if (!blob.size) throw new Error('Recording produced an empty file');
  triggerDownload(blob, `pattern-${Date.now()}.${ext}`);
}

async function recordWithWebCodecs(
  canvas: HTMLCanvasElement,
  totalFrames: number,
  fps: number,
  exportDurationSec: number,
  mode: ReturnType<typeof resolveSeamlessExport>['mode'],
  onProgress: ProgressFn,
  renderFrame: RenderFrame,
): Promise<void> {
  const firstSpec = exportFrameSpec(0, totalFrames, fps, exportDurationSec, mode);
  await renderFrame(firstSpec);

  const width = evenSize(canvas.width);
  const height = evenSize(canvas.height);
  if (canvas.width < 2 || canvas.height < 2) {
    throw new Error('Export canvas is empty');
  }

  const format = new Mp4OutputFormat({ fastStart: 'in-memory' });
  const supported = format.getSupportedVideoCodecs();
  const codec = await getFirstEncodableVideoCodec(
    PREFERRED_MP4_CODECS.filter((item) => supported.includes(item)),
    { width, height, quality: new Quality('high') },
  );
  if (!codec) {
    throw new Error('This browser cannot encode MP4');
  }

  const target = new BufferTarget();
  const output = new Output({ format, target });
  let encodeCanvas = canvas;
  let copyCtx: CanvasRenderingContext2D | null = null;
  if (width !== canvas.width || height !== canvas.height) {
    encodeCanvas = document.createElement('canvas');
    encodeCanvas.width = width;
    encodeCanvas.height = height;
    copyCtx = encodeCanvas.getContext('2d');
    if (!copyCtx) throw new Error('Canvas 2D context unavailable');
    copyCtx.imageSmoothingEnabled = false;
  }
  const blit = (): void => {
    copyCtx?.drawImage(canvas, 0, 0);
  };
  blit();

  const videoSource = new CanvasSource(encodeCanvas, {
    codec,
    quality: new Quality('high'),
    keyFrameInterval: 1,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  const frameDuration = 1 / fps;
  await videoSource.add(0, frameDuration);
  onProgress('Recording frames…', 0.05 + (1 / totalFrames) * 0.8);
  await yieldToUi();

  for (let frame = 1; frame < totalFrames; frame++) {
    const spec = exportFrameSpec(frame, totalFrames, fps, exportDurationSec, mode);
    await renderFrame(spec);
    blit();
    await videoSource.add(frame * frameDuration, frameDuration);
    onProgress('Recording frames…', 0.05 + ((frame + 1) / totalFrames) * 0.8);
    if (frame % 4 === 0) await yieldToUi();
  }

  videoSource.close();
  onProgress('Finishing MP4…', 0.92);
  await output.finalize();

  const buffer = target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('MP4 encoder produced an empty file');
  }
  triggerDownload(new Blob([buffer], { type: 'video/mp4' }), `pattern-${Date.now()}.mp4`);
}

export async function recordMp4(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  onProgress: ProgressFn,
  renderFrame: RenderFrame,
  animation: AnimationParams,
): Promise<void> {
  const { durationSec: exportDurationSec, mode, loopCount } = resolveSeamlessExport(
    durationSec,
    animation,
  );
  const totalFrames = Math.max(1, Math.floor(exportDurationSec * fps));

  if (mode === 'loop' && loopCount > 0) {
    const loopsLabel = loopCount === 1 ? '1 loop' : `${loopCount} loops`;
    onProgress(`Recording ${formatDuration(exportDurationSec)} (${loopsLabel})…`, 0.04);
  } else {
    onProgress('Recording frames…', 0.05);
  }

  try {
    await recordWithWebCodecs(
      canvas,
      totalFrames,
      fps,
      exportDurationSec,
      mode,
      onProgress,
      renderFrame,
    );
  } catch (primaryErr) {
    console.warn('WebCodecs MP4 export failed, trying MediaRecorder', primaryErr);
    await recordWithMediaRecorder(
      canvas,
      totalFrames,
      fps,
      exportDurationSec,
      mode,
      onProgress,
      renderFrame,
    );
  }

  onProgress('Done', 1);
}

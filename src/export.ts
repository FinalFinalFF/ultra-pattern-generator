import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function loadFfmpeg(onProgress?: (msg: string, pct?: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (ffmpegLoading) return ffmpegLoading;

  ffmpegLoading = (async () => {
    onProgress?.('Loading encoder…');
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return ffmpegLoading;
}

export async function recordMp4(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  onProgress: (msg: string, pct?: number) => void,
  renderFrame: (time: number) => void,
  loopPeriod: number,
  loopSeamlessly: boolean,
): Promise<void> {
  const totalFrames = Math.floor(durationSec * fps);
  const ffmpeg = await loadFfmpeg(onProgress);

  onProgress('Recording frames…', 0);

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = loopSeamlessly
      ? (frame / totalFrames) * loopPeriod
      : (frame / fps) * 0.5;
    renderFrame(t);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Failed to capture frame');
    const data = new Uint8Array(await blob.arrayBuffer());
    await ffmpeg.writeFile(`frame${String(frame).padStart(5, '0')}.png`, data);
    onProgress('Recording frames…', (frame / totalFrames) * 0.6);
  }

  onProgress('Converting to MP4…', 0.65);
  await ffmpeg.exec([
    '-framerate', String(fps),
    '-i', 'frame%05d.png',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-y', 'output.mp4',
  ]);

  onProgress('Preparing download…', 0.9);
  const data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
  const url = URL.createObjectURL(mp4Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pattern-${Date.now()}.mp4`;
  a.click();
  URL.revokeObjectURL(url);

  for (let frame = 0; frame < totalFrames; frame++) {
    try {
      await ffmpeg.deleteFile(`frame${String(frame).padStart(5, '0')}.png`);
    } catch { /* ignore */ }
  }
  try {
    await ffmpeg.deleteFile('output.mp4');
  } catch { /* ignore */ }

  onProgress('Done', 1);
}

export async function recordMp4Fallback(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  onProgress: (msg: string, pct?: number) => void,
  renderFrame: (time: number) => void,
): Promise<void> {
  if (!window.MediaRecorder) {
    throw new Error('Recording not supported in this browser');
  }

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const totalFrames = durationSec * fps;
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
        const url = URL.createObjectURL(mp4Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pattern-${Date.now()}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        onProgress('Done', 1);
        resolve();
      } catch (e) {
        reject(e);
      }
    };

    recorder.onerror = () => reject(new Error('Recording failed'));
    recorder.start();

    const interval = setInterval(() => {
      renderFrame(frame / fps);
      frame++;
      onProgress('Recording…', frame / totalFrames * 0.6);
      if (frame >= totalFrames) {
        clearInterval(interval);
        setTimeout(() => recorder.stop(), 200);
      }
    }, 1000 / fps);
  });
}

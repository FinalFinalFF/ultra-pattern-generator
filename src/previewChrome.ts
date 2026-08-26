const ZOOM_STEP = 1.2;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const FIT_PAD = 64;

type ZoomMode = 'fit' | 'manual';

export function initPreviewChrome(getNativeSize: () => { width: number; height: number }): {
  apply: () => void;
} {
  const scroll = document.getElementById('previewScroll') as HTMLElement;
  const preview = document.getElementById('preview') as HTMLElement;
  const zoomVal = document.getElementById('zoomVal') as HTMLElement;
  const dims = document.getElementById('previewDims') as HTMLElement;

  let zoom = 1;
  let mode: ZoomMode = 'fit';

  function currentScale(width: number, height: number): number {
    if (mode === 'fit') {
      const cw = scroll.clientWidth - FIT_PAD;
      const ch = scroll.clientHeight - FIT_PAD;
      if (width <= 0 || height <= 0 || cw <= 0 || ch <= 0) return 1;
      return Math.min(cw / width, ch / height);
    }
    return zoom;
  }

  function apply(): void {
    const { width, height } = getNativeSize();
    const scale = currentScale(width, height);
    const svg = preview.querySelector('svg');
    if (svg) {
      svg.style.width = `${width * scale}px`;
      svg.style.height = `${height * scale}px`;
    }
    zoomVal.textContent = `${Math.round(scale * 100)}%`;
    dims.textContent = `${width} x ${height}`;
  }

  function setManualZoom(next: number): void {
    mode = 'manual';
    zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    apply();
  }

  document.getElementById('zoomOut')!.addEventListener('click', () => {
    const { width, height } = getNativeSize();
    setManualZoom(currentScale(width, height) / ZOOM_STEP);
  });

  document.getElementById('zoomIn')!.addEventListener('click', () => {
    const { width, height } = getNativeSize();
    setManualZoom(currentScale(width, height) * ZOOM_STEP);
  });

  document.getElementById('zoomFit')!.addEventListener('click', () => {
    mode = 'fit';
    apply();
  });

  document.getElementById('zoom100')!.addEventListener('click', () => {
    setManualZoom(1);
  });

  scroll.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const { width, height } = getNativeSize();
      const factor = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      setManualZoom(currentScale(width, height) * factor);
    },
    { passive: false },
  );

  new ResizeObserver(() => {
    if (mode === 'fit') apply();
  }).observe(scroll);

  return { apply };
}

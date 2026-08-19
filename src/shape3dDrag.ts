import type { GenerateMode } from './types';

const DRAG_DEGREES_PER_PX = 0.55;
const PITCH_MIN = -89;
const PITCH_MAX = 89;

function normalizeYaw(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function clampPitch(degrees: number): number {
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, degrees));
}

export function initShape3dDragRotate(options: {
  preview: HTMLElement;
  getMode: () => GenerateMode;
  getRotation: () => { x: number; y: number };
  setRotation: (x: number, y: number) => void;
  onRotate: () => void;
  onCommit: () => void;
}): void {
  const { preview, getMode, getRotation, setRotation, onRotate, onCommit } = options;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let dragFrame: number | null = null;

  function scheduleRotate(): void {
    if (dragFrame !== null) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = null;
      onRotate();
    });
  }

  preview.addEventListener('pointerdown', (event) => {
    if (getMode() !== 'shapes3d') return;
    if (event.button !== 0) return;

    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('is-dragging');
    event.preventDefault();
  });

  preview.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    const rotation = getRotation();
    const yaw = normalizeYaw(rotation.y + dx * DRAG_DEGREES_PER_PX);
    const pitch = clampPitch(rotation.x - dy * DRAG_DEGREES_PER_PX);
    setRotation(pitch, yaw);
    scheduleRotate();
  });

  function endDrag(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    preview.classList.remove('is-dragging');
    if (preview.hasPointerCapture(event.pointerId)) {
      preview.releasePointerCapture(event.pointerId);
    }
    onCommit();
  }

  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
}

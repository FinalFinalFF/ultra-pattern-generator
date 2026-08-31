import {
  createDefaultCellType,
  densityRole,
  hasEditableDensity,
  isNoiseBulkType,
  mixDisplayPercents,
  normalizeBulkDensities,
  randomizeCellTypeDensities,
  resetCellTypeDensities,
  redistributeDensities,
  reindexOrders,
  setBulkDensityShare,
} from './cellTypes';
import { renderCellPreview } from './renderCanvas';
import { loadSvgIntoCache, parseSvgUpload, warnIfStorageLarge } from './svgSymbols';
import type { AppState, CellTypeDef } from './types';
import { TYPE_IDS } from './types';

type OnChange = () => void;

const TYPE_DESCRIPTIONS: Record<string, string> = {
  [TYPE_IDS.grid]: 'Mix share — patterned cells (Grid, Dot, Hexagon, Solid, and custom types add to 100%)',
  [TYPE_IDS.dot]: 'Mix share — filled circles in patterned cells',
  [TYPE_IDS.hexagon]: 'Mix share — filled hexagons in patterned cells',
  [TYPE_IDS.solid]: 'Mix share — filled squares in patterned cells',
  [TYPE_IDS.logo]: 'Edge chance — how often this mark appears on region borders',
  [TYPE_IDS.outline]: 'Edge chance — outline band at region borders',
  [TYPE_IDS.crosshatch]: 'Edge chance — crosshatch band at region borders',
  [TYPE_IDS.empty]: 'Empty space — how much of the field is left open',
};

const DENSITY_TITLES = {
  mix: 'Share of patterned cells',
  empty: 'Empty space',
  edge: 'Chance on region borders',
} as const;

function typeDescription(type: CellTypeDef): string {
  return TYPE_DESCRIPTIONS[type.id] ?? 'Mix share — custom cell type';
}

function densityMinForType(id: string): number {
  return isNoiseBulkType(id) ? 0.01 : 0;
}

function formatDensityVal(id: string, pct: number): string {
  const role = densityRole(id);
  if (role === 'edge') return `${pct}% edge`;
  if (role === 'empty') return `${pct}% empty`;
  return `${pct}% mix`;
}

function densityPctForType(type: CellTypeDef, mixPct: Map<string, number>): number {
  if (type.enabled && mixPct.has(type.id)) return mixPct.get(type.id)!;
  return Math.round(type.density * 100);
}

function applyDensityChange(
  getState: () => AppState,
  setState: (s: AppState) => void,
  id: string,
  density: number,
): void {
  const s = getState();
  const updated = s.cellTypes.map((t) => (t.id === id ? { ...t, density } : t));
  setState({
    ...s,
    cellTypes: isNoiseBulkType(id) ? setBulkDensityShare(updated, id, density) : updated,
  });
}

function syncDensityDisplays(list: Element, types: CellTypeDef[], activeId?: string): void {
  const mixPct = mixDisplayPercents(types);
  for (const type of types) {
    const row = list.querySelector(`[data-id="${type.id}"]`);
    if (!row) continue;
    const valEl = row.querySelector('.item-density-val');
    const slider = row.querySelector<HTMLInputElement>('.item-density');
    const pct = densityPctForType(type, mixPct);
    if (valEl && !valEl.classList.contains('muted')) {
      valEl.textContent = formatDensityVal(type.id, pct);
    }
    if (slider && type.id !== activeId) {
      slider.value = String(type.density);
    }
  }
}

export function initCellTypeUi(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
): { refresh: () => void } {
  container.innerHTML = `
    <div class="panel-actions">
      <button type="button" id="randomizeDensities">Randomize mix</button>
      <button type="button" id="resetDensities">Reset mix</button>
      <button type="button" id="addCellType">+ Add Type</button>
    </div>
    <div id="cellTypeList" class="item-list"></div>
  `;

  container.querySelector('#randomizeDensities')!.addEventListener('click', () => {
    const state = getState();
    setState({
      ...state,
      cellTypes: randomizeCellTypeDensities(state.cellTypes),
    });
    onChange();
    renderList(container, getState, setState, onChange);
  });

  container.querySelector('#resetDensities')!.addEventListener('click', () => {
    const state = getState();
    setState({
      ...state,
      cellTypes: resetCellTypeDensities(state.cellTypes),
    });
    onChange();
    renderList(container, getState, setState, onChange);
  });

  container.querySelector('#addCellType')!.addEventListener('click', () => {
    const state = getState();
    const order = state.cellTypes.length;
    const newType = createDefaultCellType(order);
    const cellTypes = normalizeBulkDensities([...state.cellTypes, newType]);
    setState({
      ...state,
      cellTypes,
    });
    onChange();
    renderList(container, getState, setState, onChange, newType.id);
  });

  renderList(container, getState, setState, onChange);

  const overlay = document.getElementById('cellTypeEditorOverlay')!;
  document.getElementById('cellTypeEditorDone')!.addEventListener('click', () => closeEditor(overlay));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (overlay.classList.contains('hidden')) return;
    event.preventDefault();
    closeEditor(overlay);
  });

  return {
    refresh: () => renderList(container, getState, setState, onChange),
  };
}

function renderTypeRow(type: CellTypeDef, mixPct: Map<string, number>): string {
  const desc = typeDescription(type);
  const editable = hasEditableDensity(type);
  const min = densityMinForType(type.id);
  const role = densityRole(type.id);
  const pct = densityPctForType(type, mixPct);
  const densityControl = editable
    ? `<input type="range" class="item-density" data-density="${type.id}" min="${min}" max="1" step="0.01" value="${type.density}" aria-label="${DENSITY_TITLES[role]}"/>`
    : '';
  const densityVal = editable
    ? `<span class="item-density-val" title="${DENSITY_TITLES[role]}">${formatDensityVal(type.id, pct)}</span>`
    : '<span class="item-density-val muted">—</span>';

  return `
    <div class="item-row${type.enabled ? '' : ' is-disabled'}" data-id="${type.id}">
      <span class="item-grip" data-grip="${type.id}" title="Drag to reorder" role="button" aria-label="Drag to reorder"></span>
      <canvas class="item-preview" width="36" height="36" data-preview="${type.id}"></canvas>
      <div class="item-body">
        <div class="item-meta">
          <label class="item-enable" title="${desc}">
            <input type="checkbox" data-enable="${type.id}" ${type.enabled ? 'checked' : ''}/>
            <span class="item-name">${type.name}</span>
          </label>
          ${densityVal}
        </div>
        ${densityControl}
      </div>
      <button type="button" class="item-edit" data-edit="${type.id}">Edit</button>
    </div>`;
}

function renderList(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  editId?: string,
): void {
  const list = container.querySelector('#cellTypeList')!;
  const state = getState();
  const types = [...state.cellTypes].sort((a, b) => a.order - b.order);
  const mixPct = mixDisplayPercents(types);

  list.innerHTML = types.map((t) => renderTypeRow(t, mixPct)).join('');

  types.forEach((t) => {
    const preview = list.querySelector(`[data-preview="${t.id}"]`) as HTMLCanvasElement;
    if (preview) renderCellPreview(preview, t);
  });

  list.querySelectorAll('[data-density]').forEach((el) => {
    el.addEventListener('input', (e) => {
      const slider = e.target as HTMLInputElement;
      const id = slider.dataset.density!;
      const density = parseFloat(slider.value);
      applyDensityChange(getState, setState, id, density);
      syncDensityDisplays(list, getState().cellTypes, id);
      onChange();
    });
    el.addEventListener('change', (e) => {
      const slider = e.target as HTMLInputElement;
      const id = slider.dataset.density!;
      const type = getState().cellTypes.find((t) => t.id === id);
      if (type) slider.value = String(type.density);
      syncDensityDisplays(list, getState().cellTypes);
    });
  });

  list.querySelectorAll('[data-enable]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.enable!;
      const s = getState();
      const updated = s.cellTypes.map((t) =>
        t.id === id ? { ...t, enabled: (e.target as HTMLInputElement).checked } : t,
      );
      setState({
        ...s,
        cellTypes: isNoiseBulkType(id) ? normalizeBulkDensities(updated) : updated,
      });
      onChange();
      renderList(container, getState, setState, onChange);
    });
  });

  list.querySelectorAll('[data-edit]').forEach((el) => {
    el.addEventListener('click', () => {
      renderEditor(container, getState, setState, onChange, (el as HTMLElement).dataset.edit!);
    });
  });

  bindDragReorder(list, getState, setState, onChange);

  if (editId) renderEditor(container, getState, setState, onChange, editId);
}

function bindDragReorder(
  list: Element,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
): void {
  list.querySelectorAll<HTMLElement>('.item-row').forEach((row) => {
    const grip = row.querySelector<HTMLElement>('[data-grip]');
    grip?.addEventListener('pointerdown', () => {
      row.draggable = true;
    });
    grip?.addEventListener('pointerup', () => {
      if (!row.classList.contains('is-dragging')) row.draggable = false;
    });
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', row.dataset.id ?? '');
      e.dataTransfer?.setDragImage(row, 12, 12);
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
      row.draggable = false;
      row.classList.remove('is-dragging');
      commitListOrder(list, getState, setState, onChange);
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = list.querySelector<HTMLElement>('.item-row.is-dragging');
      if (!dragging || dragging === row) return;
      const rect = row.getBoundingClientRect();
      if (e.clientY > rect.top + rect.height / 2) row.after(dragging);
      else row.before(dragging);
    });
    row.addEventListener('drop', (e) => e.preventDefault());
  });
}

function commitListOrder(
  list: Element,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
): void {
  const ids = [...list.querySelectorAll<HTMLElement>('.item-row')].map((row) => row.dataset.id!);
  const s = getState();
  const current = [...s.cellTypes].sort((a, b) => a.order - b.order).map((t) => t.id);
  if (ids.length !== current.length || ids.every((id, i) => id === current[i])) return;
  const byId = new Map(s.cellTypes.map((t) => [t.id, t]));
  const cellTypes = ids.flatMap((id, order) => {
    const type = byId.get(id);
    return type ? [{ ...type, order }] : [];
  });
  setState({ ...s, cellTypes: reindexOrders(cellTypes) });
  onChange();
}

function closeEditor(overlay: HTMLElement): void {
  overlay.classList.add('hidden');
}

function syncEditorPreview(id: string, getState: () => AppState): void {
  const type = getState().cellTypes.find((t) => t.id === id);
  const preview = document.getElementById('cellTypeEditorPreview') as HTMLCanvasElement | null;
  if (!type || !preview) return;
  renderCellPreview(preview, type);
}

function deleteCellType(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  id: string,
): void {
  const s = getState();
  if (s.cellTypes.length <= 1) return;
  if (!confirm('Delete this cell type?')) return;
  setState({
    ...s,
    cellTypes: redistributeDensities(s.cellTypes, id),
  });
  onChange();
  closeEditor(document.getElementById('cellTypeEditorOverlay')!);
  renderList(container, getState, setState, onChange);
}

function renderEditor(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  id: string,
): void {
  const type = getState().cellTypes.find((t) => t.id === id);
  if (!type) return;

  const overlay = document.getElementById('cellTypeEditorOverlay')!;
  const form = document.getElementById('cellTypeEditorForm')!;
  const editable = hasEditableDensity(type);
  const min = densityMinForType(type.id);
  const showBorderDepth =
    type.id === TYPE_IDS.crosshatch || type.id === TYPE_IDS.outline;
  const borderDepth = type.borderDepth ?? (type.id === TYPE_IDS.crosshatch ? 2 : 1);
  const borderDepthMax = type.id === TYPE_IDS.crosshatch ? 4 : 3;
  const borderDepthMin = type.id === TYPE_IDS.crosshatch ? 1 : 0;

  form.innerHTML = `
    <label>Name<input type="text" id="editName"/></label>
    <label>Mode
      <select id="editMode">
        ${['none', 'mesh', 'fill', 'stroke', 'circle', 'hexagon', 'crosshatch', 'svg'].map((m) => `<option value="${m}" ${type.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </label>
    <label${showBorderDepth ? '' : ' class="editor-span-2"'}>${DENSITY_TITLES[densityRole(type.id)]} <span id="densityVal">${formatDensityVal(type.id, densityPctForType(type, mixDisplayPercents(getState().cellTypes)))}</span>
      <input type="range" id="editDensity" min="${min}" max="1" step="0.01" value="${type.density}" ${editable ? '' : 'disabled'}/>
    </label>
    ${showBorderDepth ? `<label>Border depth <span id="borderDepthVal">${borderDepth}</span>
      <input type="range" id="editBorderDepth" min="${borderDepthMin}" max="${borderDepthMax}" step="1" value="${borderDepth}"/>
    </label>` : ''}
    <label>Fill color<input type="color" id="editFill" value="${type.fill}"/></label>
    <label>Stroke color<input type="color" id="editStroke" value="${type.stroke}"/></label>
    <label>Stroke width<input type="number" id="editStrokeWidth" min="0.5" max="8" step="0.5" value="${type.strokeWidth}"/></label>
    <label>Color application
      <select id="editColorApp">
        ${['fill', 'stroke', 'both'].map((m) => `<option value="${m}" ${type.colorApplication === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </label>
    <label>Circle radius<input type="range" id="editCircleR" min="0.1" max="0.49" step="0.01" value="${type.circleRadius}"/></label>
    <label>Hatch spacing<input type="number" id="editHatchSpace" min="2" max="20" value="${type.hatchSpacing}"/></label>
    <label>Hatch angle<input type="number" id="editHatchAngle" min="0" max="180" value="${type.hatchAngle}"/></label>
    <div id="svgUploadSection" class="${type.mode === 'svg' ? '' : 'hidden'} editor-span-2">
      <label class="file-label">Upload SVG (1×1 cell)
        <input type="file" id="editSvgUpload" accept=".svg"/>
      </label>
    </div>
    <button type="button" id="deleteType" class="editor-delete"${getState().cellTypes.length <= 1 ? ' disabled' : ''}>Delete type</button>
  `;
  (form.querySelector('#editName') as HTMLInputElement).value = type.name;

  const refreshSidebar = () => renderList(container, getState, setState, onChange);

  const update = (patch: Partial<CellTypeDef>) => {
    const s = getState();
    setState({
      ...s,
      cellTypes: s.cellTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
    onChange();
    refreshSidebar();
    syncEditorPreview(id, getState);
  };

  form.querySelector('#editName')!.addEventListener('input', (e) =>
    update({ name: (e.target as HTMLInputElement).value }),
  );
  form.querySelector('#editMode')!.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value as CellTypeDef['mode'];
    form.querySelector('#svgUploadSection')!.classList.toggle('hidden', mode !== 'svg');
    update({ mode });
  });
  form.querySelector('#editDensity')!.addEventListener('input', (e) => {
    const slider = e.target as HTMLInputElement;
    const density = parseFloat(slider.value);
    applyDensityChange(getState, setState, id, density);
    const latest = getState().cellTypes.find((t) => t.id === id);
    if (latest) slider.value = String(latest.density);
    const pct = densityPctForType(
      latest ?? type,
      mixDisplayPercents(getState().cellTypes),
    );
    (form.querySelector('#densityVal') as HTMLElement).textContent = formatDensityVal(id, pct);
    onChange();
    refreshSidebar();
    syncEditorPreview(id, getState);
  });
  const borderDepthEl = form.querySelector('#editBorderDepth') as HTMLInputElement | null;
  borderDepthEl?.addEventListener('input', (e) => {
    const borderDepthValue = Math.round(parseFloat((e.target as HTMLInputElement).value));
    (form.querySelector('#borderDepthVal') as HTMLElement).textContent = String(borderDepthValue);
    update({ borderDepth: borderDepthValue });
  });
  form.querySelector('#editFill')!.addEventListener('input', (e) =>
    update({ fill: (e.target as HTMLInputElement).value }),
  );
  form.querySelector('#editStroke')!.addEventListener('input', (e) =>
    update({ stroke: (e.target as HTMLInputElement).value }),
  );
  form.querySelector('#editStrokeWidth')!.addEventListener('change', (e) =>
    update({ strokeWidth: parseFloat((e.target as HTMLInputElement).value) }),
  );
  form.querySelector('#editColorApp')!.addEventListener('change', (e) =>
    update({ colorApplication: (e.target as HTMLSelectElement).value as CellTypeDef['colorApplication'] }),
  );
  form.querySelector('#editCircleR')!.addEventListener('input', (e) =>
    update({ circleRadius: parseFloat((e.target as HTMLInputElement).value) }),
  );
  form.querySelector('#editHatchSpace')!.addEventListener('change', (e) =>
    update({ hatchSpacing: parseInt((e.target as HTMLInputElement).value, 10) }),
  );
  form.querySelector('#editHatchAngle')!.addEventListener('change', (e) =>
    update({ hatchAngle: parseInt((e.target as HTMLInputElement).value, 10) }),
  );
  form.querySelector('#editSvgUpload')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const t = getState().cellTypes.find((x) => x.id === id)!;
    try {
      const { symbolId, innerMarkup, dataUrl } = await parseSvgUpload(file, t);
      update({ svgSymbolId: symbolId, svgMarkup: innerMarkup });
      await loadSvgIntoCache(symbolId, dataUrl);
      warnIfStorageLarge(getState().cellTypes);
      onChange();
    } catch {
      alert('Failed to parse SVG');
    }
  });
  form.querySelector('#deleteType')!.addEventListener('click', () => {
    deleteCellType(container, getState, setState, onChange, id);
  });

  overlay.classList.remove('hidden');
  syncEditorPreview(id, getState);
  (form.querySelector('#editName') as HTMLInputElement).focus();
}

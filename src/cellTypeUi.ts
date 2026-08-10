import {
  createDefaultCellType,
  getDefaultCellTypes,
  normalizeWeights,
  redistributeWeights,
  reindexOrders,
} from './cellTypes';
import { renderCellPreview } from './renderCanvas';
import { loadSvgIntoCache, parseSvgUpload, warnIfStorageLarge } from './svgSymbols';
import type { AppState, CellTypeDef } from './types';

type OnChange = () => void;

export function initCellTypeUi(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
): void {
  container.innerHTML = `
    <div class="panel-actions">
      <button type="button" id="addCellType">+ Add Type</button>
      <button type="button" id="resetCellTypes" class="secondary">Reset Defaults</button>
    </div>
    <div id="cellTypeList" class="item-list"></div>
    <div id="cellTypeEditor" class="editor-panel hidden"></div>
  `;

  container.querySelector('#addCellType')!.addEventListener('click', () => {
    const state = getState();
    const order = state.cellTypes.length;
    const newType = createDefaultCellType(order);
    setState({
      ...state,
      cellTypes: normalizeWeights([...state.cellTypes, newType]),
    });
    onChange();
    renderList(container, getState, setState, onChange, newType.id);
  });

  container.querySelector('#resetCellTypes')!.addEventListener('click', () => {
    if (!confirm('Reset cell types to defaults?')) return;
    setState({ ...getState(), cellTypes: getDefaultCellTypes() });
    onChange();
    renderList(container, getState, setState, onChange);
  });

  renderList(container, getState, setState, onChange);
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

  list.innerHTML = types
    .map(
      (t, idx) => `
    <div class="item-row" data-id="${t.id}">
      <span class="drag-handle" title="Reorder">☰</span>
      <canvas class="item-preview" width="32" height="32" data-preview="${t.id}"></canvas>
      <label class="item-enable"><input type="checkbox" data-enable="${t.id}" ${t.enabled ? 'checked' : ''}/></label>
      <span class="item-name">${t.name}${t.noiseAssigned === false ? ' <span class="auto-badge">auto</span>' : ''}</span>
      <span class="item-weight">${t.noiseAssigned === false ? '—' : `${Math.round(t.weight * 100)}%`}</span>
      <button type="button" class="icon-btn" data-edit="${t.id}">Edit</button>
      <button type="button" class="icon-btn" data-up="${t.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn" data-down="${t.id}" ${idx === types.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-btn danger" data-delete="${t.id}">×</button>
    </div>`,
    )
    .join('');

  types.forEach((t) => {
    const preview = list.querySelector(`[data-preview="${t.id}"]`) as HTMLCanvasElement;
    if (preview) renderCellPreview(preview, t);
  });

  list.querySelectorAll('[data-enable]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const id = (e.target as HTMLInputElement).dataset.enable!;
      const s = getState();
      setState({
        ...s,
        cellTypes: normalizeWeights(
          s.cellTypes.map((t) => (t.id === id ? { ...t, enabled: (e.target as HTMLInputElement).checked } : t)),
        ),
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

  list.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.delete!;
      const s = getState();
      if (s.cellTypes.length <= 1) return;
      if (!confirm('Delete this cell type?')) return;
      setState({ ...s, cellTypes: redistributeWeights(s.cellTypes, id) });
      onChange();
      renderList(container, getState, setState, onChange);
    });
  });

  list.querySelectorAll('[data-up]').forEach((el) => {
    el.addEventListener('click', () => moveType(container, getState, setState, onChange, (el as HTMLElement).dataset.up!, -1));
  });

  list.querySelectorAll('[data-down]').forEach((el) => {
    el.addEventListener('click', () => moveType(container, getState, setState, onChange, (el as HTMLElement).dataset.down!, 1));
  });

  if (editId) renderEditor(container, getState, setState, onChange, editId);
}

function moveType(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  id: string,
  dir: number,
): void {
  const s = getState();
  const sorted = [...s.cellTypes].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((t) => t.id === id);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const tmp = sorted[idx].order;
  sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
  sorted[swapIdx] = { ...sorted[swapIdx], order: tmp };
  setState({ ...s, cellTypes: reindexOrders(sorted) });
  onChange();
  renderList(container, getState, setState, onChange);
}

function renderEditor(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  id: string,
): void {
  const editor = container.querySelector('#cellTypeEditor')!;
  const type = getState().cellTypes.find((t) => t.id === id);
  if (!type) return;

  editor.classList.remove('hidden');
  editor.innerHTML = `
    <h4>Edit: ${type.name}</h4>
    <label>Name<input type="text" id="editName" value="${type.name}"/></label>
    <label>Mode
      <select id="editMode">
        ${['none', 'mesh', 'fill', 'stroke', 'circle', 'crosshatch', 'diagonal', 'svg'].map((m) => `<option value="${m}" ${type.mode === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </label>
    <label>Shape weight <span id="weightVal">${Math.round(type.weight * 100)}%</span>
      <input type="range" id="editWeight" min="0.01" max="1" step="0.01" value="${type.weight}" ${type.noiseAssigned === false ? 'disabled' : ''}/>
    </label>
    <label>Fill color<input type="color" id="editFill" value="${type.fill}"/></label>
    <label>Stroke color<input type="color" id="editStroke" value="${type.stroke}"/></label>
    <label>Stroke width<input type="number" id="editStrokeWidth" min="0.5" max="8" step="0.5" value="${type.strokeWidth}"/></label>
    <label>Color application
      <select id="editColorApp">
        ${['fill', 'stroke', 'both', 'accent'].map((m) => `<option value="${m}" ${type.colorApplication === m ? 'selected' : ''}>${m}</option>`).join('')}
      </select>
    </label>
    <label>Circle radius<input type="range" id="editCircleR" min="0.1" max="0.49" step="0.01" value="${type.circleRadius}"/></label>
    <label>Hatch spacing<input type="number" id="editHatchSpace" min="2" max="20" value="${type.hatchSpacing}"/></label>
    <label>Hatch angle<input type="number" id="editHatchAngle" min="0" max="180" value="${type.hatchAngle}"/></label>
    <div id="svgUploadSection" class="${type.mode === 'svg' ? '' : 'hidden'}">
      <label class="file-label">Upload SVG (1×1 cell)
        <input type="file" id="editSvgUpload" accept=".svg"/>
      </label>
    </div>
    <button type="button" id="closeEditor" class="secondary">Close</button>
  `;

  const update = (patch: Partial<CellTypeDef>) => {
    const s = getState();
    setState({
      ...s,
      cellTypes: s.cellTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
    onChange();
    renderList(container, getState, setState, onChange, id);
  };

  editor.querySelector('#editName')!.addEventListener('input', (e) =>
    update({ name: (e.target as HTMLInputElement).value }),
  );
  editor.querySelector('#editMode')!.addEventListener('change', (e) => {
    const mode = (e.target as HTMLSelectElement).value as CellTypeDef['mode'];
    editor.querySelector('#svgUploadSection')!.classList.toggle('hidden', mode !== 'svg');
    update({ mode });
  });
  editor.querySelector('#editWeight')!.addEventListener('input', (e) => {
    const weight = parseFloat((e.target as HTMLInputElement).value);
    (editor.querySelector('#weightVal') as HTMLElement).textContent = `${Math.round(weight * 100)}%`;
    const s = getState();
    setState({
      ...s,
      cellTypes: normalizeWeights(
        s.cellTypes.map((t) => (t.id === id ? { ...t, weight } : t)),
      ),
    });
    onChange();
    renderList(container, getState, setState, onChange, id);
  });
  editor.querySelector('#editFill')!.addEventListener('input', (e) =>
    update({ fill: (e.target as HTMLInputElement).value }),
  );
  editor.querySelector('#editStroke')!.addEventListener('input', (e) =>
    update({ stroke: (e.target as HTMLInputElement).value }),
  );
  editor.querySelector('#editStrokeWidth')!.addEventListener('change', (e) =>
    update({ strokeWidth: parseFloat((e.target as HTMLInputElement).value) }),
  );
  editor.querySelector('#editColorApp')!.addEventListener('change', (e) =>
    update({ colorApplication: (e.target as HTMLSelectElement).value as CellTypeDef['colorApplication'] }),
  );
  editor.querySelector('#editCircleR')!.addEventListener('input', (e) =>
    update({ circleRadius: parseFloat((e.target as HTMLInputElement).value) }),
  );
  editor.querySelector('#editHatchSpace')!.addEventListener('change', (e) =>
    update({ hatchSpacing: parseInt((e.target as HTMLInputElement).value, 10) }),
  );
  editor.querySelector('#editHatchAngle')!.addEventListener('change', (e) =>
    update({ hatchAngle: parseInt((e.target as HTMLInputElement).value, 10) }),
  );
  editor.querySelector('#editSvgUpload')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const t = getState().cellTypes.find((x) => x.id === id)!;
    try {
      const { symbolId, innerMarkup, dataUrl } = await parseSvgUpload(file, t);
      update({ svgSymbolId: symbolId, svgMarkup: innerMarkup });
      await loadSvgIntoCache(symbolId, dataUrl);
      warnIfStorageLarge(getState().cellTypes);
      onChange();
    } catch (err) {
      alert('Failed to parse SVG');
    }
  });
  editor.querySelector('#closeEditor')!.addEventListener('click', () => {
    editor.classList.add('hidden');
  });
}

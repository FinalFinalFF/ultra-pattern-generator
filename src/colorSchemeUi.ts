import {
  createDefaultColor,
  createScheme,
  duplicateScheme,
  getDefaultColorSchemes,
} from './colorSchemes';
import { normalizeWeights, redistributeWeights, reindexOrders } from './cellTypes';
import type { AppState, ColorDef } from './types';

type OnChange = () => void;

export function initColorSchemeUi(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
): void {
  container.innerHTML = `
    <div class="panel-actions">
      <label>Scheme
        <select id="schemeSelect"></select>
      </label>
      <button type="button" id="addScheme">+ Scheme</button>
      <button type="button" id="dupScheme" class="secondary">Duplicate</button>
      <button type="button" id="delScheme" class="secondary danger">Delete</button>
    </div>
    <label>Background <input type="color" id="schemeBg"/></label>
    <div class="panel-actions">
      <button type="button" id="addColor">+ Add Color</button>
      <button type="button" id="resetSchemes" class="secondary">Reset Defaults</button>
    </div>
    <div id="colorList" class="item-list"></div>
    <div id="colorEditor" class="editor-panel hidden"></div>
  `;

  container.querySelector('#addScheme')!.addEventListener('click', () => {
    const s = getState();
    const scheme = createScheme(`Scheme ${s.colorSchemes.length + 1}`);
    setState({
      ...s,
      colorSchemes: [...s.colorSchemes, scheme],
      activeSchemeId: scheme.id,
    });
    onChange();
    render(container, getState, setState, onChange);
  });

  container.querySelector('#dupScheme')!.addEventListener('click', () => {
    const s = getState();
    const active = s.colorSchemes.find((x) => x.id === s.activeSchemeId);
    if (!active) return;
    const dup = duplicateScheme(active);
    setState({ ...s, colorSchemes: [...s.colorSchemes, dup], activeSchemeId: dup.id });
    onChange();
    render(container, getState, setState, onChange);
  });

  container.querySelector('#delScheme')!.addEventListener('click', () => {
    const s = getState();
    if (s.colorSchemes.length <= 1) return;
    if (!confirm('Delete this scheme?')) return;
    const remaining = s.colorSchemes.filter((x) => x.id !== s.activeSchemeId);
    setState({ ...s, colorSchemes: remaining, activeSchemeId: remaining[0].id });
    onChange();
    render(container, getState, setState, onChange);
  });

  container.querySelector('#addColor')!.addEventListener('click', () => {
    const s = getState();
    const scheme = s.colorSchemes.find((x) => x.id === s.activeSchemeId)!;
    const newColor = createDefaultColor(scheme.colors.length);
    const updated = {
      ...scheme,
      colors: normalizeWeights([...scheme.colors, newColor]),
    };
    setState({
      ...s,
      colorSchemes: s.colorSchemes.map((x) => (x.id === scheme.id ? updated : x)),
    });
    onChange();
    render(container, getState, setState, onChange, newColor.id);
  });

  container.querySelector('#resetSchemes')!.addEventListener('click', () => {
    if (!confirm('Reset color schemes to defaults?')) return;
    setState({ ...getState(), colorSchemes: getDefaultColorSchemes(), activeSchemeId: 'monochrome' });
    onChange();
    render(container, getState, setState, onChange);
  });

  render(container, getState, setState, onChange);
}

function render(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  editColorId?: string,
): void {
  const s = getState();
  const select = container.querySelector('#schemeSelect') as HTMLSelectElement;
  select.innerHTML = s.colorSchemes
    .map((sc) => `<option value="${sc.id}" ${sc.id === s.activeSchemeId ? 'selected' : ''}>${sc.name}</option>`)
    .join('');

  select.onchange = () => {
    setState({ ...getState(), activeSchemeId: select.value });
    onChange();
    render(container, getState, setState, onChange);
  };

  const scheme = s.colorSchemes.find((x) => x.id === s.activeSchemeId)!;
  const bgInput = container.querySelector('#schemeBg') as HTMLInputElement;
  bgInput.value = scheme.backgroundColor;
  bgInput.oninput = () => {
    const st = getState();
    setState({
      ...st,
      colorSchemes: st.colorSchemes.map((x) =>
        x.id === scheme.id ? { ...x, backgroundColor: bgInput.value } : x,
      ),
    });
    onChange();
  };

  const list = container.querySelector('#colorList')!;
  const colors = [...scheme.colors].sort((a, b) => a.order - b.order);
  list.innerHTML = colors
    .map(
      (c, idx) => `
    <div class="item-row" data-id="${c.id}">
      <span class="color-swatch" style="background:${c.hex}"></span>
      <label class="item-enable"><input type="checkbox" data-enable="${c.id}" ${c.enabled ? 'checked' : ''}/></label>
      <span class="item-name">${c.name}</span>
      <span class="item-weight">${Math.round(c.weight * 100)}%</span>
      <button type="button" class="icon-btn" data-edit="${c.id}">Edit</button>
      <button type="button" class="icon-btn" data-up="${c.id}" ${idx === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-btn" data-down="${c.id}" ${idx === colors.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-btn danger" data-delete="${c.id}">×</button>
    </div>`,
    )
    .join('');

  list.querySelectorAll('[data-enable]').forEach((el) => {
    el.addEventListener('change', (e) => {
      const cid = (e.target as HTMLInputElement).dataset.enable!;
      const st = getState();
      const sc = st.colorSchemes.find((x) => x.id === st.activeSchemeId)!;
      const updated = {
        ...sc,
        colors: normalizeWeights(
          sc.colors.map((c) =>
            c.id === cid ? { ...c, enabled: (e.target as HTMLInputElement).checked } : c,
          ),
        ),
      };
      setState({ ...st, colorSchemes: st.colorSchemes.map((x) => (x.id === sc.id ? updated : x)) });
      onChange();
      render(container, getState, setState, onChange);
    });
  });

  list.querySelectorAll('[data-edit]').forEach((el) => {
    el.addEventListener('click', () =>
      renderColorEditor(container, getState, setState, onChange, (el as HTMLElement).dataset.edit!),
    );
  });

  list.querySelectorAll('[data-delete]').forEach((el) => {
    el.addEventListener('click', () => {
      const cid = (el as HTMLElement).dataset.delete!;
      const st = getState();
      const sc = st.colorSchemes.find((x) => x.id === st.activeSchemeId)!;
      if (sc.colors.length <= 1) return;
      const updated = { ...sc, colors: redistributeWeights(sc.colors, cid) };
      setState({ ...st, colorSchemes: st.colorSchemes.map((x) => (x.id === sc.id ? updated : x)) });
      onChange();
      render(container, getState, setState, onChange);
    });
  });

  list.querySelectorAll('[data-up]').forEach((el) => {
    el.addEventListener('click', () => moveColor(container, getState, setState, onChange, (el as HTMLElement).dataset.up!, -1));
  });

  list.querySelectorAll('[data-down]').forEach((el) => {
    el.addEventListener('click', () => moveColor(container, getState, setState, onChange, (el as HTMLElement).dataset.down!, 1));
  });

  if (editColorId) renderColorEditor(container, getState, setState, onChange, editColorId);
}

function moveColor(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  colorId: string,
  dir: number,
): void {
  const st = getState();
  const sc = st.colorSchemes.find((x) => x.id === st.activeSchemeId)!;
  const sorted = [...sc.colors].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((c) => c.id === colorId);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const tmp = sorted[idx].order;
  sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
  sorted[swapIdx] = { ...sorted[swapIdx], order: tmp };
  const updated = { ...sc, colors: reindexOrders(sorted) };
  setState({ ...st, colorSchemes: st.colorSchemes.map((x) => (x.id === sc.id ? updated : x)) });
  onChange();
  render(container, getState, setState, onChange);
}

function renderColorEditor(
  container: HTMLElement,
  getState: () => AppState,
  setState: (s: AppState) => void,
  onChange: OnChange,
  colorId: string,
): void {
  const editor = container.querySelector('#colorEditor')!;
  const st = getState();
  const sc = st.colorSchemes.find((x) => x.id === st.activeSchemeId)!;
  const color = sc.colors.find((c) => c.id === colorId);
  if (!color) return;

  editor.classList.remove('hidden');
  editor.innerHTML = `
    <h4>Edit: ${color.name}</h4>
    <label>Name<input type="text" id="colorName" value="${color.name}"/></label>
    <label>Hex<input type="color" id="colorHex" value="${color.hex}"/></label>
    <label>Weight <span id="colorWeightVal">${Math.round(color.weight * 100)}%</span>
      <input type="range" id="colorWeight" min="0.01" max="1" step="0.01" value="${color.weight}"/>
    </label>
    <button type="button" id="closeColorEditor" class="secondary">Close</button>
  `;

  const update = (patch: Partial<ColorDef>) => {
    const s = getState();
    const scheme = s.colorSchemes.find((x) => x.id === s.activeSchemeId)!;
    const updated = {
      ...scheme,
      colors: scheme.colors.map((c) => (c.id === colorId ? { ...c, ...patch } : c)),
    };
    setState({ ...s, colorSchemes: s.colorSchemes.map((x) => (x.id === scheme.id ? updated : x)) });
    onChange();
    render(container, getState, setState, onChange, colorId);
  };

  editor.querySelector('#colorName')!.addEventListener('input', (e) =>
    update({ name: (e.target as HTMLInputElement).value }),
  );
  editor.querySelector('#colorHex')!.addEventListener('input', (e) =>
    update({ hex: (e.target as HTMLInputElement).value }),
  );
  editor.querySelector('#colorWeight')!.addEventListener('input', (e) => {
    const weight = parseFloat((e.target as HTMLInputElement).value);
    (editor.querySelector('#colorWeightVal') as HTMLElement).textContent = `${Math.round(weight * 100)}%`;
    const s = getState();
    const scheme = s.colorSchemes.find((x) => x.id === s.activeSchemeId)!;
    const updated = {
      ...scheme,
      colors: normalizeWeights(
        scheme.colors.map((c) => (c.id === colorId ? { ...c, weight } : c)),
      ),
    };
    setState({ ...s, colorSchemes: s.colorSchemes.map((x) => (x.id === scheme.id ? updated : x)) });
    onChange();
    render(container, getState, setState, onChange, colorId);
  });
  editor.querySelector('#closeColorEditor')!.addEventListener('click', () => {
    editor.classList.add('hidden');
  });
}

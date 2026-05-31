const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const emptyState = document.getElementById("emptyState");
const imageStage = document.getElementById("imageStage");
const statusText = document.getElementById("statusText");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const resetButton = document.getElementById("resetButton");
const fitButton = document.getElementById("fitButton");
const beforeAfterButton = document.getElementById("beforeAfterButton");
const exportButton = document.getElementById("exportButton");
const savePresetButton = document.getElementById("savePresetButton");
const loadPresetButton = document.getElementById("loadPresetButton");
const presetInput = document.getElementById("presetInput");
const maskStatus = document.getElementById("maskStatus");
const maskPanel = document.getElementById("maskPanel");
const maskPanelContent = document.getElementById("maskPanelContent");
const maskOverlayLayer = document.getElementById("maskOverlayLayer");

const controlGroups = {
  light: document.getElementById("lightControls"),
  presence: document.getElementById("presenceControls"),
  color: document.getElementById("colorControls"),
  colorGrading: document.getElementById("colorGradingControls"),
  hsl: document.getElementById("hslControls")
};

const controls = [
  { group: "light", key: "exposure", label: "Exposure", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "light", key: "contrast", label: "Contrast", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "light", key: "highlights", label: "Highlights", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "light", key: "shadows", label: "Shadows", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "light", key: "whites", label: "Whites", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "light", key: "blacks", label: "Blacks", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "presence", key: "dehaze", label: "Dehaze", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "presence", key: "clarity", label: "Clarity", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "color", key: "temp", label: "Temp", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "color", key: "tint", label: "Tint", min: -100, max: 100, step: 1, value: 0, decimals: 0 },
  { group: "color", key: "saturation", label: "Saturation", min: -100, max: 100, step: 1, value: 0, decimals: 0 }
];

const gradingSliderZones = ["Shadows", "Midtones", "Highlights", "Global"];
const gradingWheelZones = ["Global", "Shadows", "Midtones", "Highlights"];
const hslColors = [
  { name: "Red", swatch: "#ff2d2d", hue: 0 },
  { name: "Orange", swatch: "#ff8a1f", hue: 30 },
  { name: "Yellow", swatch: "#ffe11f", hue: 60 },
  { name: "Green", swatch: "#17bf33", hue: 120 },
  { name: "Aqua", swatch: "#20d5e5", hue: 180 },
  { name: "Blue", swatch: "#3888ff", hue: 240 },
  { name: "Purple", swatch: "#9b26ff", hue: 270 },
  { name: "Magenta", swatch: "#ff18d4", hue: 300 },
  { name: "Pink", swatch: "#ff5ca8", hue: 330 }
];

const state = Object.fromEntries(controls.map(control => [control.key, control.value]));
const masks = [];
let activeMaskId = null;
let maskIdCounter = 1;
let activeMaskPanelMode = "sliders";
let activeMaskHslColor = hslColors[0];
const history = {
  undo: [],
  redo: [],
  activeSliderSnapshot: null
};
const HISTORY_LIMIT = 30;
let originalImageDataUrl = null;
let renderedImageDataUrl = null;
let renderTimer = null;
let renderRequestId = 0;
let activeRenderController = null;
let backendImageLoaded = false;
const maskPanelOpenSections = new Map();

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotState() {
  return {
    version: 1,
    state: { ...state },
    masks: deepClone(masks),
    activeMaskId,
    maskIdCounter,
    activeMaskPanelMode,
    activeMaskHslColorName: activeMaskHslColor.name
  };
}

function statesAreEqual(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function setControlValue(key, value) {
  state[key] = value;
  const input = document.querySelector(`input[type='range'][name='${key}']`);
  if (!input) {
    return;
  }

  const control = {
    key,
    decimals: input.step.includes(".") ? input.step.split(".")[1].length : 0
  };
  input.value = String(value);
  input.closest("label").querySelector("output").value = formatValue(control, value);
  updateRangeFill(input);
}

function applyState(nextState) {
  const restoredState = nextState.state ?? nextState;

  Object.keys(state).forEach(key => {
    delete state[key];
  });
  Object.assign(state, restoredState);

  masks.splice(0, masks.length, ...deepClone(nextState.masks ?? []));
  activeMaskId = nextState.activeMaskId ?? null;
  maskIdCounter = nextState.maskIdCounter ?? nextAvailableMaskId();
  activeMaskPanelMode = nextState.activeMaskPanelMode ?? activeMaskPanelMode;
  activeMaskHslColor = hslColors.find(color => color.name === nextState.activeMaskHslColorName) ?? activeMaskHslColor;

  Object.entries(state).forEach(([key, value]) => setControlValue(key, value));
  renderColorGrading(document.querySelector("[data-grading-mode].is-active")?.dataset.gradingMode ?? "sliders");
  renderHslMixer(activeMaskHslColor);

  if (activeMaskId && masks.some(mask => mask.id === activeMaskId)) {
    selectMask(activeMaskId);
  } else if (masks.length > 0) {
    activeMaskId = masks[0].id;
    selectMask(activeMaskId);
  } else {
    activeMaskId = null;
    maskPanel.hidden = true;
    maskOverlayLayer.replaceChildren();
    updateMaskToolButtons();
    maskStatus.textContent = "No mask selected.";
  }

  updateStatus();
}

function nextAvailableMaskId() {
  const highest = masks.reduce((max, mask) => {
    const match = /^mask-(\d+)$/.exec(mask.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return highest + 1;
}

function updateHistoryButtons() {
  undoButton.disabled = history.undo.length === 0;
  redoButton.disabled = history.redo.length === 0;
}

function undoLatestEdit() {
  const entry = history.undo.pop();
  if (!entry) {
    return;
  }

  history.redo.push(entry);
  applyState(entry.before);
  updateHistoryButtons();
}

function redoLatestEdit() {
  const entry = history.redo.pop();
  if (!entry) {
    return;
  }

  history.undo.push(entry);
  if (history.undo.length > HISTORY_LIMIT) {
    history.undo.shift();
  }
  applyState(entry.after);
  updateHistoryButtons();
}

function recordHistory(before, after) {
  if (statesAreEqual(before, after)) {
    return;
  }

  history.undo.push({ before, after });
  if (history.undo.length > HISTORY_LIMIT) {
    history.undo.shift();
  }
  history.redo = [];
  updateHistoryButtons();
}

function formatValue(control, value) {
  return Number(value).toFixed(control.decimals);
}

function updateStatus() {
  const activeCount = Object.values(state).filter(value => value !== 0).length;
  statusText.textContent = activeCount === 0
    ? "No adjustments active."
    : `${activeCount} adjustment${activeCount === 1 ? "" : "s"} active.`;
  scheduleBackendRender();
}

function backendRenderingAvailable() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function scheduleBackendRender() {
  if (!originalImageDataUrl || !backendRenderingAvailable() || !backendImageLoaded) {
    return;
  }

  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(requestBackendRender, 180);
}

async function requestBackendRender() {
  if (!originalImageDataUrl || !backendImageLoaded) {
    return;
  }

  const requestId = ++renderRequestId;
  if (activeRenderController) {
    activeRenderController.abort();
  }
  activeRenderController = new AbortController();
  statusText.textContent = "Updating preview...";

  try {
    const response = await fetch("/api/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: activeRenderController.signal,
      body: JSON.stringify({
        request_id: requestId,
        params: buildBackendRenderRequest()
      })
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || `Preview failed with HTTP ${response.status}`);
    }

    const result = await response.json();
    if (requestId !== renderRequestId) {
      return;
    }

    if (result.request_id !== requestId) {
      return;
    }

    renderedImageDataUrl = result.image_data_url;
    if (!previewImage.classList.contains("showing-before")) {
      previewImage.src = renderedImageDataUrl;
    }
    updateRenderedStatus();
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
    if (requestId === renderRequestId) {
      statusText.textContent = `Preview update failed: ${error.message}`;
    }
  } finally {
    if (requestId === renderRequestId) {
      activeRenderController = null;
    }
  }
}

async function uploadImageToBackend(fileName) {
  if (!originalImageDataUrl || !backendRenderingAvailable()) {
    return;
  }

  backendImageLoaded = false;
  statusText.textContent = "Loading photo...";

  try {
    const response = await fetch("/api/load-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_data_url: originalImageDataUrl
      })
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || `Image load failed with HTTP ${response.status}`);
    }

    const result = await response.json();
    backendImageLoaded = true;
    statusText.textContent = "Preparing preview...";
    scheduleBackendRender();
  } catch (error) {
    statusText.textContent = `Could not load photo: ${error.message}`;
  }
}

function updateRenderedStatus() {
  const activeCount = Object.values(state).filter(value => value !== 0).length;
  const maskCount = masks.filter(mask => mask.visible).length;
  const adjustmentText = activeCount === 0
    ? "No global adjustments"
    : `${activeCount} global adjustment${activeCount === 1 ? "" : "s"}`;
  const maskText = maskCount === 0
    ? "no active masks"
    : `${maskCount} active mask${maskCount === 1 ? "" : "s"}`;
  statusText.textContent = `${adjustmentText}, ${maskText}.`;
}

function showOriginalPreview() {
  if (!originalImageDataUrl) {
    return;
  }

  beforeAfterButton.textContent = "After";
  previewImage.classList.add("showing-before");
  previewImage.src = originalImageDataUrl;
}

function showRenderedPreview() {
  beforeAfterButton.textContent = "Before";
  previewImage.classList.remove("showing-before");
  if (renderedImageDataUrl) {
    previewImage.src = renderedImageDataUrl;
  }
}

async function exportRenderedPreview() {
  if (!backendImageLoaded) {
    return;
  }

  exportButton.disabled = true;
  statusText.textContent = "Exporting full-resolution photo...";

  try {
    const response = await fetch("/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        params: buildBackendRenderRequest()
      })
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error || `Export failed with HTTP ${response.status}`);
    }

    const result = await response.json();
    const link = document.createElement("a");
    link.href = result.image_data_url;
    link.download = `lumiere-full-${result.width}x${result.height}.png`;
    link.click();
    statusText.textContent = "Export complete.";
  } catch (error) {
    statusText.textContent = `Export failed: ${error.message}`;
  } finally {
    exportButton.disabled = false;
  }
}

function savePreset() {
  const preset = {
    app: "Lumiere",
    kind: "edit-preset",
    version: 1,
    savedAt: new Date().toISOString(),
    edits: snapshotState()
  };
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "lumiere-preset.json";
  link.click();
  URL.revokeObjectURL(link.href);
  statusText.textContent = "Preset saved.";
}

function loadPresetFile(file) {
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const preset = JSON.parse(String(event.target.result ?? ""));
      const edits = preset.edits ?? preset;
      if (!edits.state || !Array.isArray(edits.masks)) {
        throw new Error("This file does not look like a Lumiere preset.");
      }

      const before = snapshotState();
      applyState(edits);
      recordHistory(before, snapshotState());
      statusText.textContent = "Preset loaded.";
    } catch (error) {
      statusText.textContent = `Could not load preset: ${error.message}`;
    } finally {
      presetInput.value = "";
    }
  };
  reader.onerror = () => {
    statusText.textContent = "Could not read the preset file.";
    presetInput.value = "";
  };
  reader.readAsText(file);
}

function updateRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty("--range-percent", `${percent}%`);
}

function createSliderControl(control, className = "slider-control") {
  const initialValue = Object.prototype.hasOwnProperty.call(state, control.key)
    ? state[control.key]
    : control.value;
  state[control.key] = initialValue;

  const wrapper = document.createElement("label");
  wrapper.className = className;
  wrapper.htmlFor = `${control.key}Control`;

  const labelRow = document.createElement("span");
  labelRow.className = "slider-label-row";

  const label = document.createElement("span");
  label.textContent = control.label;

  const output = document.createElement("output");
  output.value = formatValue(control, initialValue);
  output.htmlFor = `${control.key}Control`;

  const input = document.createElement("input");
  input.id = `${control.key}Control`;
  input.name = control.key;
  input.type = "range";
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step);
  input.value = String(initialValue);
  updateRangeFill(input);

  input.addEventListener("pointerdown", () => {
    history.activeSliderSnapshot = snapshotState();
  });

  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    state[control.key] = nextValue;
    output.value = formatValue(control, nextValue);
    updateRangeFill(input);
    updateStatus();
  });

  input.addEventListener("change", () => {
    const before = history.activeSliderSnapshot ?? snapshotState();
    const after = snapshotState();
    recordHistory(before, after);
    history.activeSliderSnapshot = null;
  });

  input.addEventListener("dblclick", () => {
    const before = snapshotState();
    state[control.key] = control.value;
    input.value = String(control.value);
    output.value = formatValue(control, control.value);
    updateRangeFill(input);
    recordHistory(before, snapshotState());
    updateStatus();
  });

  labelRow.append(label, output);
  wrapper.append(labelRow, input);
  return wrapper;
}

function createMiniControl(key, label, min, max, step, value, decimals) {
  const control = { key, label, min, max, step, value, decimals };
  const wrapper = createSliderControl(control, "mini-control");
  if (key.endsWith("_grading_hue")) {
    wrapper.classList.add("hue-slider");
  }
  wrapper.querySelector(".slider-label-row").className = "mini-label-row";
  return wrapper;
}

function renderMainControl(control) {
  controlGroups[control.group].append(createSliderControl(control));
}

function renderColorGradingZone(zone) {
  const zoneKey = zone.toLowerCase();
  const card = document.createElement("article");
  card.className = "zone-card";

  const heading = document.createElement("h3");
  heading.textContent = zone;

  card.append(
    heading,
    createMiniControl(`${zoneKey}_grading_hue`, "Hue", 0, 360, 1, 0, 0),
    createMiniControl(`${zoneKey}_grading_saturation`, "Saturation", 0, 100, 1, 0, 0)
  );

  controlGroups.colorGrading.append(card);
}

function wheelPositionFromState(zone) {
  const zoneKey = zone.toLowerCase();
  const hue = state[`${zoneKey}_grading_hue`] ?? 0;
  const saturation = state[`${zoneKey}_grading_saturation`] ?? 0;
  const radius = Math.max(0, Math.min(1, saturation / 100));
  const radians = ((hue - 90) * Math.PI) / 180;
  const x = 50 + Math.cos(radians) * radius * 44;
  const y = 50 + Math.sin(radians) * radius * 44;

  return { x, y };
}

function updateWheelHandle(wheel, zone) {
  const { x, y } = wheelPositionFromState(zone);
  wheel.style.setProperty("--wheel-x", `${x}%`);
  wheel.style.setProperty("--wheel-y", `${y}%`);
}

function updateColorGradingFromWheel(wheel, zone, pointerEvent) {
  const rect = wheel.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = pointerEvent.clientX - centerX;
  const dy = pointerEvent.clientY - centerY;
  const radius = Math.min(rect.width, rect.height) / 2;
  const distance = Math.min(radius, Math.hypot(dx, dy));
  const saturation = Math.round((distance / radius) * 100);
  const hue = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  const zoneKey = zone.toLowerCase();

  state[`${zoneKey}_grading_hue`] = hue;
  state[`${zoneKey}_grading_saturation`] = saturation;
  updateWheelHandle(wheel, zone);
  updateStatus();
}

function renderColorGradingWheel(zone) {
  const card = document.createElement("article");
  card.className = "wheel-card";

  const heading = document.createElement("h3");
  heading.textContent = zone;

  const wheel = document.createElement("button");
  wheel.className = "color-wheel";
  wheel.type = "button";
  wheel.ariaLabel = `${zone} color wheel`;

  const handle = document.createElement("span");
  handle.className = "wheel-handle";
  wheel.append(handle);
  updateWheelHandle(wheel, zone);

  handle.addEventListener("dblclick", event => {
    event.preventDefault();
    event.stopPropagation();
    const before = snapshotState();
    const zoneKey = zone.toLowerCase();
    state[`${zoneKey}_grading_hue`] = 0;
    state[`${zoneKey}_grading_saturation`] = 0;
    updateWheelHandle(wheel, zone);
    recordHistory(before, snapshotState());
    updateStatus();
  });

  wheel.addEventListener("pointerdown", event => {
    event.preventDefault();
    history.activeSliderSnapshot = snapshotState();
    wheel.setPointerCapture(event.pointerId);
    updateColorGradingFromWheel(wheel, zone, event);
  });

  wheel.addEventListener("pointermove", event => {
    if (!wheel.hasPointerCapture(event.pointerId)) {
      return;
    }
    updateColorGradingFromWheel(wheel, zone, event);
  });

  wheel.addEventListener("pointerup", event => {
    if (wheel.hasPointerCapture(event.pointerId)) {
      wheel.releasePointerCapture(event.pointerId);
    }

    const before = history.activeSliderSnapshot ?? snapshotState();
    const after = snapshotState();
    recordHistory(before, after);
    history.activeSliderSnapshot = null;
  });

  card.append(heading, wheel);
  controlGroups.colorGrading.append(card);
}

function renderColorGrading(mode = "sliders") {
  controlGroups.colorGrading.replaceChildren();
  controlGroups.colorGrading.classList.toggle("is-wheel-mode", mode === "wheels");

  if (mode === "wheels") {
    gradingWheelZones.forEach(renderColorGradingWheel);
    return;
  }

  gradingSliderZones.forEach(renderColorGradingZone);
}

function signedValue(value) {
  if (value > 0) {
    return `+ ${value}`;
  }
  if (value < 0) {
    return `- ${Math.abs(value)}`;
  }
  return "0";
}

function initializeHslState() {
  hslColors.forEach(color => {
    const keyPrefix = color.name.toLowerCase();
    state[`${keyPrefix}_hue`] = state[`${keyPrefix}_hue`] ?? 0;
    state[`${keyPrefix}_saturation`] = state[`${keyPrefix}_saturation`] ?? 0;
    state[`${keyPrefix}_luminance`] = state[`${keyPrefix}_luminance`] ?? 0;
  });
}

function createMixerSlider(type, labelText, color) {
  const keyPrefix = color.name.toLowerCase();
  const key = `${keyPrefix}_${type}`;
  const wrapper = document.createElement("label");
  wrapper.className = `mixer-slider mixer-slider-${type}`;
  wrapper.htmlFor = `${key}Control`;

  const labelRow = document.createElement("span");
  labelRow.className = "mixer-label-row";

  const label = document.createElement("span");
  label.textContent = labelText;

  const output = document.createElement("output");
  output.value = signedValue(state[key]);

  const input = document.createElement("input");
  input.id = `${key}Control`;
  input.name = key;
  input.type = "range";
  input.min = "-100";
  input.max = "100";
  input.step = "1";
  input.value = String(state[key]);
  input.style.setProperty("--mixer-color", color.swatch);
  input.style.setProperty("--mixer-hue", color.hue);
  updateRangeFill(input);

  input.addEventListener("pointerdown", () => {
    history.activeSliderSnapshot = snapshotState();
  });

  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    state[key] = nextValue;
    output.value = signedValue(nextValue);
    updateRangeFill(input);
    updateStatus();
  });

  input.addEventListener("change", () => {
    const before = history.activeSliderSnapshot ?? snapshotState();
    const after = snapshotState();
    recordHistory(before, after);
    history.activeSliderSnapshot = null;
  });

  input.addEventListener("dblclick", () => {
    const before = snapshotState();
    state[key] = 0;
    input.value = "0";
    output.value = "0";
    updateRangeFill(input);
    recordHistory(before, snapshotState());
    updateStatus();
  });

  labelRow.append(label, output);
  wrapper.append(labelRow, input);
  return wrapper;
}

function renderHslMixer(selectedColor = hslColors[0]) {
  controlGroups.hsl.replaceChildren();
  controlGroups.hsl.className = "color-mixer";

  const chipRow = document.createElement("div");
  chipRow.className = "color-chip-row";

  hslColors.forEach(color => {
    const button = document.createElement("button");
    button.className = "color-chip";
    button.type = "button";
    button.ariaLabel = color.name;
    button.style.setProperty("--chip-color", color.swatch);
    button.classList.toggle("is-active", color.name === selectedColor.name);
    button.addEventListener("click", () => renderHslMixer(color));
    chipRow.append(button);
  });

  const sliders = document.createElement("div");
  sliders.className = "mixer-slider-stack";
  sliders.append(
    createMixerSlider("hue", "Hue", selectedColor),
    createMixerSlider("saturation", "Saturation", selectedColor),
    createMixerSlider("luminance", "Luminance", selectedColor)
  );

  controlGroups.hsl.append(chipRow, sliders);
}

function createDefaultMaskAdjustments() {
  return {
    light: {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0
    },
    effects: {
      dehaze: 0,
      clarity: 0
    },
    color: {
      temp: 0,
      tint: 0,
      saturation: 0
    },
    colorGrading: {
      shadows: { hue: 0, saturation: 0 },
      midtones: { hue: 0, saturation: 0 },
      highlights: { hue: 0, saturation: 0 },
      global: { hue: 0, saturation: 0 }
    },
    hsl: Object.fromEntries(
      hslColors.map(color => [
        color.name.toLowerCase(),
        { hue: 0, saturation: 0, luminance: 0 }
      ])
    )
  };
}

function defaultBackendAdjustmentValues() {
  return {
    exposure: 0,
    whites: 0,
    highlights: 0,
    shadows: 0,
    blacks: 0,
    temperature: 0,
    tint: 0,
    global_grading_hue: 35,
    global_grading_intensity: 0,
    shadows_grading_hue: 220,
    shadows_grading_intensity: 0,
    midtones_grading_hue: 35,
    midtones_grading_intensity: 0,
    highlights_grading_hue: 45,
    highlights_grading_intensity: 0,
    color_grading_reference: 0,
    mixer_hue: hslColors.map(() => 0),
    mixer_saturation: hslColors.map(() => 0),
    mixer_luminance: hslColors.map(() => 0),
    saturation: 0,
    contrast: 0,
    dehaze: 0,
    clarity: 0,
    contrast_reference: 128,
    contrast_gamma: 0.5,
    dehaze_block_size: 16,
    dehaze_negative_reference_offset: 28,
    dehaze_positive_saturation_boost: 1,
    clarity_block_size: 16,
    clarity_negative_reference_offset: 28,
    clarity_positive_saturation_compensation: 0.38,
    clarity_negative_saturation_compensation: 0.72
  };
}

function buildGlobalAdjustmentValues() {
  const values = defaultBackendAdjustmentValues();

  values.exposure = state.exposure;
  values.whites = state.whites;
  values.highlights = state.highlights;
  values.shadows = state.shadows;
  values.blacks = state.blacks;
  values.temperature = state.temp;
  values.tint = state.tint;
  values.saturation = state.saturation / 100;
  values.contrast = state.contrast / 100;
  values.dehaze = state.dehaze / 100;
  values.clarity = state.clarity / 100;
  applyBackendColorGrading(values, {
    global: {
      hue: state.global_grading_hue ?? values.global_grading_hue,
      saturation: state.global_grading_saturation ?? 0
    },
    shadows: {
      hue: state.shadows_grading_hue ?? values.shadows_grading_hue,
      saturation: state.shadows_grading_saturation ?? 0
    },
    midtones: {
      hue: state.midtones_grading_hue ?? values.midtones_grading_hue,
      saturation: state.midtones_grading_saturation ?? 0
    },
    highlights: {
      hue: state.highlights_grading_hue ?? values.highlights_grading_hue,
      saturation: state.highlights_grading_saturation ?? 0
    }
  });
  applyBackendHsl(values, Object.fromEntries(
    hslColors.map(color => {
      const key = color.name.toLowerCase();
      return [
        key,
        {
          hue: state[`${key}_hue`] ?? 0,
          saturation: state[`${key}_saturation`] ?? 0,
          luminance: state[`${key}_luminance`] ?? 0
        }
      ];
    })
  ));

  return values;
}

function buildMaskAdjustmentValues(maskAdjustments) {
  const values = defaultBackendAdjustmentValues();

  values.exposure = maskAdjustments.light.exposure;
  values.contrast = maskAdjustments.light.contrast / 100;
  values.highlights = maskAdjustments.light.highlights;
  values.shadows = maskAdjustments.light.shadows;
  values.whites = maskAdjustments.light.whites;
  values.blacks = maskAdjustments.light.blacks;
  values.dehaze = maskAdjustments.effects.dehaze / 100;
  values.clarity = maskAdjustments.effects.clarity / 100;
  values.temperature = maskAdjustments.color.temp;
  values.tint = maskAdjustments.color.tint;
  values.saturation = maskAdjustments.color.saturation / 100;
  applyBackendColorGrading(values, maskAdjustments.colorGrading);
  applyBackendHsl(values, maskAdjustments.hsl);

  return values;
}

function applyBackendColorGrading(values, grading) {
  values.global_grading_hue = grading.global.hue;
  values.global_grading_intensity = grading.global.saturation;
  values.shadows_grading_hue = grading.shadows.hue;
  values.shadows_grading_intensity = grading.shadows.saturation;
  values.midtones_grading_hue = grading.midtones.hue;
  values.midtones_grading_intensity = grading.midtones.saturation;
  values.highlights_grading_hue = grading.highlights.hue;
  values.highlights_grading_intensity = grading.highlights.saturation;
}

function applyBackendHsl(values, hsl) {
  values.mixer_hue = hslColors.map(color => hsl[color.name.toLowerCase()]?.hue ?? 0);
  values.mixer_saturation = hslColors.map(color => hsl[color.name.toLowerCase()]?.saturation ?? 0);
  values.mixer_luminance = hslColors.map(color => hsl[color.name.toLowerCase()]?.luminance ?? 0);
}

function buildBackendRenderRequest() {
  return {
    global: buildGlobalAdjustmentValues(),
    masks: masks.map(mask => ({
      id: mask.id,
      name: mask.name,
      enabled: mask.visible,
      density: mask.density,
      inverted: mask.inverted,
      shape: buildBackendMaskShape(mask),
      adjustments: buildMaskAdjustmentValues(mask.adjustments)
    }))
  };
}

function buildBackendMaskShape(mask) {
  if (mask.type === "linear") {
    return {
      linear_gradient: {
        center_x: mask.geometry.centerX,
        center_y: mask.geometry.centerY,
        angle_degrees: mask.geometry.angle,
        half_width: mask.geometry.spread,
        side: -(mask.geometry.side ?? 1)
      }
    };
  }

  if (mask.type === "radial") {
    return {
      radial_gradient: {
        center_x: mask.geometry.centerX,
        center_y: mask.geometry.centerY,
        radius_x: mask.geometry.radiusX,
        radius_y: mask.geometry.radiusY,
        rotation_degrees: mask.geometry.rotation,
        feather: mask.feather / 100
      }
    };
  }

  return {
    brush: {
      strokes: buildBackendBrushStrokes(mask)
    }
  };
}

function buildBackendBrushStrokes(mask) {
  const rect = maskOverlayLayer.getBoundingClientRect();
  const shortestSide = Math.max(1, Math.min(rect.width || 1, rect.height || 1));

  return mask.brush.strokes.map(stroke => ({
    center_x: stroke.x,
    center_y: stroke.y,
    radius: (stroke.size / 2) / shortestSide,
    feather: stroke.feather / 100,
    flow: stroke.flow / 100,
    erase: stroke.eraser
  }));
}

window.RawPhotoEditorFrontend = {
  buildBackendRenderRequest,
  state,
  masks
};

function maskDisplayType(type) {
  return {
    linear: "Linear",
    radial: "Radial",
    brush: "Brush"
  }[type];
}

function createMask(type) {
  const before = snapshotState();
  const id = `mask-${maskIdCounter}`;
  const count = masks.filter(mask => mask.type === type).length + 1;
  maskIdCounter += 1;

  const mask = {
    id,
    type,
    name: `${maskDisplayType(type)} Mask ${count}`,
    visible: true,
    selected: true,
    showOverlay: true,
    inverted: false,
    feather: 50,
    density: 50,
    geometry: defaultMaskGeometry(type),
    brush: {
      size: 70,
      feather: 50,
      flow: 60,
      density: 50,
      autoMask: false,
      eraser: false,
      mode: "add",
      strokes: []
    },
    adjustments: createDefaultMaskAdjustments()
  };

  masks.forEach(existingMask => {
    existingMask.selected = false;
  });
  masks.push(mask);
  selectMask(id);
  recordHistory(before, snapshotState());
  scheduleBackendRender();
}

function defaultMaskGeometry(type) {
  if (type === "linear") {
    return {
      centerX: 0.5,
      centerY: 0.5,
      angle: 0,
      spread: 0.28,
      side: 1
    };
  }

  if (type === "radial") {
    return {
      centerX: 0.5,
      centerY: 0.5,
      radiusX: 0.28,
      radiusY: 0.22,
      rotation: 0
    };
  }

  return {
    strokes: []
  };
}

function activeMask() {
  return masks.find(mask => mask.id === activeMaskId) ?? null;
}

function selectMask(id) {
  activeMaskId = id;
  masks.forEach(mask => {
    mask.selected = mask.id === id;
  });
  maskPanel.hidden = false;
  renderMaskPanel();
  renderMaskOverlay();
  updateMaskToolButtons();
}

function deleteActiveMask() {
  const before = snapshotState();
  const index = masks.findIndex(mask => mask.id === activeMaskId);
  if (index === -1) {
    return;
  }

  masks.splice(index, 1);
  activeMaskId = masks[index - 1]?.id ?? masks[index]?.id ?? null;
  if (activeMaskId) {
    selectMask(activeMaskId);
    recordHistory(before, snapshotState());
    scheduleBackendRender();
    return;
  }

  maskPanel.hidden = true;
  maskOverlayLayer.replaceChildren();
  updateMaskToolButtons();
  maskStatus.textContent = "No mask selected.";
  recordHistory(before, snapshotState());
  scheduleBackendRender();
}

function updateMaskToolButtons() {
  const mask = activeMask();
  document.querySelectorAll("[data-mask-tool]").forEach(button => {
    const type = normalizeMaskTool(button.dataset.maskTool);
    button.classList.toggle("is-active", mask?.type === type);
  });
}

function normalizeMaskTool(tool) {
  if (tool === "linear-gradient") {
    return "linear";
  }
  if (tool === "radial-gradient") {
    return "radial";
  }
  return tool;
}

function createPanelSection(title, children, open = true) {
  const details = document.createElement("details");
  details.className = "mask-panel-section";
  details.open = maskPanelOpenSections.get(title) ?? open;
  details.addEventListener("toggle", () => {
    maskPanelOpenSections.set(title, details.open);
  });

  const summary = document.createElement("summary");
  summary.textContent = title;

  const stack = document.createElement("div");
  stack.className = "mask-panel-stack";
  stack.append(...children);

  details.append(summary, stack);
  return details;
}

function createMaskSlider(label, value, min, max, step, onInput, decimals = 0, className = "slider-control") {
  const wrapper = document.createElement("label");
  wrapper.className = className;

  const labelRow = document.createElement("span");
  labelRow.className = className === "mixer-slider" ? "mixer-label-row" : "slider-label-row";

  const labelText = document.createElement("span");
  labelText.textContent = label;

  const output = document.createElement("output");
  output.value = Number(value).toFixed(decimals);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  updateRangeFill(input);

  input.addEventListener("pointerdown", () => {
    history.activeSliderSnapshot = snapshotState();
  });

  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    output.value = Number(nextValue).toFixed(decimals);
    onInput(nextValue);
    updateRangeFill(input);
    renderMaskOverlay();
    scheduleBackendRender();
  });

  input.addEventListener("change", () => {
    const before = history.activeSliderSnapshot ?? snapshotState();
    recordHistory(before, snapshotState());
    history.activeSliderSnapshot = null;
  });

  input.addEventListener("dblclick", () => {
    const before = snapshotState();
    input.value = "0";
    output.value = Number(0).toFixed(decimals);
    onInput(0);
    updateRangeFill(input);
    recordHistory(before, snapshotState());
    renderMaskOverlay();
    scheduleBackendRender();
  });

  labelRow.append(labelText, output);
  wrapper.append(labelRow, input);
  return wrapper;
}

function createMaskToggle(label, checked, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "mask-toggle-row";

  const text = document.createElement("span");
  text.textContent = label;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => {
    const before = snapshotState();
    onChange(input.checked);
    renderMaskPanel();
    renderMaskOverlay();
    recordHistory(before, snapshotState());
    scheduleBackendRender();
  });

  wrapper.append(text, input);
  return wrapper;
}

function renderMaskPanel() {
  const mask = activeMask();
  if (!mask) {
    return;
  }

  maskPanelContent.replaceChildren();
  maskStatus.textContent = `${mask.name} selected.`;

  const header = document.createElement("header");
  header.className = "mask-panel-header";

  const title = document.createElement("div");
  title.className = "mask-panel-title";
  title.innerHTML = `<span>${maskDisplayType(mask.type)}</span><strong>${mask.name}</strong>`;

  const actions = document.createElement("div");
  actions.className = "mask-panel-actions";

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.textContent = "Rename";
  renameButton.addEventListener("click", () => {
    const nextName = window.prompt("Rename mask", mask.name);
    if (nextName?.trim()) {
      const before = snapshotState();
      mask.name = nextName.trim();
      renderMaskPanel();
      recordHistory(before, snapshotState());
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", deleteActiveMask);

  actions.append(renameButton, deleteButton);
  header.append(title, actions);

  const maskList = document.createElement("div");
  maskList.className = "mask-list";
  masks.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mask-list-item";
    button.classList.toggle("is-active", item.id === mask.id);
    button.textContent = item.name;
    button.addEventListener("click", () => selectMask(item.id));
    maskList.append(button);
  });

  maskPanelContent.append(
    header,
    maskList,
    createPanelSection("Mask", createMaskBaseControls(mask), true),
    ...createMaskTypeSections(mask),
    ...createMaskAdjustmentSections(mask)
  );
}

function createMaskBaseControls(mask) {
  const controls = [
    createMaskToggle("Visible", mask.visible, value => {
      mask.visible = value;
    }),
    createMaskToggle("Show Overlay", mask.showOverlay, value => {
      mask.showOverlay = value;
    }),
    createMaskToggle("Invert", mask.inverted, value => {
      mask.inverted = value;
      renderMaskOverlay();
    })
  ];

  if (mask.type !== "brush") {
    controls.push(
      createMaskSlider("Feather", mask.feather, 0, 100, 1, value => {
        mask.feather = value;
      }),
      createMaskSlider("Density", mask.density, 0, 100, 1, value => {
        mask.density = value;
      })
    );
  }

  return controls;
}

function createMaskTypeSections(mask) {
  if (mask.type === "brush") {
    return [
      createPanelSection("Brush", [
        createMaskSlider("Brush Size", mask.brush.size, 10, 220, 1, value => {
          mask.brush.size = value;
        }),
        createMaskSlider("Feather", mask.brush.feather, 0, 100, 1, value => {
          mask.brush.feather = value;
        }),
        createMaskSlider("Flow", mask.brush.flow, 0, 100, 1, value => {
          mask.brush.flow = value;
        }),
        createMaskSlider("Density", mask.brush.density, 0, 100, 1, value => {
          mask.brush.density = value;
          mask.density = value;
        }),
        createMaskToggle("Auto Mask", mask.brush.autoMask, value => {
          mask.brush.autoMask = value;
        }),
        createMaskToggle("Eraser", mask.brush.eraser, value => {
          mask.brush.eraser = value;
        }),
        createModeButtons(mask)
      ], true)
    ];
  }

  if (mask.type === "linear") {
    return [
      createPanelSection("Linear Geometry", [
        createMaskSlider("Angle", mask.geometry.angle, -180, 180, 1, value => {
          mask.geometry.angle = value;
        }),
        createMaskSlider("Position X", mask.geometry.centerX, 0, 1, 0.01, value => {
          mask.geometry.centerX = value;
        }, 2),
        createMaskSlider("Position Y", mask.geometry.centerY, 0, 1, 0.01, value => {
          mask.geometry.centerY = value;
        }, 2),
        createMaskSlider("Spread", mask.geometry.spread, 0.05, 0.49, 0.01, value => {
          mask.geometry.spread = value;
        }, 2),
        createMaskToggle("Flip Side", mask.geometry.side < 0, value => {
          mask.geometry.side = value ? -1 : 1;
        })
      ], true)
    ];
  }

  return [
    createPanelSection("Radial Geometry", [
      createMaskSlider("Width", mask.geometry.radiusX, 0.05, 0.8, 0.01, value => {
        mask.geometry.radiusX = value;
      }, 2),
      createMaskSlider("Height", mask.geometry.radiusY, 0.05, 0.8, 0.01, value => {
        mask.geometry.radiusY = value;
      }, 2),
      createMaskSlider("Position X", mask.geometry.centerX, 0, 1, 0.01, value => {
        mask.geometry.centerX = value;
      }, 2),
      createMaskSlider("Position Y", mask.geometry.centerY, 0, 1, 0.01, value => {
        mask.geometry.centerY = value;
      }, 2),
      createMaskSlider("Rotation", mask.geometry.rotation, -180, 180, 1, value => {
        mask.geometry.rotation = value;
      })
    ], false)
  ];
}

function createModeButtons(mask) {
  const row = document.createElement("div");
  row.className = "segmented-control";

  ["add", "subtract"].forEach(mode => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-button";
    button.classList.toggle("is-active", mask.brush.mode === mode);
    button.textContent = mode === "add" ? "Add" : "Subtract";
    button.addEventListener("click", () => {
      mask.brush.mode = mode;
      renderMaskPanel();
    });
    row.append(button);
  });

  return row;
}

function createMaskAdjustmentSections(mask) {
  return [
    createPanelSection("Light", [
      createAdjustmentSlider(mask, "light", "exposure", "Exposure", -100, 100, 1),
      createAdjustmentSlider(mask, "light", "contrast", "Contrast", -100, 100, 1),
      createAdjustmentSlider(mask, "light", "highlights", "Highlights", -100, 100, 1),
      createAdjustmentSlider(mask, "light", "shadows", "Shadows", -100, 100, 1),
      createAdjustmentSlider(mask, "light", "whites", "Whites", -100, 100, 1),
      createAdjustmentSlider(mask, "light", "blacks", "Blacks", -100, 100, 1)
    ], true),
    createPanelSection("Effects", [
      createAdjustmentSlider(mask, "effects", "dehaze", "Dehaze", -100, 100, 1),
      createAdjustmentSlider(mask, "effects", "clarity", "Clarity", -100, 100, 1)
    ], true),
    createPanelSection("Color", [
      createAdjustmentSlider(mask, "color", "temp", "Temp", -100, 100, 1),
      createAdjustmentSlider(mask, "color", "tint", "Tint", -100, 100, 1),
      createAdjustmentSlider(mask, "color", "saturation", "Saturation", -100, 100, 1)
    ], true),
    createPanelSection("Color Grading", [createMaskColorGrading(mask)], false),
    createPanelSection("HSL Colors", [createMaskHslMixer(mask)], false)
  ];
}

function createAdjustmentSlider(mask, group, key, label, min, max, step, decimals = 0) {
  return createMaskSlider(label, mask.adjustments[group][key], min, max, step, value => {
    mask.adjustments[group][key] = value;
  }, decimals);
}

function createMaskColorGrading(mask) {
  const container = document.createElement("div");
  container.className = "mask-grading";

  const modeRow = document.createElement("div");
  modeRow.className = "segmented-control";

  ["sliders", "wheels"].forEach(mode => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-button";
    button.classList.toggle("is-active", activeMaskPanelMode === mode);
    button.textContent = mode === "sliders" ? "Sliders" : "Wheels";
    button.addEventListener("click", () => {
      activeMaskPanelMode = mode;
      maskPanelOpenSections.set("Color Grading", true);
      renderMaskPanel();
    });
    modeRow.append(button);
  });

  const body = document.createElement("div");
  body.className = activeMaskPanelMode === "wheels" ? "zone-stack is-wheel-mode" : "zone-stack";

  if (activeMaskPanelMode === "wheels") {
    gradingWheelZones.forEach(zone => body.append(createMaskGradingWheel(mask, zone)));
  } else {
    gradingSliderZones.forEach(zone => body.append(createMaskGradingSliders(mask, zone)));
  }

  container.append(modeRow, body);
  return container;
}

function createMaskGradingSliders(mask, zone) {
  const key = zone.toLowerCase();
  const card = document.createElement("article");
  card.className = "zone-card";

  const heading = document.createElement("h3");
  heading.textContent = zone;

  card.append(
    heading,
    createMaskSlider("Hue", mask.adjustments.colorGrading[key].hue, 0, 360, 1, value => {
      mask.adjustments.colorGrading[key].hue = value;
    }, 0, "mini-control hue-slider"),
    createMaskSlider("Saturation", mask.adjustments.colorGrading[key].saturation, 0, 100, 1, value => {
      mask.adjustments.colorGrading[key].saturation = value;
    }, 0, "mini-control")
  );

  return card;
}

function createMaskGradingWheel(mask, zone) {
  const key = zone.toLowerCase();
  const card = document.createElement("article");
  card.className = "wheel-card";

  const heading = document.createElement("h3");
  heading.textContent = zone;

  const wheel = document.createElement("button");
  wheel.className = "color-wheel";
  wheel.type = "button";
  const handle = Object.assign(document.createElement("span"), { className: "wheel-handle" });
  wheel.append(handle);
  updateMaskWheelHandle(wheel, mask.adjustments.colorGrading[key]);

  handle.addEventListener("dblclick", event => {
    event.preventDefault();
    event.stopPropagation();
    const before = snapshotState();
    mask.adjustments.colorGrading[key].hue = 0;
    mask.adjustments.colorGrading[key].saturation = 0;
    updateMaskWheelHandle(wheel, mask.adjustments.colorGrading[key]);
    recordHistory(before, snapshotState());
    scheduleBackendRender();
  });

  let beforeWheelDrag = null;
  wheel.addEventListener("pointerdown", event => {
    event.preventDefault();
    beforeWheelDrag = snapshotState();
    wheel.setPointerCapture(event.pointerId);
    updateMaskGradingFromWheel(wheel, mask.adjustments.colorGrading[key], event);
  });
  wheel.addEventListener("pointermove", event => {
    if (wheel.hasPointerCapture(event.pointerId)) {
      updateMaskGradingFromWheel(wheel, mask.adjustments.colorGrading[key], event);
    }
  });
  wheel.addEventListener("pointerup", event => {
    if (wheel.hasPointerCapture(event.pointerId)) {
      wheel.releasePointerCapture(event.pointerId);
    }
    recordHistory(beforeWheelDrag ?? snapshotState(), snapshotState());
    beforeWheelDrag = null;
    scheduleBackendRender();
  });

  card.append(heading, wheel);
  return card;
}

function updateMaskWheelHandle(wheel, grading) {
  const radius = Math.max(0, Math.min(1, grading.saturation / 100));
  const radians = ((grading.hue - 90) * Math.PI) / 180;
  wheel.style.setProperty("--wheel-x", `${50 + Math.cos(radians) * radius * 44}%`);
  wheel.style.setProperty("--wheel-y", `${50 + Math.sin(radians) * radius * 44}%`);
}

function updateMaskGradingFromWheel(wheel, grading, pointerEvent) {
  const rect = wheel.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = pointerEvent.clientX - centerX;
  const dy = pointerEvent.clientY - centerY;
  const radius = Math.min(rect.width, rect.height) / 2;
  grading.saturation = Math.round((Math.min(radius, Math.hypot(dx, dy)) / radius) * 100);
  grading.hue = Math.round((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  updateMaskWheelHandle(wheel, grading);
  scheduleBackendRender();
}

function createMaskHslMixer(mask) {
  const container = document.createElement("div");
  container.className = "color-mixer";
  const selectedColor = activeMaskHslColor;
  const selectedKey = selectedColor.name.toLowerCase();

  const chipRow = document.createElement("div");
  chipRow.className = "color-chip-row";
  hslColors.forEach(color => {
    const button = document.createElement("button");
    button.className = "color-chip";
    button.type = "button";
    button.ariaLabel = color.name;
    button.style.setProperty("--chip-color", color.swatch);
    button.classList.toggle("is-active", color.name === selectedColor.name);
    button.addEventListener("click", () => {
      activeMaskHslColor = color;
      renderMaskPanel();
    });
    chipRow.append(button);
  });

  const sliders = document.createElement("div");
  sliders.className = "mixer-slider-stack";
  ["hue", "saturation", "luminance"].forEach(type => {
    const label = type === "hue" ? "Hue" : type === "saturation" ? "Saturation" : "Luminance";
    const slider = createMaskSlider(label, mask.adjustments.hsl[selectedKey][type], -100, 100, 1, value => {
      mask.adjustments.hsl[selectedKey][type] = value;
    }, 0, `mixer-slider mixer-slider-${type}`);
    const input = slider.querySelector("input");
    input.style.setProperty("--mixer-color", selectedColor.swatch);
    input.style.setProperty("--mixer-hue", selectedColor.hue);
    slider.querySelector("output").value = signedValue(mask.adjustments.hsl[selectedKey][type]);
    input.addEventListener("input", () => {
      slider.querySelector("output").value = signedValue(Number(input.value));
    });
    sliders.append(slider);
  });

  container.append(chipRow, sliders);
  return container;
}

function resetControls() {
  const before = snapshotState();

  Object.keys(state).forEach(key => {
    state[key] = 0;
  });

  document.querySelectorAll("input[type='range']").forEach(input => {
    input.value = "0";
    input.closest("label").querySelector("output").value = "0";
    updateRangeFill(input);
  });

  masks.splice(0, masks.length);
  activeMaskId = null;
  maskIdCounter = 1;
  maskPanel.hidden = true;
  maskOverlayLayer.replaceChildren();
  updateMaskToolButtons();
  maskStatus.textContent = "No mask selected.";

  recordHistory(before, snapshotState());
  updateStatus();
}

function loadPreview(file) {
  if (!file.type.startsWith("image/")) {
    statusText.textContent = `${file.name} is not an image file.`;
    return;
  }

  const reader = new FileReader();

  reader.onload = event => {
    originalImageDataUrl = event.target.result;
    renderedImageDataUrl = originalImageDataUrl;
    backendImageLoaded = false;

    previewImage.onload = () => {
      previewImage.hidden = false;
      emptyState.hidden = true;
      imageStage.classList.add("has-image");
      imageStage.classList.add("fit-to-screen");
      fitButton.classList.add("is-active");
      exportButton.disabled = false;
      statusText.textContent = backendRenderingAvailable()
        ? "Photo loaded. Preparing preview..."
        : "Photo loaded. Start the app server to edit.";
      previewImage.onload = null;
      uploadImageToBackend(file.name);
    };

    previewImage.onerror = () => {
      previewImage.hidden = true;
      emptyState.hidden = false;
      exportButton.disabled = true;
      statusText.textContent = "This photo could not be displayed. Try another JPG or PNG image.";
    };

    previewImage.src = originalImageDataUrl;
    previewImage.alt = file.name;
  };

  reader.onerror = () => {
    previewImage.hidden = false;
    emptyState.hidden = false;
    exportButton.disabled = true;
    statusText.textContent = "Could not read the selected photo.";
  };

  previewImage.removeAttribute("src");
  previewImage.hidden = true;
  emptyState.hidden = false;
  statusText.textContent = "Loading photo...";
  reader.readAsDataURL(file);
}

function renderMaskOverlay() {
  maskOverlayLayer.replaceChildren();
  maskOverlayLayer.onpointermove = null;
  maskOverlayLayer.onpointerdown = null;
  maskOverlayLayer.onpointerup = null;
  const mask = activeMask();
  if (!mask || !mask.visible || previewImage.hidden) {
    imageStage.classList.remove("is-brush-editing");
    return;
  }

  if (!mask.showOverlay && mask.type !== "brush") {
    imageStage.classList.remove("is-brush-editing");
    return;
  }

  imageStage.classList.toggle("is-brush-editing", mask.type === "brush");

  if (mask.type === "linear") {
    renderLinearMaskOverlay(mask);
    return;
  }

  if (mask.type === "radial") {
    renderRadialMaskOverlay(mask);
    return;
  }

  renderBrushMaskOverlay(mask);
}

function renderLinearMaskOverlay(mask) {
  const overlay = document.createElement("div");
  overlay.className = "linear-mask-preview";
  const linearBand = getLinearMaskBand(mask);
  overlay.style.setProperty("--mask-density", String(mask.density / 100));
  overlay.style.setProperty("--linear-full-line", `${linearBand.fullLine}%`);
  overlay.style.setProperty("--linear-zero-line", `${linearBand.zeroLine}%`);
  overlay.style.left = `${mask.geometry.centerX * 100}%`;
  overlay.style.top = `${mask.geometry.centerY * 100}%`;
  overlay.style.transform = `translate(-50%, -50%) rotate(${mask.geometry.angle}deg)`;
  overlay.classList.toggle("is-reversed", linearMaskIsReversed(mask));
  attachMaskDrag(overlay, (event, rect) => {
    mask.geometry.centerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    mask.geometry.centerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    updateLinearMaskOverlay(overlay, mask);
    updateMaskPanelGeometryValues(mask);
  });

  const centerLine = document.createElement("div");
  centerLine.className = "linear-center-line";

  const fullLine = document.createElement("div");
  fullLine.className = "linear-feather-line linear-full-line";

  const zeroLine = document.createElement("div");
  zeroLine.className = "linear-limit-line";

  const handle = document.createElement("button");
  handle.className = "mask-handle linear-move-handle";
  handle.type = "button";
  handle.ariaLabel = "Move linear mask";
  attachMaskDrag(handle, (event, rect) => {
    mask.geometry.centerX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    mask.geometry.centerY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    updateLinearMaskOverlay(overlay, mask);
    updateMaskPanelGeometryValues(mask);
  });

  const featherHandle = document.createElement("button");
  featherHandle.className = "mask-handle linear-boundary-handle linear-feather-handle";
  featherHandle.type = "button";
  featherHandle.ariaLabel = "Adjust linear gradient width";
  attachMaskDrag(featherHandle, (event, rect) => {
    const local = pointerToLinearLocal(mask, event, rect);
    mask.geometry.spread = clamp(Math.abs(local.y), 0.05, 0.49);
    updateLinearMaskOverlay(overlay, mask);
    updateMaskPanelGeometryValues(mask);
  });

  const limitHandle = document.createElement("button");
  limitHandle.className = "mask-handle linear-boundary-handle linear-limit-handle";
  limitHandle.type = "button";
  limitHandle.ariaLabel = "Adjust linear gradient width";
  attachMaskDrag(limitHandle, (event, rect) => {
    const local = pointerToLinearLocal(mask, event, rect);
    mask.geometry.spread = clamp(Math.abs(local.y), 0.05, 0.49);
    updateLinearMaskOverlay(overlay, mask);
    updateMaskPanelGeometryValues(mask);
  });

  const rotateHandle = document.createElement("button");
  rotateHandle.className = "mask-handle linear-rotate-handle";
  rotateHandle.type = "button";
  rotateHandle.ariaLabel = "Rotate linear mask";
  attachMaskDrag(rotateHandle, event => {
    const frameRect = maskOverlayLayer.getBoundingClientRect();
    const centerX = frameRect.left + mask.geometry.centerX * frameRect.width;
    const centerY = frameRect.top + mask.geometry.centerY * frameRect.height;
    mask.geometry.angle = Math.round((Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI);
    updateLinearMaskOverlay(overlay, mask);
    updateMaskPanelGeometryValues(mask);
  });

  overlay.append(zeroLine, centerLine, fullLine, featherHandle, limitHandle, handle, rotateHandle);
  maskOverlayLayer.append(overlay);
}

function updateLinearMaskOverlay(overlay, mask) {
  const linearBand = getLinearMaskBand(mask);
  overlay.style.setProperty("--linear-full-line", `${linearBand.fullLine}%`);
  overlay.style.setProperty("--linear-zero-line", `${linearBand.zeroLine}%`);
  overlay.style.left = `${mask.geometry.centerX * 100}%`;
  overlay.style.top = `${mask.geometry.centerY * 100}%`;
  overlay.style.transform = `translate(-50%, -50%) rotate(${mask.geometry.angle}deg)`;
  overlay.classList.toggle("is-reversed", linearMaskIsReversed(mask));
}

function linearMaskIsReversed(mask) {
  return (mask.geometry.side < 0) !== mask.inverted;
}

function getLinearMaskBand(mask) {
  const halfWidthPercent = clamp(mask.geometry.spread * 100, 5, 49);
  const fullSide = linearMaskIsReversed(mask) ? 1 : -1;
  const zeroSide = -fullSide;
  const fullLine = clamp(50 + fullSide * halfWidthPercent, 0, 100);
  const zeroLine = clamp(50 + zeroSide * halfWidthPercent, 0, 100);

  return {
    fullLine,
    zeroLine
  };
}

function pointerToLinearLocal(mask, event, rect) {
  const point = {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
  const dx = point.x - mask.geometry.centerX;
  const dy = point.y - mask.geometry.centerY;
  const radians = (-mask.geometry.angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

function renderRadialMaskOverlay(mask) {
  const overlay = document.createElement("div");
  overlay.className = "radial-mask-overlay";
  const svg = createSvgElement("svg");
  svg.classList.add("radial-mask-svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");

  const defs = createSvgElement("defs");
  const radialGradient = createSvgElement("radialGradient");
  radialGradient.id = `radialGradient-${mask.id}`;
  radialGradient.setAttribute("cx", "50%");
  radialGradient.setAttribute("cy", "50%");
  radialGradient.setAttribute("r", "50%");
  radialGradient.append(
    createSvgStop("0%", `rgba(255, 0, 0, ${0.45 * mask.density / 100})`),
    createSvgStop(`${Math.max(8, 70 - mask.feather * 0.45)}%`, `rgba(255, 0, 0, ${0.42 * mask.density / 100})`),
    createSvgStop("100%", "rgba(255, 0, 0, 0)")
  );
  defs.append(radialGradient);

  const group = createSvgElement("g");
  const ellipse = createSvgElement("ellipse");
  ellipse.classList.add("radial-mask-ellipse");
  ellipse.setAttribute("fill", `url(#radialGradient-${mask.id})`);
  ellipse.setAttribute("stroke", "rgba(255, 255, 255, 0.86)");
  ellipse.setAttribute("stroke-width", "0.35");
  const hitEllipse = createSvgElement("ellipse");
  hitEllipse.classList.add("radial-mask-hit-area");
  hitEllipse.setAttribute("fill", "rgba(0, 0, 0, 0)");
  group.append(ellipse, hitEllipse);
  svg.append(defs, group);
  overlay.append(svg);
  maskOverlayLayer.append(overlay);
  updateRadialMaskOverlay(group, ellipse, hitEllipse, mask);
  attachRadialMoveDrag(hitEllipse, mask, () => {
    updateRadialMaskOverlay(group, ellipse, hitEllipse, mask);
    updateRadialHandles(mask, handles);
    updateMaskPanelGeometryValues(mask);
  });

  const moveHandle = document.createElement("button");
  moveHandle.className = "mask-handle radial-move-handle";
  moveHandle.type = "button";
  moveHandle.ariaLabel = "Move radial mask";
  attachRadialMoveDrag(moveHandle, mask, () => {
    updateRadialMaskOverlay(group, ellipse, hitEllipse, mask);
    updateRadialHandles(mask, handles);
    updateMaskPanelGeometryValues(mask);
  });

  const rotateHandle = document.createElement("button");
  rotateHandle.className = "mask-handle radial-rotate-handle";
  rotateHandle.type = "button";
  rotateHandle.ariaLabel = "Rotate radial mask";
  attachRadialRotateDrag(rotateHandle, mask, () => {
    updateRadialMaskOverlay(group, ellipse, hitEllipse, mask);
    updateRadialHandles(mask, handles);
    updateMaskPanelGeometryValues(mask);
  });

  const topHandle = createRadialResizeHandle("top");
  const bottomHandle = createRadialResizeHandle("bottom");
  const leftHandle = createRadialResizeHandle("left");
  const rightHandle = createRadialResizeHandle("right");
  const handles = {
    center: moveHandle,
    rotate: rotateHandle,
    top: topHandle,
    bottom: bottomHandle,
    left: leftHandle,
    right: rightHandle
  };

  Object.entries({
    top: topHandle,
    bottom: bottomHandle,
    left: leftHandle,
    right: rightHandle
  }).forEach(([edge, handle]) => {
    attachRadialResizeDrag(handle, mask, edge, () => {
      updateRadialMaskOverlay(group, ellipse, hitEllipse, mask);
      updateRadialHandles(mask, handles);
      updateMaskPanelGeometryValues(mask);
    });
  });

  overlay.append(moveHandle, rotateHandle, topHandle, bottomHandle, leftHandle, rightHandle);
  updateRadialHandles(mask, handles);
}

function updateRadialMaskOverlay(group, ellipse, hitEllipse, mask) {
  group.setAttribute(
    "transform",
    `rotate(${mask.geometry.rotation} ${mask.geometry.centerX * 100} ${mask.geometry.centerY * 100})`
  );
  [ellipse, hitEllipse].forEach(targetEllipse => {
    targetEllipse.setAttribute("cx", String(mask.geometry.centerX * 100));
    targetEllipse.setAttribute("cy", String(mask.geometry.centerY * 100));
    targetEllipse.setAttribute("rx", String(mask.geometry.radiusX * 100));
    targetEllipse.setAttribute("ry", String(mask.geometry.radiusY * 100));
  });
}

function createRadialResizeHandle(edge) {
  const handle = document.createElement("button");
  handle.className = `mask-handle radial-resize-handle radial-${edge}-handle`;
  handle.type = "button";
  handle.ariaLabel = `Resize radial mask ${edge}`;
  return handle;
}

function updateRadialHandles(mask, handles) {
  setRadialHandlePosition(handles.center, mask, 0, 0);
  setRadialHandlePosition(handles.rotate, mask, 0, -mask.geometry.radiusY - 0.08);
  setRadialHandlePosition(handles.top, mask, 0, -mask.geometry.radiusY);
  setRadialHandlePosition(handles.bottom, mask, 0, mask.geometry.radiusY);
  setRadialHandlePosition(handles.left, mask, -mask.geometry.radiusX, 0);
  setRadialHandlePosition(handles.right, mask, mask.geometry.radiusX, 0);
}

function setRadialHandlePosition(handle, mask, localX, localY) {
  const point = rotatedRadialPoint(mask, localX, localY);
  handle.style.left = `${point.x * 100}%`;
  handle.style.top = `${point.y * 100}%`;
}

function rotatedRadialPoint(mask, localX, localY) {
  const radians = (mask.geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: mask.geometry.centerX + localX * cos - localY * sin,
    y: mask.geometry.centerY + localX * sin + localY * cos
  };
}

function pointerToNormalizedPoint(event, rect) {
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
  };
}

function pointerToRadialLocal(mask, event, rect) {
  const point = pointerToNormalizedPoint(event, rect);
  const dx = point.x - mask.geometry.centerX;
  const dy = point.y - mask.geometry.centerY;
  const radians = (mask.geometry.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos
  };
}

function attachRadialMoveDrag(element, mask, onUpdate) {
  let startPointer = null;
  let startCenter = null;
  let beforeDrag = null;

  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    beforeDrag = snapshotState();
    const rect = maskOverlayLayer.getBoundingClientRect();
    startPointer = pointerToNormalizedPoint(event, rect);
    startCenter = {
      x: mask.geometry.centerX,
      y: mask.geometry.centerY
    };
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", event => {
    if (!element.hasPointerCapture(event.pointerId) || !startPointer || !startCenter) {
      return;
    }

    const rect = maskOverlayLayer.getBoundingClientRect();
    const point = pointerToNormalizedPoint(event, rect);
    mask.geometry.centerX = clamp(startCenter.x + point.x - startPointer.x, 0, 1);
    mask.geometry.centerY = clamp(startCenter.y + point.y - startPointer.y, 0, 1);
    onUpdate();
  });

  element.addEventListener("pointerup", event => {
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    startPointer = null;
    startCenter = null;
    recordHistory(beforeDrag ?? snapshotState(), snapshotState());
    beforeDrag = null;
    scheduleBackendRender();
  });
}

function attachRadialResizeDrag(element, mask, edge, onUpdate) {
  let beforeDrag = null;
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    beforeDrag = snapshotState();
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", event => {
    if (!element.hasPointerCapture(event.pointerId)) {
      return;
    }

    const rect = maskOverlayLayer.getBoundingClientRect();
    const local = pointerToRadialLocal(mask, event, rect);
    if (edge === "left" || edge === "right") {
      mask.geometry.radiusX = clamp(Math.abs(local.x), 0.05, 0.8);
    } else {
      mask.geometry.radiusY = clamp(Math.abs(local.y), 0.05, 0.8);
    }
    onUpdate();
  });

  element.addEventListener("pointerup", event => {
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    recordHistory(beforeDrag ?? snapshotState(), snapshotState());
    beforeDrag = null;
    scheduleBackendRender();
  });
}

function attachRadialRotateDrag(element, mask, onUpdate) {
  let beforeDrag = null;
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    beforeDrag = snapshotState();
    element.setPointerCapture(event.pointerId);
  });

  element.addEventListener("pointermove", event => {
    if (!element.hasPointerCapture(event.pointerId)) {
      return;
    }

    const rect = maskOverlayLayer.getBoundingClientRect();
    const centerX = rect.left + mask.geometry.centerX * rect.width;
    const centerY = rect.top + mask.geometry.centerY * rect.height;
    mask.geometry.rotation = Math.round((Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI + 90);
    onUpdate();
  });

  element.addEventListener("pointerup", event => {
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    recordHistory(beforeDrag ?? snapshotState(), snapshotState());
    beforeDrag = null;
    scheduleBackendRender();
  });
}

function renderBrushMaskOverlay(mask) {
  const canvas = document.createElement("canvas");
  canvas.className = "brush-mask-canvas";
  maskOverlayLayer.append(canvas);
  const rect = maskOverlayLayer.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  paintBrushCanvas(canvas, mask);

  const preview = document.createElement("div");
  preview.className = "brush-cursor-preview";
  preview.style.width = `${mask.brush.size}px`;
  preview.style.height = `${mask.brush.size}px`;
  preview.style.setProperty("--brush-inner", `${Math.max(8, mask.brush.size * (1 - mask.brush.feather / 140))}px`);
  maskOverlayLayer.append(preview);

  let isPainting = false;
  let beforePaint = null;
  maskOverlayLayer.onpointermove = event => {
    const frameRect = maskOverlayLayer.getBoundingClientRect();
    preview.style.left = `${event.clientX - frameRect.left}px`;
    preview.style.top = `${event.clientY - frameRect.top}px`;

    if (isPainting) {
      addBrushPoint(mask, event, frameRect);
      paintBrushCanvas(canvas, mask);
    }
  };
  maskOverlayLayer.onpointerdown = event => {
    isPainting = true;
    beforePaint = snapshotState();
    maskOverlayLayer.setPointerCapture(event.pointerId);
    addBrushPoint(mask, event, maskOverlayLayer.getBoundingClientRect());
    paintBrushCanvas(canvas, mask);
  };
  maskOverlayLayer.onpointerup = event => {
    isPainting = false;
    if (maskOverlayLayer.hasPointerCapture(event.pointerId)) {
      maskOverlayLayer.releasePointerCapture(event.pointerId);
    }
    recordHistory(beforePaint ?? snapshotState(), snapshotState());
    beforePaint = null;
    scheduleBackendRender();
  };
}

function addBrushPoint(mask, event, rect) {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  mask.brush.strokes.push({
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    size: mask.brush.size,
    feather: mask.brush.feather,
    flow: mask.brush.flow,
    eraser: mask.brush.eraser || mask.brush.mode === "subtract"
  });
}

function paintBrushCanvas(canvas, mask) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  mask.brush.strokes.forEach(stroke => {
    const x = stroke.x * canvas.width;
    const y = stroke.y * canvas.height;
    const radius = Math.max(1, stroke.size / 2);
    const innerRadius = Math.max(0, Math.min(radius - 0.01, radius * (1 - stroke.feather / 100)));
    const gradient = context.createRadialGradient(x, y, innerRadius, x, y, radius);
    const alpha = mask.showOverlay ? (mask.density / 100) * (stroke.flow / 100) * 0.55 : 0;
    gradient.addColorStop(0, stroke.eraser ? "rgba(0, 0, 0, 1)" : `rgba(255, 0, 0, ${alpha})`);
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    context.globalCompositeOperation = stroke.eraser ? "destination-out" : "source-over";
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  });
  context.globalCompositeOperation = "source-over";
}

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function createSvgStop(offset, color) {
  const stop = createSvgElement("stop");
  stop.setAttribute("offset", offset);
  stop.setAttribute("stop-color", color);
  return stop;
}

function updateMaskPanelGeometryValues(mask) {
  if (activeMaskId !== mask.id) {
    return;
  }

  const mappings = {
    linear: {
      "Angle": mask.geometry.angle,
      "Position X": mask.geometry.centerX,
      "Position Y": mask.geometry.centerY,
      "Spread": mask.geometry.spread
    },
    radial: {
      "Width": mask.geometry.radiusX,
      "Height": mask.geometry.radiusY,
      "Position X": mask.geometry.centerX,
      "Position Y": mask.geometry.centerY,
      "Rotation": mask.geometry.rotation
    }
  }[mask.type];

  if (!mappings) {
    return;
  }

  document.querySelectorAll(".mask-panel .slider-control").forEach(control => {
    const label = control.querySelector(".slider-label-row span")?.textContent;
    const input = control.querySelector("input[type='range']");
    const output = control.querySelector("output");
    if (!input || !output || !Object.prototype.hasOwnProperty.call(mappings, label)) {
      return;
    }

    const value = mappings[label];
    input.value = String(value);
    output.value = Number(value).toFixed(input.step.includes(".") ? input.step.split(".")[1].length : 0);
    updateRangeFill(input);
  });
}

function attachMaskDrag(element, onDrag) {
  let beforeDrag = null;
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    beforeDrag = snapshotState();
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", event => {
    if (!element.hasPointerCapture(event.pointerId)) {
      return;
    }
    onDrag(event, maskOverlayLayer.getBoundingClientRect());
  });
  element.addEventListener("pointerup", event => {
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    recordHistory(beforeDrag ?? snapshotState(), snapshotState());
    beforeDrag = null;
    scheduleBackendRender();
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

controls.forEach(renderMainControl);
renderColorGrading();
initializeHslState();
renderHslMixer();
previewImage.hidden = true;
exportButton.disabled = true;

imageInput.addEventListener("change", event => {
  const [file] = event.target.files ?? [];
  if (file) {
    loadPreview(file);
  }
});

undoButton.addEventListener("click", () => {
  undoLatestEdit();
});

redoButton.addEventListener("click", () => {
  redoLatestEdit();
});

resetButton.addEventListener("click", resetControls);

fitButton.addEventListener("click", () => {
  imageStage.classList.toggle("fit-to-screen");
  fitButton.classList.toggle("is-active", imageStage.classList.contains("fit-to-screen"));
});

beforeAfterButton.addEventListener("mousedown", () => {
  showOriginalPreview();
});

beforeAfterButton.addEventListener("mouseup", () => {
  showRenderedPreview();
});

beforeAfterButton.addEventListener("mouseleave", () => {
  showRenderedPreview();
});

beforeAfterButton.addEventListener("touchstart", event => {
  event.preventDefault();
  showOriginalPreview();
});

beforeAfterButton.addEventListener("touchend", showRenderedPreview);

exportButton.addEventListener("click", exportRenderedPreview);
savePresetButton.addEventListener("click", savePreset);
loadPresetButton.addEventListener("click", () => presetInput.click());
presetInput.addEventListener("change", event => {
  const [file] = event.target.files ?? [];
  if (file) {
    loadPresetFile(file);
  }
});

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const isUndo = (event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey;
  const isRedo = (event.ctrlKey || event.metaKey) && (key === "y" || (key === "z" && event.shiftKey));

  if (isUndo) {
    event.preventDefault();
    undoLatestEdit();
  } else if (isRedo) {
    event.preventDefault();
    redoLatestEdit();
  }
});

document.querySelectorAll("[data-grading-mode]").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-grading-mode]").forEach(modeButton => {
      modeButton.classList.toggle("is-active", modeButton === button);
    });
    renderColorGrading(button.dataset.gradingMode);
  });
});

document.querySelectorAll("[data-mask-tool]").forEach(button => {
  button.addEventListener("click", () => {
    createMask(normalizeMaskTool(button.dataset.maskTool));
  });
});

updateStatus();
updateHistoryButtons();

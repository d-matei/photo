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
const maskStatus = document.getElementById("maskStatus");

const controlGroups = {
  light: document.getElementById("lightControls"),
  presence: document.getElementById("presenceControls"),
  color: document.getElementById("colorControls"),
  colorGrading: document.getElementById("colorGradingControls"),
  hsl: document.getElementById("hslControls")
};

const controls = [
  { group: "light", key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.05, value: 0, decimals: 2 },
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
  { name: "Yellow", swatch: "#ffe11f", hue: 55 },
  { name: "Green", swatch: "#17bf33", hue: 125 },
  { name: "Aqua", swatch: "#20d5e5", hue: 185 },
  { name: "Blue", swatch: "#3888ff", hue: 215 },
  { name: "Purple", swatch: "#9b26ff", hue: 270 },
  { name: "Magenta", swatch: "#ff18d4", hue: 310 }
];

const state = Object.fromEntries(controls.map(control => [control.key, control.value]));
const history = {
  undo: [],
  redo: [],
  activeSliderSnapshot: null
};

function snapshotState() {
  return { ...state };
}

function statesAreEqual(first, second) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every(key => first[key] === second[key]);
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
  Object.entries(nextState).forEach(([key, value]) => setControlValue(key, value));
  updateStatus();
}

function updateHistoryButtons() {
  undoButton.disabled = history.undo.length === 0;
  redoButton.disabled = history.redo.length === 0;
}

function recordHistory(before, after) {
  if (statesAreEqual(before, after)) {
    return;
  }

  history.undo.push({ before, after });
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
    previewImage.onload = () => {
      previewImage.hidden = false;
      emptyState.hidden = true;
      imageStage.classList.add("has-image");
      imageStage.classList.add("fit-to-screen");
      fitButton.classList.add("is-active");
      exportButton.disabled = false;
      statusText.textContent = `${file.name} loaded for UI preview.`;
    };

    previewImage.onerror = () => {
      previewImage.hidden = true;
      emptyState.hidden = false;
      exportButton.disabled = true;
      statusText.textContent = `The browser could not display ${file.name}. Try another JPG or PNG image.`;
    };

    previewImage.src = event.target.result;
    previewImage.alt = file.name;
  };

  reader.onerror = () => {
    previewImage.hidden = false;
    emptyState.hidden = false;
    exportButton.disabled = true;
    statusText.textContent = `Could not read ${file.name}.`;
  };

  previewImage.removeAttribute("src");
  previewImage.hidden = true;
  emptyState.hidden = false;
  statusText.textContent = `Loading ${file.name} (${file.type || "unknown type"})...`;
  reader.readAsDataURL(file);
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
  const entry = history.undo.pop();
  if (!entry) {
    return;
  }

  history.redo.push(entry);
  applyState(entry.before);
  updateHistoryButtons();
});

redoButton.addEventListener("click", () => {
  const entry = history.redo.pop();
  if (!entry) {
    return;
  }

  history.undo.push(entry);
  applyState(entry.after);
  updateHistoryButtons();
});

resetButton.addEventListener("click", resetControls);

fitButton.addEventListener("click", () => {
  imageStage.classList.toggle("fit-to-screen");
  fitButton.classList.toggle("is-active", imageStage.classList.contains("fit-to-screen"));
});

beforeAfterButton.addEventListener("mousedown", () => {
  beforeAfterButton.textContent = "After";
  previewImage.classList.add("showing-before");
});

beforeAfterButton.addEventListener("mouseup", () => {
  beforeAfterButton.textContent = "Before";
  previewImage.classList.remove("showing-before");
});

beforeAfterButton.addEventListener("mouseleave", () => {
  beforeAfterButton.textContent = "Before";
  previewImage.classList.remove("showing-before");
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
    document.querySelectorAll("[data-mask-tool]").forEach(toolButton => {
      toolButton.classList.toggle("is-active", toolButton === button);
    });
    maskStatus.textContent = `${button.textContent} mask selected.`;
  });
});

updateStatus();
updateHistoryButtons();

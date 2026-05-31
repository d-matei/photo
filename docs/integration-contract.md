# Frontend / Backend Contract

This document defines the split between the Rust engine and the frontend.

## Backend Responsibilities

The backend is the Rust side of the project.

Main location:

- `Cargo.toml`
- `src/`

Backend owns:

- image loading and decode boundaries
- internal image buffers
- adjustment logic
- preview rendering
- export rendering
- non-destructive parameter application
- future RAW pipeline

Backend should expose concepts like:

- current image
- current adjustment values
- preview render request
- export render request

## Frontend Responsibilities

The frontend is the future user-facing app.

Main location:

- `frontend/`

Frontend owns:

- window layout
- panels
- sliders and controls
- image viewport
- comparison UX
- keyboard/mouse interaction
- tool grouping and labeling
- preset and history UX later

Frontend should not own:

- image-processing formulas
- per-pixel adjustment math
- export logic

## Shared Data Model

The frontend and backend should communicate using adjustment parameters, not custom duplicated formulas.

Current parameter groups:

- exposure
- saturation
- contrast
- clarity
- dehaze
- white balance
- tonal ranges
- color grading
- HSL color mixer
- masks

Examples of values the frontend should send:

- `global`: one adjustment object for full-image edits
- `masks`: a list of mask definitions, each with its own adjustment object
- each mask has `enabled`, `density`, `inverted`, `shape`, and `adjustments`
- masked edits use the same Rust algorithms as global edits, then blend by per-pixel mask strength

## Current Render Request Shape

The connected frontend/backend app runs with:

```powershell
cargo run --release -- serve
```

Then open:

```text
http://127.0.0.1:7878
```

The frontend sends a render request to:

```text
POST /api/render
```

The request shape is:

```js
{
  image_data_url,
  params
}
```

The frontend also exposes this helper for inspecting the current params:

```js
window.RawPhotoEditorFrontend.buildBackendRenderRequest()
```

It returns:

```js
{
  global: {
    exposure,
    whites,
    highlights,
    shadows,
    blacks,
    temperature,
    tint,
    global_grading_hue,
    global_grading_intensity,
    shadows_grading_hue,
    shadows_grading_intensity,
    midtones_grading_hue,
    midtones_grading_intensity,
    highlights_grading_hue,
    highlights_grading_intensity,
    color_grading_reference,
    mixer_hue,
    mixer_saturation,
    mixer_luminance,
    saturation,
    contrast,
    dehaze,
    clarity
  },
  masks: [
    {
      id,
      name,
      enabled,
      density,
      inverted,
      shape,
      adjustments
    }
  ]
}
```

The Rust backend equivalent lives in:

- `src/pipeline/render.rs`
- `src/pipeline/masking.rs`

Linear gradient masks follow the Lightroom-style signed-distance formula:

```text
strength = clamp(signed_distance / half_width + 0.5, 0.0, 1.0)
```

## Practical Workflow

Backend developer works mostly in:

- `src/pipeline/`
- `src/io/`
- `src/engine/`
- `src/tester.rs`

Frontend developer works mostly in:

- `frontend/`

The current bridge is a thin local HTTP layer in `src/server.rs`; algorithm code stays in Rust pipeline files, not in the frontend.

## Recommended Integration Path

Phase 1:

- keep the Rust tester as the internal algorithm lab
- build the real interface separately in `frontend/`

Phase 2:

- retire the browser playground
- keep the Rust tester only as an internal dev tool
- move from the temporary local HTTP bridge to a final desktop shell when ready

## Rule

The Rust backend is the source of truth for all image behavior.

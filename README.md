# Lumiere

Backend-first foundation for a Lightroom-like photo editor.

## Goals

- Non-destructive editing pipeline
- RAW ingest and decode layer
- Global adjustments
- Local adjustments and masking
- Color grading tools
- Export pipeline for final renders

## Stack Direction

- Core engine: Rust
- Current tuning app: native Rust tester
- Current connected app: web frontend served by the Rust backend
- Future app shell: Tauri or another desktop shell once the algorithms and interface settle

## Project Split

The repository is now organized around a simple two-person collaboration model:

- `backend`
  Rust image engine, adjustment math, render pipeline, preview/export logic
- `frontend`
  future user-facing interface and interaction layer
- `docs`
  shared contract between frontend and backend so both sides can work in parallel

## Current Structure

- `src/engine`
  backend editor/session state
- `src/io`
  backend file ingest boundaries
- `src/pipeline`
  backend adjustment algorithms and render stages
- `src/tester.rs`
  native Rust tuning app for algorithm development
- `frontend`
  dedicated workspace for the future UI
- `docs/integration-contract.md`
  agreed responsibilities and data boundary between UI and engine
- `playground`
  older browser prototype kept only as reference
- `curve_viewer`
  helper tool for curve visualization

## Ownership Suggestion

- Backend owner
  image pipeline, adjustment behavior, preview render, export, file handling
- Frontend owner
  layout, controls, panels, image viewer, interaction flow, presets UX, tool organization

## Planned Adjustment Areas

- Exposure
- Saturation
- Vibrance
- Contrast
- Dehaze
- Clarity
- Texture
- Masking tools
- Color grading tools

## Working Agreement

- The Rust code in `src/` is the source of truth for image behavior.
- The frontend should not reimplement the adjustment math.
- The frontend should send parameter values and receive preview/export results from the backend layer.
- The native Rust tester stays available as the fast internal tuning tool while the real frontend is being built.

## Running The App

Run the connected frontend/backend app:

```powershell
cargo run --release -- serve
```

Then open:

```text
http://127.0.0.1:7878
```

Run the app-style window:

```powershell
cargo run --release -- app
```

On Windows with Chrome installed, this opens the editor in a standalone app window without browser tabs or an address bar. You can also double-click `RawPhotoEditor-App.bat`.

Run the Tauri desktop wrapper:

```powershell
cd src-tauri
cargo run
```

Build the Tauri desktop app:

```powershell
cd src-tauri
cargo tauri build
```

Run the native Rust algorithm tester:

```powershell
cargo run --release
```

The connected frontend currently sends the loaded image, global adjustments, and masks to Rust. Rust renders the preview through `src/pipeline/render.rs` and returns the edited preview image.

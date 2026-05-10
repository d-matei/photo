# Frontend / Backend Contract

This document defines the split between the Rust engine and the future frontend.

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

Examples of values the frontend should send:

- `exposure: f32`
- `saturation: f32`
- `contrast: f32`
- `clarity: f32`
- `dehaze: f32`
- advanced tuning values when needed

## Practical Workflow

Backend developer works mostly in:

- `src/pipeline/`
- `src/io/`
- `src/engine/`
- `src/tester.rs`

Frontend developer works mostly in:

- `frontend/`

When the real app bridge is added later, create a thin integration layer instead of moving algorithm code into the frontend.

## Recommended Integration Path

Phase 1:

- keep the Rust tester as the internal algorithm lab
- build the real interface separately in `frontend/`

Phase 2:

- add a bridge between frontend and backend
- likely options:
  - Tauri desktop app
  - local HTTP API
  - direct native integration later

Phase 3:

- retire the browser playground
- keep the Rust tester only as an internal dev tool

## Rule

The Rust backend is the source of truth for all image behavior.

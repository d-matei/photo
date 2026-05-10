# RAW Photo Editor

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
- Future user interface: separate frontend app, likely web-based, connected later through Tauri or another app shell

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

## Immediate Next Step

1. Keep tuning algorithms in the Rust tester.
2. Build the frontend inside `frontend/`.
3. Use `docs/integration-contract.md` as the shared boundary so both people can work in parallel.

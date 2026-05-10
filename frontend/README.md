# Frontend Workspace

This folder is reserved for the future user-facing interface of the editor.

## Purpose

The frontend should focus on:

- layout
- controls
- image viewer UX
- tool organization
- interaction design

It should not reimplement the image-processing math that already lives in the Rust backend.

## Current Status

The first frontend shell now lives in:

- `frontend/index.html`
- `frontend/src/app.js`
- `frontend/src/styles.css`

It is intentionally dependency-free for now, so you can open `frontend/index.html`
directly in a browser while the product direction is still forming.

The live algorithm-testing tool is still the Rust tester in:

- `src/tester.rs`

This `frontend/` folder exists so a second collaborator can start building the real interface without mixing UI code into the backend engine.

## Suggested Future Structure

- `frontend/src`
- `frontend/public`
- `frontend/components`
- `frontend/styles`

## Starting Workflow

1. Open `frontend/index.html` in a browser.
2. Use the left sidebar to shape the adjustment controls and grouping.
3. Use the preview area to design image viewing, before/after, zoom, and pan.
4. Keep all image-processing behavior in Rust.
5. When the UI shape feels good, add a thin backend bridge for real preview rendering.

## Important Rule

Treat the Rust backend as the source of truth for all adjustment behavior.

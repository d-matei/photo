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

The live algorithm-testing tool is still the Rust tester in:

- `src/tester.rs`

This `frontend/` folder exists so a second collaborator can start building the real interface without mixing UI code into the backend engine.

## Suggested Future Structure

- `frontend/src`
- `frontend/public`
- `frontend/components`
- `frontend/styles`

## Important Rule

Treat the Rust backend as the source of truth for all adjustment behavior.

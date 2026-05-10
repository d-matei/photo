# RAW Photo Editor

Backend-first foundation for a Lightroom-like RAW photo editor.

## Goals

- Non-destructive editing pipeline
- RAW ingest and decode layer
- Global adjustments
- Local adjustments and masking
- Color grading tools
- Export pipeline for final renders

## Recommended Stack

- Core engine: Rust
- Future UI: React or another web UI, connected later through Tauri or an HTTP bridge

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

## Current Structure

- `src/engine`: image state and editor session
- `src/io`: file ingest and decode boundaries
- `src/pipeline`: adjustment pipeline and render stages
- `playground`: local slider-based tuning lab for live algorithm testing

## Playground

You can test the current adjustment math immediately in the browser:

1. Open `playground/index.html`
2. Load a JPEG, PNG, or WebP image
3. Move the sliders and compare original vs adjusted

The playground currently mirrors:

- Exposure
- Saturation
- Contrast
- Dehaze

This is meant for fast algorithm tuning while the Rust engine is still being built.

## Next Step

Define the behavior, math, and ordering for each adjustment, then implement them one by one.

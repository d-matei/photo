# Lumiere

Lumiere is a Rust-powered desktop photo editor built with a Tauri shell and a dependency-free frontend.

## Current App

- Desktop shell: Tauri
- Image processing backend: Rust
- Frontend: HTML, CSS, and JavaScript served by the local Rust backend
- Supported preview/import formats: common browser/image formats such as JPEG and PNG
- Export: full-resolution rendered PNG

## Source Layout

- `src/pipeline`
  Adjustment algorithms and render pipeline.
- `src/server.rs`
  Local preview/export server used by the Tauri app.
- `frontend`
  Final user interface and bundled assets.
- `src-tauri`
  Desktop app packaging, icon, permissions, and Tauri entry point.
- `docs`
  Backend/frontend integration notes.

## Build

Install the Tauri CLI once:

```powershell
cargo install tauri-cli --version "^2"
```

Build the Windows installer:

```powershell
cd src-tauri
cargo tauri build --bundles nsis
```

The installer is created at:

```text
src-tauri/target/release/bundle/nsis/Lumiere_0.1.0_x64-setup.exe
```

## Development

Run the desktop app in development mode:

```powershell
cd src-tauri
cargo run
```

Run a backend check:

```powershell
cargo check --release
```

## Repository Hygiene

Generated build folders such as `target/` and `src-tauri/target/` are intentionally ignored and should not be committed.

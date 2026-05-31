#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::time::Duration;

fn main() {
    thread::spawn(|| {
        if let Err(error) = raw_photo_editor::server::run() {
            eprintln!("Could not start local render server: {error}");
        }
    });

    // Give the local server a short moment to bind before the webview loads.
    thread::sleep(Duration::from_millis(300));

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Lumiere");
}

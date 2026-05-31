mod tester;

use raw_photo_editor::server;

fn main() -> eframe::Result<()> {
    if std::env::args().any(|argument| argument == "app") {
        if let Err(error) = server::run_app_window() {
            eprintln!("Could not start app window: {error}");
        }
        return Ok(());
    }

    if std::env::args().any(|argument| argument == "serve") {
        if let Err(error) = server::run() {
            eprintln!("Could not start frontend/backend server: {error}");
        }
        return Ok(());
    }

    tester::run()
}

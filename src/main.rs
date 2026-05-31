mod server;
mod tester;

fn main() -> eframe::Result<()> {
    if std::env::args().any(|argument| argument == "serve") {
        if let Err(error) = server::run() {
            eprintln!("Could not start frontend/backend server: {error}");
        }
        return Ok(());
    }

    tester::run()
}

fn main() {
    // `desktop` implies `desktop-runtime`; the ACL/permission tables must be generated for both,
    // otherwise plugins such as the file dialogs are rejected at runtime in `tauri dev`.
    if std::env::var_os("CARGO_FEATURE_DESKTOP_RUNTIME").is_some() {
        tauri_build::build();
    }
}

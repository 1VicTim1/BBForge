pub mod commands;
pub mod files;

#[cfg(all(target_os = "linux", feature = "legacy-webkit"))]
mod webkit_compat;

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::analyze,
            commands::read_document,
            commands::write_document
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска BBForge");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    panic!("BBForge desktop runtime requires the `desktop` Cargo feature");
}

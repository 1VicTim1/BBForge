pub mod catalog;
pub mod commands;
pub mod files;
pub mod keyring;
pub mod plugins;
pub mod script_api;
pub mod session;

#[cfg(all(target_os = "linux", feature = "legacy-webkit"))]
mod webkit_compat;

#[cfg(feature = "desktop-runtime")]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::analyze,
            commands::read_document,
            commands::write_document,
            commands::read_workspace_session,
            commands::write_workspace_session,
            commands::plugin_preview,
            commands::plugin_install,
            commands::plugin_list,
            commands::plugin_remove,
            commands::plugin_set_enabled,
            commands::plugin_accept_changes,
            commands::catalog_list,
            commands::catalog_download,
            commands::keyring_refresh,
            commands::script_http_get,
            commands::script_window_open,
            commands::script_window_cookies,
            commands::script_window_close,
            commands::script_window_clear_data,
            commands::script_storage_get,
            commands::script_storage_set
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска BBForge");
}

#[cfg(not(feature = "desktop-runtime"))]
pub fn run() {
    panic!("BBForge desktop runtime requires the `desktop` Cargo feature");
}

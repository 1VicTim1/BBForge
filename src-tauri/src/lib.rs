pub mod commands;
pub mod files;

#[cfg(feature = "desktop")]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::analyze])
        .run(tauri::generate_context!())
        .expect("ошибка запуска BBForge");
}

#[cfg(not(feature = "desktop"))]
pub fn run() {
    panic!("BBForge desktop runtime requires the `desktop` Cargo feature");
}

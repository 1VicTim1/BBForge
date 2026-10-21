use serde_json::Value;
use std::{fs, io::Write, path::{Path, PathBuf}};

const MAX_SESSION: usize = 128 * 1024 * 1024;

fn backup_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(".bak");
    PathBuf::from(name)
}

fn valid(payload: &str) -> bool {
    if payload.len() > MAX_SESSION { return false; }
    serde_json::from_str::<Value>(payload).ok()
        .and_then(|value| value.get("version").and_then(Value::as_u64)) == Some(1)
}

fn atomic_write(path: &Path, payload: &[u8]) -> Result<(), String> {
    let mut file = atomic_write_file::AtomicWriteFile::open(path).map_err(|error| error.to_string())?;
    file.write_all(payload).map_err(|error| error.to_string())?;
    file.as_file().sync_all().map_err(|error| error.to_string())?;
    file.commit().map_err(|error| error.to_string())
}

pub fn read(path: &Path) -> Result<Option<String>, String> {
    for candidate in [path.to_path_buf(), backup_path(path)] {
        match fs::read_to_string(candidate) {
            Ok(payload) if valid(&payload) => return Ok(Some(payload)),
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(None)
}

pub fn write(path: &Path, payload: &str) -> Result<(), String> {
    if !valid(payload) { return Err("Некорректный или неподдерживаемый снимок рабочего пространства".into()); }
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    if let Ok(previous) = fs::read_to_string(path) {
        if valid(&previous) { atomic_write(&backup_path(path), previous.as_bytes())?; }
    }
    atomic_write(path, payload.as_bytes())
}

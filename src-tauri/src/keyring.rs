//! Trusted developer keys: the root key compiled in, and the list it signs, downloaded from the
//! plugin catalog repository and cached in `<app data>/trusted-keys.json(.sig)`.

use bbforge_plugin::keyring::{KEYRING_FILE, KEYRING_SIGNATURE_FILE, Keyring, verify_keyring};
use std::fs;
use std::io::Read;
use std::path::Path;

/// The only key compiled into BBForge. It signs the list of trusted developers.
pub const ROOT_NAME: &str = "1VicTim1";
pub const ROOT_KEY: &str = "fqcZAYlidLAi/qw0GnJ7+KyB+OJah1j916q32uWEG4w=";
const KEYRING_BASE: &str = "https://raw.githubusercontent.com/1VicTim1/BBForge-plugins/main/";
const MAX_KEYRING: u64 = 256 * 1024;

/// The cached list, if its signature still checks out.
pub fn cached(dir: &Path) -> Option<Keyring> {
    let bytes = fs::read(dir.join(KEYRING_FILE)).ok()?;
    let signature = fs::read_to_string(dir.join(KEYRING_SIGNATURE_FILE)).ok()?;
    verify_keyring(&bytes, &signature, ROOT_KEY).ok()
}

/// Keys to trust now: the root, plus the cached list when there is one.
pub fn trusted_keys(dir: &Path) -> Vec<(String, String)> {
    cached(dir).map_or_else(
        || vec![(ROOT_NAME.to_string(), ROOT_KEY.to_string())],
        |keyring| keyring.trusted(ROOT_NAME, ROOT_KEY),
    )
}

/// Saves a downloaded list if it is signed by the root key and not older than the cached one.
pub fn store(dir: &Path, bytes: &[u8], signature: &str) -> Result<Keyring, String> {
    let keyring = verify_keyring(bytes, signature, ROOT_KEY)?;
    if let Some(current) = cached(dir)
        && current.serial > keyring.serial
    {
        return Err(format!(
            "Список ключей старее сохранённого ({} < {})",
            keyring.serial, current.serial
        ));
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    // The signature goes first: a list without a matching signature next to it is ignored anyway.
    write(
        &dir.join(KEYRING_SIGNATURE_FILE),
        signature.trim().as_bytes(),
    )?;
    write(&dir.join(KEYRING_FILE), bytes)?;
    Ok(keyring)
}

fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = atomic_write_file::AtomicWriteFile::open(path)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    file.commit()
        .map_err(|error| format!("{}: {error}", path.display()))
}

fn get(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|error| format!("{url}: {error}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_KEYRING + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("{url}: {error}"))?;
    if bytes.len() as u64 > MAX_KEYRING {
        return Err(format!("{url}: файл слишком большой"));
    }
    Ok(bytes)
}

/// Downloads the published list; on any problem the cached one stays.
pub fn refresh(dir: &Path) -> Result<Keyring, String> {
    let bytes = get(&format!("{KEYRING_BASE}{KEYRING_FILE}"))?;
    let signature = get(&format!("{KEYRING_BASE}{KEYRING_SIGNATURE_FILE}"))?;
    store(
        dir,
        &bytes,
        &String::from_utf8(signature).map_err(|_| "Подпись списка ключей не текст")?,
    )
}

//! What plugin scripts may ask the desktop side for: site windows, HTTP requests and private
//! storage. Every call is checked against the permissions of the installed package itself
//! (enabled, unchanged since installation), never against what the interface claims.
//!
//! - `network:<domain>`: requests to that domain and its subdomains, https only;
//! - `windows`: a window with a page of such a domain (own browser storage per plugin) and its cookies;
//! - `storage`: a private key–value store, at most 1 MB.

use crate::plugins::Store;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const MAX_RESPONSE: u64 = 10 * 1024 * 1024;
const MAX_STORAGE: usize = 1024 * 1024;
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 BBForge";

fn valid_host(host: &str) -> bool {
    host.len() <= 80
        && host.contains('.')
        && host.split('.').all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
}

/// Host of an https URL without user info or port, lowercase.
pub fn https_host(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let authority = rest.split(['/', '?', '#']).next()?;
    if authority.contains('@') || authority.contains(':') {
        return None;
    }
    let host = authority.to_ascii_lowercase();
    valid_host(&host).then_some(host)
}

pub fn host_allowed(host: &str, allowed: &[String]) -> bool {
    allowed
        .iter()
        .any(|item| host == item || host.ends_with(&format!(".{item}")))
}

/// Domains from `network:<domain>` permissions.
pub fn network_hosts(permissions: &[String]) -> Vec<String> {
    permissions
        .iter()
        .filter_map(|permission| permission.strip_prefix("network:"))
        .map(str::to_ascii_lowercase)
        .filter(|host| valid_host(host))
        .collect()
}

pub struct Granted {
    pub permissions: Vec<String>,
}

impl Granted {
    pub fn require(&self, permission: &str) -> Result<(), String> {
        if self.permissions.iter().any(|item| item == permission) {
            Ok(())
        } else {
            Err(format!("Нет разрешения «{permission}»"))
        }
    }

    /// The URL's host when the package may reach it.
    pub fn url(&self, url: &str) -> Result<String, String> {
        let host = https_host(url).ok_or("Адрес должен быть https без порта и логина")?;
        if !host_allowed(&host, &network_hosts(&self.permissions)) {
            return Err(format!("Нет разрешения «network:{host}»"));
        }
        Ok(host)
    }
}

/// Permissions of an installed package that may run: enabled, unchanged, without errors.
pub fn granted(store: &Store, id: &str) -> Result<Granted, String> {
    let package = store.installed(id)?;
    if !package.enabled || package.tampered || !package.errors.is_empty() {
        return Err(format!("Пакет {id} выключен или изменён"));
    }
    Ok(Granted {
        permissions: package.manifest.permissions,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub content_type: String,
    /// Body as base64; the script decodes it in the encoding it expects.
    pub body: String,
}

/// GET with the given cookies; any status comes back (a 404 is an answer, not an error).
pub fn http_get(url: &str, cookies: &BTreeMap<String, String>) -> Result<HttpResponse, String> {
    let header = cookies
        .iter()
        .filter(|(name, value)| {
            !name.is_empty()
                && name
                    .chars()
                    .all(|c| c.is_ascii_graphic() && c != ';' && c != '=')
                && value.chars().all(|c| c.is_ascii_graphic() && c != ';')
        })
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    let mut request = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(60));
    if !header.is_empty() {
        request = request.set("Cookie", &header);
    }
    let response = match request.call() {
        Ok(response) | Err(ureq::Error::Status(_, response)) => response,
        Err(error) => return Err(error.to_string()),
    };
    let status = response.status();
    let content_type = response
        .header("Content-Type")
        .unwrap_or_default()
        .to_string();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_RESPONSE + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_RESPONSE {
        return Err("Ответ больше 10 МБ".into());
    }
    Ok(HttpResponse {
        status,
        content_type,
        body: BASE64.encode(bytes),
    })
}

/// `<app data>/plugin-data/<id>/`: storage.json and the browser storage of the plugin's windows.
pub struct PluginData {
    dir: PathBuf,
}

impl PluginData {
    pub fn new(root: &Path, id: &str) -> Result<Self, String> {
        if !bbforge_plugin::valid_id(id) {
            return Err(format!("Неверный id пакета: {id}"));
        }
        Ok(Self { dir: root.join(id) })
    }

    pub fn webview_dir(&self) -> PathBuf {
        self.dir.join("webview")
    }

    fn storage_file(&self) -> PathBuf {
        self.dir.join("storage.json")
    }

    fn read(&self) -> Map<String, Value> {
        fs::read(self.storage_file())
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn get(&self, key: &str) -> Value {
        self.read().remove(key).unwrap_or(Value::Null)
    }

    pub fn set(&self, key: &str, value: Option<Value>) -> Result<(), String> {
        if key.is_empty() || key.len() > 200 {
            return Err("Неверный ключ хранилища".into());
        }
        let mut data = self.read();
        match value {
            Some(value) => {
                data.insert(key.to_string(), value);
            }
            None => {
                data.remove(key);
            }
        }
        let json = serde_json::to_vec(&data).expect("storage serializes");
        if json.len() > MAX_STORAGE {
            return Err("Хранилище плагина больше 1 МБ".into());
        }
        fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        write_private(&self.storage_file(), &json)
    }

    /// Storage and browser data of the plugin's windows; used when the package is removed.
    pub fn clear(&self) -> Result<(), String> {
        match fs::remove_dir_all(&self.dir) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn clear_webview(&self) -> Result<(), String> {
        match fs::remove_dir_all(self.webview_dir()) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }
}

#[cfg(unix)]
fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let temporary = path.with_extension("json.tmp");
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(&temporary)
        .map_err(|error| error.to_string())?;
    file.write_all(bytes).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|error| error.to_string())
}

/// Cookies a window has for the plugin's domains that are all set (and not one of `ignore`).
pub fn complete_cookies(
    found: &[(String, String)],
    names: &[String],
    ignore: &[String],
) -> Option<BTreeMap<String, String>> {
    let mut result = BTreeMap::new();
    for name in names {
        let (_, value) = found.iter().find(|(candidate, value)| {
            candidate == name && !value.is_empty() && !ignore.contains(value)
        })?;
        result.insert(name.clone(), value.clone());
    }
    Some(result)
}

//! What plugin scripts may ask the desktop side for: site windows, HTTP requests and private
//! storage. Every call is checked against the permissions of the installed package itself
//! (enabled, unchanged since installation), never against what the interface claims.
//!
//! - `network:<domain>`: requests to that domain and its subdomains, https only;
//! - `windows`: a window with a page of such a domain (own browser storage per plugin) and its cookies;
//! - `storage`: a private key–value store, at most 1 MB;
//! - `network.custom`: requests to addresses the user allowed one by one (a self-hosted server,
//!   also `http://` on this computer or the local network), kept in `plugin-data/<id>/origins.json`.

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

/// `scheme://host[:port]` of an address a plugin may be allowed to reach by the user: https
/// anywhere, http only on this computer or the local network. None for anything else.
pub fn origin_of(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "https" && scheme != "http" {
        return None;
    }
    let authority = rest.split(['/', '?', '#']).next()?.to_ascii_lowercase();
    if authority.is_empty() || authority.contains('@') {
        return None;
    }
    let (host, port) = match authority.strip_prefix('[') {
        Some(inner) => {
            let (host, after) = inner.split_once(']')?;
            (format!("[{host}]"), after.strip_prefix(':'))
        }
        None => match authority.split_once(':') {
            Some((host, port)) => (host.to_string(), Some(port)),
            None => (authority.clone(), None),
        },
    };
    if let Some(port) = port
        && (port.is_empty() || port.parse::<u16>().ok().filter(|port| *port > 0).is_none())
    {
        return None;
    }
    let ipv4 = host.parse::<std::net::Ipv4Addr>().ok();
    let local = host == "localhost"
        || host == "[::1]"
        || ipv4.is_some_and(|ip| ip.is_loopback() || ip.is_private());
    let named = host == "localhost" || valid_host(&host);
    if !(named || ipv4.is_some() || host == "[::1]") || (scheme == "http" && !local) {
        return None;
    }
    Some(match port {
        Some(port) => format!("{scheme}://{host}:{port}"),
        None => format!("{scheme}://{host}"),
    })
}

pub struct Granted {
    pub permissions: Vec<String>,
    /// Addresses the user allowed (with the `network.custom` permission).
    pub origins: Vec<String>,
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

    /// Whether a script may send a request there: a domain of its `network:` permissions, or an
    /// address the user allowed.
    pub fn request_url(&self, url: &str) -> Result<(), String> {
        if self.url(url).is_ok() {
            return Ok(());
        }
        let origin = origin_of(url)
            .ok_or("Неверный адрес: https, или http на этом компьютере и в локальной сети")?;
        if self.permissions.iter().any(|item| item == "network.custom")
            && self.origins.contains(&origin)
        {
            Ok(())
        } else {
            Err(format!("Нет разрешения на адрес {origin}"))
        }
    }
}

/// Permissions of an installed package that may run: enabled, unchanged, without errors.
pub fn granted(store: &Store, id: &str, data: &PluginData) -> Result<Granted, String> {
    let package = store.installed(id)?;
    if !package.enabled || package.tampered || !package.errors.is_empty() {
        return Err(format!("Пакет {id} выключен или изменён"));
    }
    Ok(Granted {
        permissions: package.manifest.permissions,
        origins: data.origins(),
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
    read_response(request.call())
}

/// A request body: form fields (application/x-www-form-urlencoded) or JSON.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PostBody {
    Form(BTreeMap<String, String>),
    Json(Value),
}

/// POST without cookies; any status comes back.
pub fn http_post(url: &str, body: &PostBody) -> Result<HttpResponse, String> {
    let request = ureq::post(url)
        .set("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(60));
    read_response(match body {
        PostBody::Form(fields) => {
            let pairs: Vec<(&str, &str)> = fields
                .iter()
                .map(|(name, value)| (name.as_str(), value.as_str()))
                .collect();
            request.send_form(&pairs)
        }
        PostBody::Json(value) => request
            .set("Content-Type", "application/json")
            .send_string(&value.to_string()),
    })
}

fn read_response(result: Result<ureq::Response, ureq::Error>) -> Result<HttpResponse, String> {
    let response = match result {
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

    fn origins_file(&self) -> PathBuf {
        self.dir.join("origins.json")
    }

    /// Addresses the user allowed this plugin to reach.
    pub fn origins(&self) -> Vec<String> {
        fs::read(self.origins_file())
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Vec<String>>(&bytes).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|origin| origin_of(origin).as_deref() == Some(origin))
            .collect()
    }

    pub fn set_origin(&self, origin: &str, allowed: bool) -> Result<(), String> {
        if origin_of(origin).as_deref() != Some(origin) {
            return Err(format!("Неверный адрес: {origin}"));
        }
        let mut origins = self.origins();
        origins.retain(|item| item != origin);
        if allowed {
            origins.push(origin.to_string());
        }
        fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        write_private(
            &self.origins_file(),
            &serde_json::to_vec(&origins).expect("origins serialize"),
        )
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_addresses_are_https_or_local_http() {
        assert_eq!(
            origin_of("https://api.example.com/v2/check").as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(
            origin_of("http://localhost:8081/v2/check").as_deref(),
            Some("http://localhost:8081")
        );
        assert_eq!(
            origin_of("http://192.168.1.5:8010").as_deref(),
            Some("http://192.168.1.5:8010")
        );
        assert_eq!(
            origin_of("http://[::1]:8081/").as_deref(),
            Some("http://[::1]:8081")
        );
        assert_eq!(
            origin_of("HTTPS://LT.Example.org:8443/x").as_deref(),
            Some("https://lt.example.org:8443")
        );
        assert_eq!(origin_of("http://example.com"), None);
        assert_eq!(origin_of("http://8.8.8.8"), None);
        assert_eq!(origin_of("https://user@example.com"), None);
        assert_eq!(origin_of("https://example.com:0"), None);
        assert_eq!(origin_of("file:///etc/passwd"), None);
    }

    #[test]
    fn requests_need_a_permission_or_an_allowed_address() {
        let granted = Granted {
            permissions: vec!["network:example.com".into(), "network.custom".into()],
            origins: vec!["http://localhost:8081".into()],
        };
        assert!(granted.request_url("https://api.example.com/x").is_ok());
        assert!(
            granted
                .request_url("http://localhost:8081/v2/check")
                .is_ok()
        );
        assert!(granted.request_url("http://localhost:9000/").is_err());
        let without = Granted {
            permissions: vec![],
            origins: vec!["http://localhost:8081".into()],
        };
        assert!(without.request_url("http://localhost:8081/").is_err());
    }
}

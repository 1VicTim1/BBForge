//! Installed plugins and themes: `<app data>/plugins/<id>.zip` plus `plugins/registry.json`.
//!
//! The archive is kept as installed and verified again on every start, so a package changed on
//! disk is noticed (its signature breaks or its digest no longer matches the one the user accepted).

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use bbforge_plugin::{Inspection, Manifest, SignatureStatus, TrustedKey, read_archive};

/// Keys as (name, public key), turned into the borrowed form `inspect` wants.
fn borrowed(keys: &[(String, String)]) -> Vec<TrustedKey<'_>> {
    keys.iter()
        .map(|(name, public_key)| TrustedKey { name, public_key })
        .collect()
}
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_PACKAGE: u64 = 60 * 1024 * 1024;
const REGISTRY: &str = "registry.json";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Registry {
    #[serde(default)]
    packages: BTreeMap<String, RegistryEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryEntry {
    enabled: bool,
    /// Digest the user accepted at installation.
    digest: String,
    installed_at: u64,
}

/// What the install dialog shows before anything is written.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPreview {
    #[serde(flatten)]
    pub inspection: Inspection,
    /// Version of the same package that is already installed.
    pub installed_version: Option<String>,
    /// Whether the user must confirm: the package is not signed with a trusted key.
    pub needs_confirmation: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackage {
    pub manifest: Manifest,
    pub enabled: bool,
    pub signature: SignatureStatus,
    /// The archive differs from what was accepted at installation; the package is not loaded.
    pub tampered: bool,
    pub errors: Vec<String>,
    /// Text files (json, css, md, txt, js) by path.
    pub files: BTreeMap<String, String>,
    /// Images as data: URLs by path.
    pub assets: BTreeMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum Listed {
    Ok(Box<InstalledPackage>),
    Broken { id: String, error: String },
}

pub struct Store {
    dir: PathBuf,
    /// Keys whose packages are "trusted": the root key and the signed list (see keyring.rs).
    trusted: Vec<(String, String)>,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|time| time.as_secs())
        .unwrap_or_default()
}

fn read_package_file(path: &Path) -> Result<Vec<u8>, String> {
    let size = fs::metadata(path)
        .map_err(|error| format!("{}: {error}", path.display()))?
        .len();
    if size > MAX_PACKAGE {
        return Err("Пакет больше 60 МБ".into());
    }
    fs::read(path).map_err(|error| format!("{}: {error}", path.display()))
}

/// Errors that make a package impossible to install, beyond the manifest's own checks.
fn compatibility(manifest: &Manifest) -> Vec<String> {
    let mut errors = Vec::new();
    if let Some(engine) = &manifest.engine
        && let (Ok(requirement), Ok(current)) = (
            semver::VersionReq::parse(engine),
            semver::Version::parse(env!("CARGO_PKG_VERSION")),
        )
        && !requirement.matches(&current)
    {
        errors.push(format!(
            "Пакет требует BBForge {engine}, установлена версия {current}"
        ));
    }
    errors
}

impl Store {
    /// A store that trusts only the root key.
    pub fn new(dir: PathBuf) -> Self {
        let trusted = vec![(
            crate::keyring::ROOT_NAME.to_string(),
            crate::keyring::ROOT_KEY.to_string(),
        )];
        Self { dir, trusted }
    }

    pub fn with_trusted(dir: PathBuf, trusted: Vec<(String, String)>) -> Self {
        Self { dir, trusted }
    }

    pub fn trusted(&self) -> Vec<TrustedKey<'_>> {
        borrowed(&self.trusted)
    }

    fn archive_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.zip"))
    }

    fn registry(&self) -> Registry {
        fs::read(self.dir.join(REGISTRY))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save_registry(&self, registry: &Registry) -> Result<(), String> {
        fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        let json = serde_json::to_vec_pretty(registry).expect("registry serializes");
        atomic_write(&self.dir.join(REGISTRY), &json)
    }

    pub fn preview(&self, path: &Path) -> Result<InstallPreview, String> {
        let package = read_archive(&read_package_file(path)?)?;
        let mut inspection = package.inspect(&self.trusted());
        inspection.errors.extend(compatibility(&package.manifest));
        let installed_version = self
            .registry()
            .packages
            .contains_key(&package.manifest.id)
            .then(|| self.load(&package.manifest.id).ok())
            .flatten()
            .map(|installed| installed.manifest.version);
        let needs_confirmation = !inspection.signature.is_trusted();
        Ok(InstallPreview {
            inspection,
            installed_version,
            needs_confirmation,
        })
    }

    /// Installs the package at `path` if it still has the digest the user saw in the preview.
    pub fn install(&self, path: &Path, digest: &str) -> Result<InstalledPackage, String> {
        let bytes = read_package_file(path)?;
        let package = read_archive(&bytes)?;
        let mut inspection = package.inspect(&self.trusted());
        inspection.errors.extend(compatibility(&package.manifest));
        if inspection.digest != digest {
            return Err("Файл пакета изменился после проверки. Откройте его заново.".into());
        }
        if !inspection.errors.is_empty() {
            return Err(inspection.errors.join("\n"));
        }
        let id = package.manifest.id.clone();
        fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        atomic_write(&self.archive_path(&id), &bytes)?;
        let mut registry = self.registry();
        registry.packages.insert(
            id.clone(),
            RegistryEntry {
                enabled: true,
                digest: inspection.digest,
                installed_at: now(),
            },
        );
        self.save_registry(&registry)?;
        self.load(&id)
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut registry = self.registry();
        if registry.packages.remove(id).is_none() {
            return Err(format!("Пакет {id} не установлен"));
        }
        self.save_registry(&registry)?;
        match fs::remove_file(self.archive_path(id)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut registry = self.registry();
        let entry = registry
            .packages
            .get_mut(id)
            .ok_or_else(|| format!("Пакет {id} не установлен"))?;
        entry.enabled = enabled;
        self.save_registry(&registry)
    }

    /// Accepts the current contents of a package that changed on disk.
    pub fn accept_changes(&self, id: &str) -> Result<(), String> {
        let package = read_archive(&read_package_file(&self.archive_path(id))?)?;
        let mut registry = self.registry();
        let entry = registry
            .packages
            .get_mut(id)
            .ok_or_else(|| format!("Пакет {id} не установлен"))?;
        entry.digest = package.inspect(&self.trusted()).digest;
        self.save_registry(&registry)
    }

    /// A file of an installed package that may run (enabled, unchanged since installation).
    pub fn package_file(&self, id: &str, path: &str) -> Result<Vec<u8>, String> {
        let entry = self
            .registry()
            .packages
            .get(id)
            .cloned()
            .ok_or_else(|| format!("Пакет {id} не установлен"))?;
        let package = read_archive(&read_package_file(&self.archive_path(id))?)?;
        if !entry.enabled || package.inspect(&self.trusted()).digest != entry.digest {
            return Err(format!("Пакет {id} выключен или изменён"));
        }
        package
            .files
            .get(path)
            .cloned()
            .ok_or_else(|| format!("{id}: нет файла {path}"))
    }

    /// An installed package as it is on disk now (verified again).
    pub fn installed(&self, id: &str) -> Result<InstalledPackage, String> {
        self.load(id)
    }

    fn load(&self, id: &str) -> Result<InstalledPackage, String> {
        let registry = self.registry();
        let entry = registry
            .packages
            .get(id)
            .ok_or_else(|| format!("Пакет {id} не установлен"))?;
        let package = read_archive(&read_package_file(&self.archive_path(id))?)?;
        let inspection = package.inspect(&self.trusted());
        let tampered = inspection.digest != entry.digest || package.manifest.id != id;
        let mut files = BTreeMap::new();
        let mut assets = BTreeMap::new();
        for (path, bytes) in &package.files {
            let extension = path.rsplit('.').next().unwrap_or_default();
            match extension {
                "json" | "css" | "md" | "txt" | "js" => {
                    if let Ok(text) = String::from_utf8(bytes.clone()) {
                        files.insert(path.clone(), text);
                    }
                }
                "svg" | "png" | "jpg" | "jpeg" | "webp" | "gif" => {
                    let mime = match extension {
                        "svg" => "image/svg+xml".to_string(),
                        "jpg" | "jpeg" => "image/jpeg".to_string(),
                        other => format!("image/{other}"),
                    };
                    assets.insert(
                        path.clone(),
                        format!("data:{mime};base64,{}", BASE64.encode(bytes)),
                    );
                }
                _ => {}
            }
        }
        let mut errors = inspection.errors;
        errors.extend(compatibility(&package.manifest));
        Ok(InstalledPackage {
            manifest: package.manifest,
            enabled: entry.enabled,
            signature: inspection.signature,
            tampered,
            errors,
            files,
            assets,
        })
    }

    /// Every installed package; a package that cannot be read is reported, not skipped silently.
    pub fn list(&self) -> Vec<Listed> {
        self.registry()
            .packages
            .keys()
            .map(|id| match self.load(id) {
                Ok(package) => Listed::Ok(Box::new(package)),
                Err(error) => Listed::Broken {
                    id: id.clone(),
                    error,
                },
            })
            .collect()
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut file = atomic_write_file::AtomicWriteFile::open(path)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    file.write_all(bytes)
        .map_err(|error| format!("{}: {error}", path.display()))?;
    file.commit()
        .map_err(|error| format!("{}: {error}", path.display()))
}

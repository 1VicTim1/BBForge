//! `manifest.json` of a plugin or theme package.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::sync::OnceLock;

pub const MANIFEST_FILE: &str = "manifest.json";
pub const MANIFEST_VERSION: u32 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PackageKind {
    Plugin,
    Theme,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub manifest_version: u32,
    #[serde(rename = "type")]
    pub kind: PackageKind,
    /// Reverse-domain style id: `author.name`, lowercase.
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Required BBForge version, e.g. `">=0.4.0"`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<String>,
    /// Everything the package may touch; contributions without a permission are ignored.
    #[serde(default)]
    pub permissions: Vec<String>,
    /// Other packages this one builds on: id → version requirement.
    #[serde(default)]
    pub dependencies: BTreeMap<String, String>,
    #[serde(default)]
    pub contributes: Map<String, Value>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Permission {
    pub id: String,
    pub title: String,
    pub description: String,
    pub risk: String,
}

/// The permissions BBForge knows (`permissions.json`, shared with the interface).
pub fn known_permissions() -> &'static [Permission] {
    static KNOWN: OnceLock<Vec<Permission>> = OnceLock::new();
    KNOWN.get_or_init(|| {
        serde_json::from_str(include_str!("../permissions.json"))
            .expect("permissions.json is valid")
    })
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

impl Report {
    pub fn is_ok(&self) -> bool {
        self.errors.is_empty()
    }
}

pub fn valid_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split('.').collect();
    id.len() <= 64
        && parts.len() >= 2
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
                && part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        })
}

/// Which permission each kind of contribution needs.
pub fn required_permissions(contributes: &Map<String, Value>) -> Vec<(String, &'static str)> {
    let mut needed = Vec::new();
    for (key, value) in contributes {
        let permission = match key.as_str() {
            "profiles" => Some("profiles"),
            "themes" => Some("themes"),
            "styles" => Some("styles"),
            "commands" => Some("commands"),
            "slots" => Some("ui.slots"),
            "converters" => Some("converters"),
            _ => None,
        };
        if let Some(permission) = permission {
            needed.push((key.clone(), permission));
        }
        if key == "ui"
            && let Some(patches) = value.as_array()
        {
            for patch in patches {
                let op = patch.get("op").and_then(Value::as_str).unwrap_or_default();
                let permission = match op {
                    "add" => "ui.add",
                    "remove" => "ui.remove",
                    _ => "ui.modify",
                };
                needed.push((format!("ui[{op}]"), permission));
            }
        }
    }
    needed
}

impl Manifest {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(bytes).map_err(|error| format!("manifest.json: {error}"))
    }

    /// Checks the manifest; `has_file` tells whether a path exists in the package.
    pub fn validate(&self, has_file: impl Fn(&str) -> bool) -> Report {
        let mut report = Report::default();
        if self.manifest_version != MANIFEST_VERSION {
            report.errors.push(format!(
                "manifestVersion должен быть {MANIFEST_VERSION}, указан {}",
                self.manifest_version
            ));
        }
        if !valid_id(&self.id) {
            report.errors.push(format!(
                "id «{}»: нужен формат автор.имя (строчные латинские буквы, цифры, дефис)",
                self.id
            ));
        }
        if self.name.trim().is_empty() || self.name.chars().count() > 80 {
            report.errors.push("name: от 1 до 80 символов".to_string());
        }
        if semver::Version::parse(&self.version).is_err() {
            report.errors.push(format!(
                "version «{}» — не semver (например 1.0.0)",
                self.version
            ));
        }
        if let Some(engine) = &self.engine
            && semver::VersionReq::parse(engine).is_err()
        {
            report
                .errors
                .push(format!("engine «{engine}» — неверное требование версии"));
        }
        for (id, requirement) in &self.dependencies {
            if !valid_id(id) {
                report
                    .errors
                    .push(format!("dependencies: неверный id «{id}»"));
            }
            if semver::VersionReq::parse(requirement).is_err() {
                report.errors.push(format!(
                    "dependencies.{id}: неверное требование версии «{requirement}»"
                ));
            }
        }
        let known = known_permissions();
        for permission in &self.permissions {
            if !known.iter().any(|item| &item.id == permission) {
                report.warnings.push(format!(
                    "неизвестное разрешение «{permission}» — BBForge его проигнорирует"
                ));
            }
        }
        for (what, permission) in required_permissions(&self.contributes) {
            if !self.permissions.iter().any(|item| item == permission) {
                report.warnings.push(format!(
                    "contributes.{what} требует разрешения «{permission}», без него вклад будет проигнорирован"
                ));
            }
        }
        for key in ["profiles", "themes", "styles"] {
            if let Some(items) = self.contributes.get(key).and_then(Value::as_array) {
                for item in items {
                    if let Some(path) = item.as_str() {
                        if !has_file(path) {
                            report
                                .errors
                                .push(format!("contributes.{key}: нет файла «{path}»"));
                        }
                    } else if !item.is_object() {
                        report.errors.push(format!(
                            "contributes.{key}: элемент должен быть путём к файлу или объектом"
                        ));
                    }
                }
            }
        }
        if self.kind == PackageKind::Theme && !self.contributes.contains_key("themes") {
            report
                .warnings
                .push("пакет типа theme не добавляет ни одной темы (contributes.themes)".into());
        }
        report
    }
}

//! Forum profiles: which tags a forum knows and how each of them behaves.
//!
//! A tag either behaves as one of the built-in tags (`as`, e.g. `[hide]` works as `spoiler`) or
//! is a plain tag described only by its role. The linter, the lexer and the parser read the
//! profile instead of fixed tag lists, so a plugin can add a forum without touching the code.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Built-in behaviours a profile tag can take over with `as`.
pub const BUILTIN_TAGS: &[&str] = &[
    "b",
    "i",
    "u",
    "s",
    "sub",
    "sup",
    "size",
    "color",
    "background",
    "font",
    "url",
    "left",
    "center",
    "right",
    "img",
    "attachment",
    "spoiler",
    "quote",
    "code",
    "list",
    "*",
];

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueRule {
    /// The value is ignored if present.
    #[default]
    None,
    Optional,
    Required,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueFormat {
    Color,
    Url,
    Size,
    Font,
    Text,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSpec {
    pub name: String,
    /// Built-in behaviour; defaults to the name when the name is a built-in tag.
    #[serde(default, rename = "as", skip_serializing_if = "Option::is_none")]
    pub behaves_as: Option<String>,
    #[serde(default)]
    pub value: ValueRule,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_format: Option<ValueFormat>,
    /// Warn when the tag wraps only whitespace.
    #[serde(default)]
    pub blank_check: bool,
    /// Content is literal text up to the closing tag (like `[code]`).
    #[serde(default)]
    pub raw: bool,
    /// The tag has no closing pair (like `[attachment=1]`).
    #[serde(default)]
    pub leaf: bool,
}

impl TagSpec {
    /// The built-in behaviour of this tag, if any.
    pub fn builtin(&self) -> Option<&str> {
        match &self.behaves_as {
            Some(name) => BUILTIN_TAGS
                .contains(&name.as_str())
                .then_some(name.as_str()),
            None => BUILTIN_TAGS
                .contains(&self.name.as_str())
                .then_some(self.name.as_str()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagProfile {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub tags: Vec<TagSpec>,
}

/// A profile prepared for lookups: lowercase names, behaviour flags resolved.
#[derive(Clone, Debug)]
pub struct Profile {
    tags: HashMap<String, TagSpec>,
}

impl Profile {
    pub fn new(profile: &TagProfile) -> Self {
        let mut tags = HashMap::new();
        for spec in &profile.tags {
            let mut spec = spec.clone();
            spec.name = spec.name.trim().to_ascii_lowercase();
            if spec.name.is_empty() {
                continue;
            }
            match spec.builtin() {
                Some("code") => spec.raw = true,
                Some("attachment") => spec.leaf = true,
                Some("color" | "background") if spec.value_format.is_none() => {
                    spec.value_format = Some(ValueFormat::Color);
                }
                _ => {}
            }
            tags.insert(spec.name.clone(), spec);
        }
        Self { tags }
    }

    /// The 4PDA profile shipped with BBForge.
    pub fn default_profile() -> &'static Profile {
        static DEFAULT: OnceLock<Profile> = OnceLock::new();
        DEFAULT.get_or_init(|| Profile::new(default_tag_profile()))
    }

    pub fn tag(&self, name: &str) -> Option<&TagSpec> {
        self.tags.get(name)
    }

    pub fn is_known(&self, name: &str) -> bool {
        self.tags.contains_key(name)
    }

    /// The built-in behaviour of the tag with this name.
    pub fn builtin(&self, name: &str) -> Option<&str> {
        self.tags.get(name).and_then(TagSpec::builtin)
    }

    pub fn is_raw(&self, name: &str) -> bool {
        self.tags.get(name).is_some_and(|spec| spec.raw)
    }

    pub fn is_leaf(&self, name: &str) -> bool {
        self.tags.get(name).is_some_and(|spec| spec.leaf)
    }

    pub fn blank_checked(&self, name: &str) -> bool {
        self.tags.get(name).is_some_and(|spec| spec.blank_check)
    }
}

/// The 4PDA profile as data (`profiles/4pda.json`, shared with the interface).
pub fn default_tag_profile() -> &'static TagProfile {
    static DEFAULT: OnceLock<TagProfile> = OnceLock::new();
    DEFAULT.get_or_init(|| {
        serde_json::from_str(include_str!("../profiles/4pda.json"))
            .expect("profiles/4pda.json is a valid profile")
    })
}

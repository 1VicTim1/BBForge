//! Spell checking with Hunspell dictionaries that come from plugins (`contributes.dictionaries`),
//! plus the user's own words in `<app data>/user-dictionary.txt`. BBForge itself ships no
//! dictionary: each language is a package of its own.
//!
//! A word is checked against the dictionaries of its alphabet (taken from the dictionary's own
//! words): Cyrillic words against Russian, Ukrainian…, Latin ones against English, German…
//! It is spelt correctly when any of them knows it.

use spellbook::Dictionary;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Script {
    Latin,
    Cyrillic,
    Greek,
    Other,
}

fn script_of(c: char) -> Option<Script> {
    if !c.is_alphabetic() {
        return None;
    }
    Some(match c as u32 {
        0x41..=0x5A | 0x61..=0x7A | 0xC0..=0x24F | 0x1E00..=0x1EFF => Script::Latin,
        0x400..=0x52F | 0x1C80..=0x1C8F | 0x2DE0..=0x2DFF | 0xA640..=0xA69F => Script::Cyrillic,
        0x370..=0x3FF | 0x1F00..=0x1FFF => Script::Greek,
        _ => Script::Other,
    })
}

/// The alphabet of a word; None for mixed scripts ("Wi-Fi-роутер") or no letters.
fn word_script(word: &str) -> Option<Script> {
    let mut found = None;
    for script in word.chars().filter_map(script_of) {
        match found {
            None => found = Some(script),
            Some(previous) if previous != script => return None,
            _ => {}
        }
    }
    found
}

/// The alphabet most words of a .dic file are written in.
fn dictionary_script(dic: &str) -> Script {
    let mut counts = BTreeMap::new();
    for line in dic.lines().skip(1).take(5000) {
        let word = line.split('/').next().unwrap_or_default();
        if let Some(script) = word_script(word) {
            *counts.entry(script).or_insert(0usize) += 1;
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(script, _)| script)
        .unwrap_or(Script::Other)
}

/// Words not worth checking: short, with digits, abbreviations (all capitals) and names with a
/// capital inside (BBCode, YouTube, iPhone).
fn skipped(word: &str) -> bool {
    word.chars().count() < 2
        || word.chars().any(|c| c.is_ascii_digit())
        || word.chars().all(|c| !c.is_lowercase())
        || word.chars().skip(1).any(char::is_uppercase)
}

/// One dictionary of a plugin, as the interface asks for it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionarySource {
    pub plugin: String,
    pub language: String,
    pub aff: String,
    pub dic: String,
    /// Version of the package: an updated package is loaded again.
    #[serde(default)]
    pub version: String,
}

struct Loaded {
    source: DictionarySource,
    script: Script,
    dictionary: Arc<Dictionary>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryState {
    pub plugin: String,
    pub language: String,
    pub error: Option<String>,
}

pub struct Speller {
    file: PathBuf,
    user: Mutex<BTreeSet<String>>,
    dictionaries: RwLock<Vec<Loaded>>,
}

impl Speller {
    pub fn new(file: PathBuf) -> Self {
        let user = std::fs::read_to_string(&file)
            .map(|text| {
                text.lines()
                    .map(|line| line.trim().to_lowercase())
                    .filter(|line| !line.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        Self {
            file,
            user: Mutex::new(user),
            dictionaries: RwLock::new(Vec::new()),
        }
    }

    pub fn file(&self) -> &Path {
        &self.file
    }

    /// Uses exactly these dictionaries from now on; ones already loaded are kept, new ones are
    /// read with `read(plugin, path)` (the file of an installed package) and parsed.
    pub fn configure(
        &self,
        sources: Vec<DictionarySource>,
        read: impl Fn(&str, &str) -> Result<Vec<u8>, String>,
    ) -> Vec<DictionaryState> {
        let mut states = Vec::new();
        let mut next = Vec::new();
        let mut current = std::mem::take(&mut *self.dictionaries.write().expect("dictionaries"));
        for source in sources {
            if let Some(position) = current.iter().position(|item| item.source == source) {
                next.push(current.swap_remove(position));
                states.push(DictionaryState {
                    plugin: source.plugin,
                    language: source.language,
                    error: None,
                });
                continue;
            }
            let loaded = (|| {
                let text = |path: &str| {
                    String::from_utf8(read(&source.plugin, path)?)
                        .map_err(|_| format!("{path}: словарь должен быть в UTF-8"))
                };
                let (aff, dic) = (text(&source.aff)?, text(&source.dic)?);
                let dictionary =
                    Dictionary::new(&aff, &dic).map_err(|error| format!("словарь: {error}"))?;
                Ok::<_, String>(Loaded {
                    script: dictionary_script(&dic),
                    dictionary: Arc::new(dictionary),
                    source: source.clone(),
                })
            })();
            states.push(DictionaryState {
                plugin: source.plugin.clone(),
                language: source.language.clone(),
                error: loaded.as_ref().err().cloned(),
            });
            if let Ok(loaded) = loaded {
                next.push(loaded);
            }
        }
        *self.dictionaries.write().expect("dictionaries") = next;
        states
    }

    fn for_word(&self, word: &str) -> Vec<Arc<Dictionary>> {
        let Some(script) = word_script(word) else {
            return Vec::new();
        };
        self.dictionaries
            .read()
            .expect("dictionaries")
            .iter()
            .filter(|item| item.script == script)
            .map(|item| Arc::clone(&item.dictionary))
            .collect()
    }

    /// For each word: whether it is spelt correctly (or not checked: no dictionary for it).
    pub fn check(&self, words: &[String]) -> Vec<bool> {
        let user = self.user.lock().expect("user dictionary");
        words
            .iter()
            .map(|word| {
                if skipped(word) || user.contains(&word.to_lowercase()) {
                    return true;
                }
                let dictionaries = self.for_word(word);
                dictionaries.is_empty() || dictionaries.iter().any(|item| item.check(word))
            })
            .collect()
    }

    pub fn suggest(&self, word: &str) -> Vec<String> {
        let mut suggestions = Vec::new();
        for dictionary in self.for_word(word) {
            let mut found = Vec::new();
            dictionary.suggest(word, &mut found);
            for item in found {
                if !suggestions.contains(&item) {
                    suggestions.push(item);
                }
            }
        }
        suggestions.truncate(7);
        suggestions
    }

    /// Adds a word to the user's dictionary (kept between runs).
    pub fn add(&self, word: &str) -> Result<(), String> {
        let word = word.trim().to_lowercase();
        if word.is_empty() || word.len() > 100 || word.contains(char::is_whitespace) {
            return Err("Неверное слово".into());
        }
        let mut user = self.user.lock().expect("user dictionary");
        user.insert(word);
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
        }
        let text: String = user.iter().map(|item| format!("{item}\n")).collect();
        std::fs::write(&self.file, text)
            .map_err(|error| format!("{}: {error}", self.file.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AFF: &str = "SET UTF-8\n";

    fn speller(dictionaries: &[(&str, &str)]) -> Speller {
        let dir = std::env::temp_dir().join(format!("bbforge-spell-{}", std::process::id()));
        let speller = Speller::new(dir.join("user.txt"));
        let sources = dictionaries
            .iter()
            .map(|(language, _)| DictionarySource {
                plugin: "test.dict".into(),
                language: (*language).into(),
                aff: format!("{language}.aff"),
                dic: format!("{language}.dic"),
                version: "1.0.0".into(),
            })
            .collect();
        let states = speller.configure(sources, |_, path| {
            let language = path.split('.').next().unwrap();
            let words = dictionaries
                .iter()
                .find(|(name, _)| *name == language)
                .unwrap()
                .1;
            Ok(if path.ends_with(".aff") {
                AFF.into()
            } else {
                words.into()
            })
        });
        assert!(states.iter().all(|state| state.error.is_none()));
        speller
    }

    #[test]
    fn words_go_to_the_dictionaries_of_their_alphabet() {
        let speller = speller(&[("ru", "2\nкот\nпривет\n"), ("en", "2\ncat\nhello\n")]);
        let words = [
            "привет",
            "превет",
            "hello",
            "helo",
            "Straße",
            "Wi-Fi-роутер",
        ]
        .map(String::from);
        assert_eq!(
            speller.check(&words),
            [true, false, true, false, false, true]
        );
        assert!(speller.suggest("превет").contains(&"привет".to_string()));
    }

    #[test]
    fn without_dictionaries_nothing_is_marked() {
        let speller = speller(&[]);
        assert_eq!(
            speller.check(&["превет".into(), "helo".into()]),
            [true, true]
        );
    }

    #[test]
    fn a_second_language_of_the_same_alphabet_counts_too() {
        let speller = speller(&[("ru", "1\nпривет\n"), ("uk", "1\nпривіт\n")]);
        assert_eq!(
            speller.check(&["привет".into(), "привіт".into(), "превіт".into()]),
            [true, true, false]
        );
    }
}

//! Spell checking: Russian and English Hunspell dictionaries (LibreOffice, see dictionaries/README.md)
//! built into BBForge, plus the user's own words in `<app data>/user-dictionary.txt`.
//! The language of a word follows its script: Cyrillic is Russian, Latin is English.

use spellbook::Dictionary;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

fn russian() -> &'static Option<Dictionary> {
    static DICTIONARY: OnceLock<Option<Dictionary>> = OnceLock::new();
    DICTIONARY.get_or_init(|| {
        Dictionary::new(
            include_str!("../dictionaries/ru_RU.aff"),
            include_str!("../dictionaries/ru_RU.dic"),
        )
        .ok()
    })
}

fn english() -> &'static Option<Dictionary> {
    static DICTIONARY: OnceLock<Option<Dictionary>> = OnceLock::new();
    DICTIONARY.get_or_init(|| {
        Dictionary::new(
            include_str!("../dictionaries/en_US.aff"),
            include_str!("../dictionaries/en_US.dic"),
        )
        .ok()
    })
}

fn dictionary_for(word: &str) -> Option<&'static Dictionary> {
    let cyrillic = word
        .chars()
        .any(|c| matches!(c, 'а'..='я' | 'А'..='Я' | 'ё' | 'Ё'));
    let latin = word.chars().any(|c| c.is_ascii_alphabetic());
    match (cyrillic, latin) {
        (true, false) => russian().as_ref(),
        (false, true) => english().as_ref(),
        // Mixed scripts ("Wi-Fi-роутер") or no letters: not checked.
        _ => None,
    }
}

/// Words not worth checking: short, with digits, abbreviations (all capitals) and names with a
/// capital inside (BBCode, YouTube, iPhone).
fn skipped(word: &str) -> bool {
    word.chars().count() < 2
        || word.chars().any(|c| c.is_ascii_digit())
        || word.chars().all(|c| !c.is_lowercase())
        || word.chars().skip(1).any(char::is_uppercase)
}

/// Loads both dictionaries (call from a background thread at start).
pub fn preload() {
    let _ = russian();
    let _ = english();
}

pub struct Speller {
    file: PathBuf,
    user: Mutex<BTreeSet<String>>,
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
        }
    }

    pub fn file(&self) -> &Path {
        &self.file
    }

    /// For each word: whether it is spelt correctly (or not checked at all).
    pub fn check(&self, words: &[String]) -> Vec<bool> {
        let user = self.user.lock().expect("user dictionary");
        words
            .iter()
            .map(|word| {
                if skipped(word) || user.contains(&word.to_lowercase()) {
                    return true;
                }
                dictionary_for(word).is_none_or(|dictionary| dictionary.check(word))
            })
            .collect()
    }

    pub fn suggest(&self, word: &str) -> Vec<String> {
        let Some(dictionary) = dictionary_for(word) else {
            return Vec::new();
        };
        let mut suggestions = Vec::new();
        dictionary.suggest(word, &mut suggestions);
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

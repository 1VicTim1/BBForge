use bbforge_app::spell::{DictionarySource, Speller};

/// A Russian and an English dictionary, as two plugins would give them.
fn configured(speller: &Speller) {
    let sources = ["ru", "en"]
        .map(|language| DictionarySource {
            plugin: format!("test.dictionary-{language}"),
            language: language.into(),
            aff: "words.aff".into(),
            dic: "words.dic".into(),
            version: String::new(),
        })
        .to_vec();
    let states = speller.configure(sources, |plugin, path| {
        Ok(match (plugin.ends_with("ru"), path.ends_with(".aff")) {
            (_, true) => {
                "SET UTF-8\nTRY оеаинтсрвлкмдпуяыьгзбчйхжшюцщэфъёabcdefghijklmnopqrstuvwxyz\n"
                    .into()
            }
            (true, false) => "3\nпрограмма\nредактор\nя\n".into(),
            (false, false) => "2\neditor\nprogram\n".into(),
        })
    });
    assert!(
        states.iter().all(|state| state.error.is_none()),
        "{states:?}"
    );
}

#[test]
fn checks_russian_and_english_and_learns_words() {
    let temp = tempfile::tempdir().unwrap();
    let speller = Speller::new(temp.path().join("user-dictionary.txt"));
    configured(&speller);
    let words = [
        "программа",
        "праграмма",
        "editor",
        "edtor",
        "BBCode",
        "4PDA",
        "Wi-Fi-роутер",
        "я",
    ]
    .map(String::from);
    assert_eq!(
        speller.check(&words),
        [true, false, true, false, true, true, true, true]
    );
    assert!(
        speller
            .suggest("праграмма")
            .iter()
            .any(|item| item == "программа")
    );
    assert!(speller.suggest("edtor").iter().any(|item| item == "editor"));

    speller.add("Праграмма").unwrap();
    assert_eq!(speller.check(&["праграмма".to_string()]), [true]);
    // The word stays after a restart.
    let again = Speller::new(temp.path().join("user-dictionary.txt"));
    configured(&again);
    assert_eq!(again.check(&["праграмма".to_string()]), [true]);
}

#[test]
fn a_broken_dictionary_is_reported_and_the_rest_still_work() {
    let temp = tempfile::tempdir().unwrap();
    let speller = Speller::new(temp.path().join("user-dictionary.txt"));
    let source = |plugin: &str| DictionarySource {
        plugin: plugin.into(),
        language: "ru".into(),
        aff: "a.aff".into(),
        dic: "a.dic".into(),
        version: String::new(),
    };
    let states = speller.configure(
        vec![source("test.broken"), source("test.good")],
        |plugin, path| {
            if plugin == "test.broken" {
                return Err(format!("нет файла {path}"));
            }
            Ok(if path.ends_with(".aff") {
                b"SET UTF-8\n".to_vec()
            } else {
                "1\nпривет\n".as_bytes().to_vec()
            })
        },
    );
    assert!(states[0].error.is_some() && states[1].error.is_none());
    assert_eq!(
        speller.check(&["привет".into(), "превед".into()]),
        [true, false]
    );
}

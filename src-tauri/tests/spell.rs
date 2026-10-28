use bbforge_app::spell::Speller;

#[test]
fn checks_russian_and_english_and_learns_words() {
    let temp = tempfile::tempdir().unwrap();
    let speller = Speller::new(temp.path().join("user-dictionary.txt"));
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
    assert_eq!(
        Speller::new(temp.path().join("user-dictionary.txt")).check(&["праграмма".to_string()]),
        [true]
    );
}

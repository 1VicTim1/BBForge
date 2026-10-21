use bbcode_core::{DiagnosticCode, Severity, parse};

#[test]
fn reports_structure_with_one_based_coordinates() {
    let analysis = parse("строка\n😀[b]текст");
    let diagnostic = analysis
        .diagnostics
        .iter()
        .find(|item| item.code == DiagnosticCode::UnclosedTag)
        .unwrap();

    assert_eq!(diagnostic.line, 2);
    assert_eq!(diagnostic.column, 2);
    assert_eq!(diagnostic.span.start, 17);
}

#[test]
fn warns_about_unknown_tags_and_empty_parameters() {
    let analysis = parse("[mystery]x[/mystery][color=]y[/color][size]z[/size]");

    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::UnknownTag
                && item.severity == Severity::Warning)
    );
    assert_eq!(
        analysis
            .diagnostics
            .iter()
            .filter(|item| item.code == DiagnosticCode::MissingParameter)
            .count(),
        2
    );
}

#[test]
fn permits_url_with_address_in_content() {
    let analysis = parse("[url]https://4pda.to[/url]");

    assert!(
        !analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::MissingParameter)
    );
}

#[test]
fn warns_about_duplicate_links() {
    let analysis = parse("[url=https://4pda.to]один[/url][url]https://4pda.to[/url]");

    assert_eq!(
        analysis
            .diagnostics
            .iter()
            .filter(|item| item.code == DiagnosticCode::DuplicateLink)
            .count(),
        1
    );
}

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

#[test]
fn reports_html_escaped_bbcode_tags_as_info() {
    let analysis = parse("[color=Blue]&#91;url=\"https://4pda.to\"&#93;QMS[/color]");
    let diagnostic = analysis
        .diagnostics
        .iter()
        .find(|item| item.code == DiagnosticCode::EscapedBbcodeTag)
        .expect("escaped BBCode must not silently render as text");

    assert_eq!(diagnostic.severity, Severity::Info);
    assert_eq!(
        &"[color=Blue]&#91;url=\"https://4pda.to\"&#93;QMS[/color]"
            [diagnostic.span.start..diagnostic.span.end],
        "&#91;url=\"https://4pda.to\"&#93;"
    );
}

#[test]
fn reports_invalid_colours_and_empty_tags() {
    let codes = |source: &str| parse(source).diagnostics.into_iter().map(|item| item.code).collect::<Vec<_>>();
    assert_eq!(codes("[color=AAAAAA]x[/color]"), vec![DiagnosticCode::InvalidColor]);
    assert_eq!(codes("[color=#AAAAAAAAAAAA]x[/color]"), vec![DiagnosticCode::InvalidColor]);
    assert_eq!(codes("[color=#zz0000]x[/color]"), vec![DiagnosticCode::InvalidColor]);
    assert!(codes("[color=#abc]x[/color][color=#A1B2C3]y[/color][color=royalblue]z[/color][color=red]w[/color]").is_empty());
    assert_eq!(codes("[color=red][/color]"), vec![DiagnosticCode::EmptyTag]);
    assert_eq!(codes("[b] [i][/i] [/b]"), vec![DiagnosticCode::EmptyTag]);
    assert!(codes("[spoiler=S][/spoiler]").is_empty());
}

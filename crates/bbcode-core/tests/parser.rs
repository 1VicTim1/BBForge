use bbcode_core::{DiagnosticCode, NodeKind, TokenKind, parse};

fn token_text(source: &str, start: usize, end: usize) -> &str {
    &source[start..end]
}

#[test]
fn reconstructs_source_exactly() {
    let source = include_str!("../../../fixtures/4pda.bbcode");
    let analysis = parse(source);
    let reconstructed: String = analysis
        .tokens
        .iter()
        .map(|token| token_text(source, token.span.start, token.span.end))
        .collect();

    assert_eq!(reconstructed, source);
    assert_eq!(analysis.tokens.first().unwrap().span.start, 0);
    assert_eq!(analysis.tokens.last().unwrap().span.end, source.len());
}

#[test]
fn exact_element_boundaries() {
    let source = "[spoiler=[b]😀[/b]]x[/spoiler]";
    let node = &parse(source).nodes[0];
    let value = serde_json::to_value(node).unwrap();
    let start = source.find('x').unwrap();
    assert_eq!(value["openingSpan"]["end"], start);
    assert_eq!(
        value["contentSpan"],
        serde_json::json!({"start": start, "end": start + 1})
    );
    assert_eq!(value["closingSpan"]["start"], start + 1);
    assert_eq!(value["wellFormed"], true);
}

#[test]
fn unclosed_parent_covers_content() {
    let source = "[b]hello[i]world";
    let node = &parse(source).nodes[0];
    assert_eq!(node.span.end, source.len());
    let value = serde_json::to_value(node).unwrap();
    assert_eq!(value["contentSpan"]["end"], source.len());
    assert_eq!(value["wellFormed"], false);
}

#[test]
fn crossed_nodes_are_not_well_formed() {
    let analysis = parse("[b][i]x[/b]");
    assert_eq!(
        serde_json::to_value(&analysis.nodes[0]).unwrap()["wellFormed"],
        false
    );
    assert_eq!(
        serde_json::to_value(&analysis.nodes[0].children[0]).unwrap()["wellFormed"],
        false
    );
    let list = parse("[list][*]a[*]b[/list]");
    assert_eq!(
        serde_json::to_value(&list.nodes[0].children[0]).unwrap()["wellFormed"],
        true
    );
}

#[test]
fn nested_formatted_spoiler_title() {
    let source = "[spoiler=[b][color=red]Важно![/color][/b]]Текст[/spoiler]";
    let analysis = parse(source);
    let spoiler = &analysis.nodes[0];

    assert_eq!(spoiler.kind, NodeKind::Element);
    assert_eq!(spoiler.name.as_deref(), Some("spoiler"));
    assert_eq!(
        spoiler.parameter.as_deref(),
        Some("[b][color=red]Важно![/color][/b]")
    );
    assert_eq!(spoiler.children.len(), 1);
}

#[test]
fn implicit_list_items() {
    let source = "[list][*]Первый[*]Второй[/list]";
    let analysis = parse(source);
    let list = &analysis.nodes[0];

    assert_eq!(list.name.as_deref(), Some("list"));
    assert_eq!(
        list.children
            .iter()
            .filter(|node| node.name.as_deref() == Some("*"))
            .count(),
        2
    );
    assert!(analysis.diagnostics.is_empty());
}

#[test]
fn code_is_literal() {
    let source = "[code][b]не тег[/b][/code]";
    let analysis = parse(source);
    let code = &analysis.nodes[0];

    assert_eq!(code.name.as_deref(), Some("code"));
    assert_eq!(code.children.len(), 1);
    assert_eq!(code.children[0].kind, NodeKind::Text);
    assert_eq!(
        &source[code.children[0].span.start..code.children[0].span.end],
        "[b]не тег[/b]"
    );
}

#[test]
fn attachment_is_leaf() {
    let source = "[attachment=35724925:shot.jpg]";
    let analysis = parse(source);

    assert_eq!(analysis.nodes[0].name.as_deref(), Some("attachment"));
    assert!(analysis.nodes[0].children.is_empty());
    assert!(analysis.diagnostics.is_empty());
}

#[test]
fn malformed_input_recovers() {
    let source = "до [b]жирный [i]курсив[/b] после";
    let analysis = parse(source);
    let reconstructed: String = analysis
        .tokens
        .iter()
        .map(|token| &source[token.span.start..token.span.end])
        .collect();

    assert_eq!(reconstructed, source);
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::CrossedClosingTag)
    );
    assert!(
        analysis
            .tokens
            .iter()
            .any(|token| token.kind == TokenKind::ClosingTag)
    );
}

#[test]
fn apostrophe_in_unquoted_parameter_does_not_swallow_later_tags() {
    let source = "[spoiler=What's new]hello[/spoiler][b]";
    let analysis = parse(source);

    assert!(
        analysis
            .tokens
            .iter()
            .any(|token| token.name.as_deref() == Some("spoiler"))
    );
    assert!(
        analysis
            .tokens
            .iter()
            .any(|token| token.name.as_deref() == Some("b"))
    );
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::UnclosedTag)
    );
}

#[test]
fn depth_limit_preserves_text() {
    let source = format!("{}текст{}", "[b]".repeat(300), "[/b]".repeat(300));
    let analysis = parse(&source);
    let reconstructed: String = analysis
        .tokens
        .iter()
        .map(|token| &source[token.span.start..token.span.end])
        .collect();

    assert_eq!(reconstructed, source);
    assert!(
        analysis
            .diagnostics
            .iter()
            .any(|item| item.code == DiagnosticCode::DepthLimit)
    );
}

#[test]
fn parses_one_mebibyte_with_one_hundred_levels_without_panicking() {
    let body = "текст ".repeat(96_000);
    let source = format!(
        "{}{}{}",
        "[spoiler]".repeat(100),
        body,
        "[/spoiler]".repeat(100)
    );
    assert!(source.len() >= 1024 * 1024);

    let analysis = parse(&source);

    assert_eq!(analysis.tokens.first().unwrap().span.start, 0);
    assert_eq!(analysis.tokens.last().unwrap().span.end, source.len());
}

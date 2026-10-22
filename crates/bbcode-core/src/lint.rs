use std::collections::HashSet;

use crate::{Diagnostic, DiagnosticCode, Node, NodeKind, Severity};

const KNOWN_TAGS: &[&str] = &[
    "b",
    "i",
    "u",
    "s",
    "size",
    "color",
    "font",
    "background",
    "url",
    "img",
    "spoiler",
    "list",
    "*",
    "quote",
    "code",
    "attachment",
    "left",
    "center",
    "right",
    "sub",
    "sup",
];
const VALUE_TAGS: &[&str] = &["size", "color", "font", "background"];

pub(crate) fn lint(source: &str, nodes: &[Node], diagnostics: &mut Vec<Diagnostic>) {
    let mut links = HashSet::new();
    visit(source, nodes, diagnostics, &mut links);
    escaped_tags(source, diagnostics);
}

fn escaped_tags(source: &str, diagnostics: &mut Vec<Diagnostic>) {
    let mut cursor = 0;
    while let Some(relative_start) = source[cursor..].find("&#91;") {
        let start = cursor + relative_start;
        let content_start = start + "&#91;".len();
        let Some(relative_end) = source[content_start..].find("&#93;") else {
            break;
        };
        let end = content_start + relative_end + "&#93;".len();
        let content = &source[content_start..content_start + relative_end];
        let name = content
            .strip_prefix('/')
            .unwrap_or(content)
            .split(['=', ' '])
            .next()
            .unwrap_or_default();
        if !name.is_empty()
            && name.chars().all(|character| {
                character.is_ascii_alphanumeric() || character == '*' || character == '-'
            })
        {
            diagnostics.push(Diagnostic {
                code: DiagnosticCode::EscapedBbcodeTag,
                severity: Severity::Warning,
                message: format!(
                    "Форум преобразовал нераспознанный BBCode в текст: [{content}]. Проверьте исходную вложенность тегов"
                ),
                span: crate::Span { start, end },
                line: 0,
                column: 0,
            });
        }
        cursor = end;
    }
}

fn visit(
    source: &str,
    nodes: &[Node],
    diagnostics: &mut Vec<Diagnostic>,
    links: &mut HashSet<String>,
) {
    for node in nodes {
        if node.kind != NodeKind::Element {
            continue;
        }
        let name = node.name.as_deref().unwrap_or_default();
        if !KNOWN_TAGS.contains(&name) {
            warning(
                diagnostics,
                DiagnosticCode::UnknownTag,
                format!("Неизвестный тег [{name}]"),
                node,
            );
        }
        if VALUE_TAGS.contains(&name) && node.parameter.as_deref().is_none_or(str::is_empty) {
            warning(
                diagnostics,
                DiagnosticCode::MissingParameter,
                format!("Тег [{name}] требует значение"),
                node,
            );
        }
        if name == "url" {
            let address = node
                .parameter
                .clone()
                .unwrap_or_else(|| text_content(source, &node.children));
            let address = address.trim();
            if address.is_empty() {
                warning(
                    diagnostics,
                    DiagnosticCode::MissingParameter,
                    "Ссылка не содержит адрес".into(),
                    node,
                );
            } else if !links.insert(address.to_owned()) {
                warning(
                    diagnostics,
                    DiagnosticCode::DuplicateLink,
                    format!("Ссылка {address} повторяется"),
                    node,
                );
            }
        }
        visit(source, &node.children, diagnostics, links);
    }
}

fn text_content(source: &str, nodes: &[Node]) -> String {
    let mut result = String::new();
    for node in nodes {
        if node.kind == NodeKind::Text {
            result.push_str(&source[node.span.start..node.span.end]);
        } else {
            result.push_str(&text_content(source, &node.children));
        }
    }
    result
}

fn warning(diagnostics: &mut Vec<Diagnostic>, code: DiagnosticCode, message: String, node: &Node) {
    diagnostics.push(Diagnostic {
        code,
        severity: Severity::Warning,
        message,
        span: node.span,
        line: 0,
        column: 0,
    });
}

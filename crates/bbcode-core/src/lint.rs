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

use crate::{
    Analysis, Diagnostic, DiagnosticCode, Node, NodeKind, Severity, Span, Token, TokenKind,
    lexer::lex, lint::lint,
};

const MAX_DEPTH: usize = 256;

pub fn parse(source: &str) -> Analysis {
    let tokens = lex(source);
    let mut roots = Vec::new();
    let mut stack: Vec<Node> = Vec::new();
    let mut diagnostics = Vec::new();
    for token in &tokens {
        match token.kind {
            TokenKind::Text => append(&mut roots, &mut stack, text_node(token.span)),
            TokenKind::LeafTag => append(&mut roots, &mut stack, element_node(token)),
            TokenKind::OpeningTag if token.name.as_deref() == Some("*") => {
                if stack.last().and_then(|node| node.name.as_deref()) == Some("*") {
                    finish_top(&mut roots, &mut stack, token.span.start, true);
                }
                stack.push(element_node(token));
            }
            TokenKind::OpeningTag => {
                if stack.len() >= MAX_DEPTH {
                    diagnostics.push(Diagnostic {
                        code: DiagnosticCode::DepthLimit,
                        severity: Severity::Error,
                        message: format!("Максимальная глубина BBCode — {MAX_DEPTH}"),
                        span: token.span,
                        line: 0,
                        column: 0,
                    });
                    append(&mut roots, &mut stack, text_node(token.span));
                } else {
                    stack.push(element_node(token));
                }
            }
            TokenKind::ClosingTag => close_tag(token, &mut roots, &mut stack, &mut diagnostics),
        }
    }
    while let Some(mut node) = stack.pop() {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::UnclosedTag,
            severity: Severity::Error,
            message: format!("Тег [{}] не закрыт", node.name.as_deref().unwrap_or("")),
            span: node.span,
            line: 0,
            column: 0,
        });
        node.span.end = source.len();
        node.content_span.end = source.len();
        node.well_formed = false;
        append(&mut roots, &mut stack, node);
    }
    lint(source, &roots, &mut diagnostics);
    for diagnostic in &mut diagnostics {
        (diagnostic.line, diagnostic.column) = line_column(source, diagnostic.span.start);
    }
    Analysis {
        tokens,
        nodes: roots,
        diagnostics,
    }
}

fn close_tag(
    token: &Token,
    roots: &mut Vec<Node>,
    stack: &mut Vec<Node>,
    diagnostics: &mut Vec<Diagnostic>,
) {
    let name = token.name.as_deref().unwrap_or_default();
    if name == "list" && stack.last().and_then(|node| node.name.as_deref()) == Some("*") {
        finish_top(roots, stack, token.span.start, true);
    }
    let Some(index) = stack
        .iter()
        .rposition(|node| node.name.as_deref() == Some(name))
    else {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::UnexpectedClosingTag,
            severity: Severity::Error,
            message: format!("Закрывающий тег [/{name}] не имеет открывающего"),
            span: token.span,
            line: 0,
            column: 0,
        });
        append(roots, stack, text_node(token.span));
        return;
    };
    let crossed = index + 1 != stack.len();
    if crossed {
        diagnostics.push(Diagnostic {
            code: DiagnosticCode::CrossedClosingTag,
            severity: Severity::Error,
            message: format!("Тег [/{name}] пересекает вложенные теги"),
            span: token.span,
            line: 0,
            column: 0,
        });
    }
    while stack.len() > index + 1 {
        finish_top(roots, stack, token.span.start, false);
    }
    let mut node = stack.pop().expect("matching stack entry exists");
    node.span.end = token.span.end;
    node.content_span.end = token.span.start;
    node.closing_span = Some(token.span);
    node.well_formed = !crossed && node.children.iter().all(|child| child.well_formed);
    append(roots, stack, node);
}

fn line_column(source: &str, byte_offset: usize) -> (usize, usize) {
    let prefix = &source[..byte_offset.min(source.len())];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let column = prefix
        .rsplit_once('\n')
        .map_or(prefix, |(_, tail)| tail)
        .chars()
        .count()
        + 1;
    (line, column)
}

fn finish_top(roots: &mut Vec<Node>, stack: &mut Vec<Node>, end: usize, implicit: bool) {
    if let Some(mut node) = stack.pop() {
        node.span.end = end;
        node.content_span.end = end;
        node.well_formed = implicit && node.children.iter().all(|child| child.well_formed);
        append(roots, stack, node);
    }
}

fn append(roots: &mut Vec<Node>, stack: &mut [Node], node: Node) {
    if let Some(parent) = stack.last_mut() {
        parent.children.push(node);
    } else {
        roots.push(node);
    }
}

fn text_node(span: Span) -> Node {
    Node {
        kind: NodeKind::Text,
        span,
        name: None,
        parameter: None,
        children: Vec::new(),
        opening_span: None,
        content_span: span,
        closing_span: None,
        well_formed: true,
    }
}

fn element_node(token: &Token) -> Node {
    Node {
        kind: NodeKind::Element,
        span: token.span,
        name: token.name.clone(),
        parameter: token.parameter.clone(),
        children: Vec::new(),
        opening_span: Some(token.span),
        content_span: Span {
            start: token.span.end,
            end: token.span.end,
        },
        closing_span: None,
        well_formed: token.kind == TokenKind::LeafTag,
    }
}

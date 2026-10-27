use crate::{Span, Token, TokenKind, profile::Profile};

pub(crate) fn lex(source: &str, profile: &Profile) -> Vec<Token> {
    let mut tokens = Vec::new();
    let mut cursor = 0;
    while cursor < source.len() {
        let Some(relative) = source[cursor..].find('[') else {
            push_text(&mut tokens, cursor, source.len());
            break;
        };
        let start = cursor + relative;
        push_text(&mut tokens, cursor, start);
        let Some(end) = tag_end(source, start) else {
            push_text(&mut tokens, start, source.len());
            break;
        };
        let raw = &source[start + 1..end - 1];
        let Some((kind, name, parameter)) = tag_parts(raw, profile) else {
            push_text(&mut tokens, start, end);
            cursor = end;
            continue;
        };
        let raw_tag =
            (kind == TokenKind::OpeningTag && profile.is_raw(&name)).then(|| name.clone());
        tokens.push(Token {
            kind,
            span: Span { start, end },
            name: Some(name),
            parameter,
        });
        cursor = end;
        if let Some(raw_tag) = raw_tag {
            let closing = format!("[/{raw_tag}]");
            if let Some(relative_close) = find_ascii_case_insensitive(&source[cursor..], &closing) {
                let close_start = cursor + relative_close;
                push_text(&mut tokens, cursor, close_start);
                tokens.push(Token {
                    kind: TokenKind::ClosingTag,
                    span: Span {
                        start: close_start,
                        end: close_start + closing.len(),
                    },
                    name: Some(raw_tag),
                    parameter: None,
                });
                cursor = close_start + closing.len();
            } else {
                push_text(&mut tokens, cursor, source.len());
                break;
            }
        }
    }
    tokens
}

fn push_text(tokens: &mut Vec<Token>, start: usize, end: usize) {
    if start < end {
        tokens.push(Token {
            kind: TokenKind::Text,
            span: Span { start, end },
            name: None,
            parameter: None,
        });
    }
}

fn tag_end(source: &str, start: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    let mut nested = 0usize;
    let mut quote = None;
    let mut after_equals = false;
    let mut index = start + 1;
    while index < bytes.len() {
        let byte = bytes[index];
        if let Some(active) = quote {
            if byte == active {
                quote = None;
            }
        } else {
            match byte {
                b'=' => after_equals = true,
                b' ' | b'\t' if after_equals => {}
                b'\'' | b'"' if after_equals => {
                    quote = Some(byte);
                    after_equals = false;
                }
                b'[' => nested += 1,
                b']' if nested > 0 => nested -= 1,
                b']' => return Some(index + 1),
                _ => after_equals = false,
            }
        }
        index += 1;
    }
    None
}

fn tag_parts(raw: &str, profile: &Profile) -> Option<(TokenKind, String, Option<String>)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let (closing, body) = trimmed
        .strip_prefix('/')
        .map_or((false, trimmed), |body| (true, body));
    let (name, parameter) = body.split_once('=').map_or((body, None), |(name, value)| {
        let value = value.trim();
        let unquoted = if value.len() >= 2
            && ((value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\'')))
        {
            &value[1..value.len() - 1]
        } else {
            value
        };
        (name, Some(unquoted.to_owned()))
    });
    let name = name.trim();
    if name.is_empty()
        || !name.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '*' || character == '-'
        })
    {
        return None;
    }
    let name = name.to_ascii_lowercase();
    let kind = if closing {
        TokenKind::ClosingTag
    } else if profile.is_leaf(&name) {
        TokenKind::LeafTag
    } else {
        TokenKind::OpeningTag
    };
    Some((kind, name, parameter))
}

fn find_ascii_case_insensitive(haystack: &str, needle: &str) -> Option<usize> {
    haystack
        .as_bytes()
        .windows(needle.len())
        .position(|window| window.eq_ignore_ascii_case(needle.as_bytes()))
}

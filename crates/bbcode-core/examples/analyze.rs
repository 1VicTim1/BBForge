//! Analyses one JSON value per input line: a source string, or `{"source": …, "profile": …}`.
use bbcode_core::{Profile, TagProfile, parse, parse_with};
use std::io::{self, BufRead};

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum Request {
    Source(String),
    WithProfile {
        source: String,
        profile: Option<TagProfile>,
    },
}

fn main() {
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let request: Request = serde_json::from_str(&line).expect("JSON request");
        let analysis = match request {
            Request::Source(source)
            | Request::WithProfile {
                source,
                profile: None,
            } => parse(&source),
            Request::WithProfile {
                source,
                profile: Some(profile),
            } => parse_with(&source, &Profile::new(&profile)),
        };
        println!("{}", serde_json::to_string(&analysis).unwrap());
    }
}

use std::io::{self, BufRead};
fn main() {
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let source: String = serde_json::from_str(&line).expect("JSON source string");
        println!(
            "{}",
            serde_json::to_string(&bbcode_core::parse(&source)).unwrap()
        );
    }
}

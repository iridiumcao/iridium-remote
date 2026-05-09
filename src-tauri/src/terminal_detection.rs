use std::sync::OnceLock;

use regex::Regex;

const DETECTION_BUFFER_LIMIT: usize = 512;

pub fn append_recent_output(buffer: &mut String, chunk: &str) {
    buffer.push_str(chunk);

    if buffer.len() > DETECTION_BUFFER_LIMIT {
        let keep_from = buffer
            .char_indices()
            .nth_back(DETECTION_BUFFER_LIMIT - 1)
            .map(|(index, _)| index)
            .unwrap_or(0);
        buffer.drain(..keep_from);
    }
}

pub fn contains_password_prompt(buffer: &str) -> bool {
    normalize_for_inline_prompt(buffer).contains("password:")
}

pub fn contains_shell_prompt(buffer: &str) -> bool {
    shell_prompt_re().is_match(&strip_ansi(buffer))
}

pub fn detect_connection_error_message(buffer: &str) -> Option<String> {
    strip_ansi(buffer)
        .replace('\r', "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find_map(|line| {
            connection_error_re()
                .is_match(&line.to_ascii_lowercase())
                .then(|| line.to_string())
        })
}

fn normalize_for_inline_prompt(buffer: &str) -> String {
    strip_ansi(buffer)
        .replace('\r', "")
        .replace('\n', "")
        .to_ascii_lowercase()
}

fn strip_ansi(buffer: &str) -> String {
    ansi_escape_re().replace_all(buffer, "").into_owned()
}

fn ansi_escape_re() -> &'static Regex {
    static ANSI_ESCAPE_RE: OnceLock<Regex> = OnceLock::new();
    ANSI_ESCAPE_RE.get_or_init(|| {
        Regex::new(r"\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))").unwrap()
    })
}

fn shell_prompt_re() -> &'static Regex {
    static SHELL_PROMPT_RE: OnceLock<Regex> = OnceLock::new();
    SHELL_PROMPT_RE.get_or_init(|| {
        Regex::new(r"(?m)(?:^|[\r\n])[^\r\n]*(?:[\$#>%]|[❯➜➤❱›»λ])\s*$").unwrap()
    })
}

fn connection_error_re() -> &'static Regex {
    static CONNECTION_ERROR_RE: OnceLock<Regex> = OnceLock::new();
    CONNECTION_ERROR_RE.get_or_init(|| {
        Regex::new(
            r"(permission denied|could not resolve hostname|connection refused|connection timed out|operation timed out|no route to host|network is unreachable|host key verification failed|connection closed by remote host|connection reset by peer|too many authentication failures|kex_exchange_identification|no matching (host key type|key exchange method|cipher|mac)|ssh:)",
        )
        .unwrap()
    })
}

#[cfg(test)]
mod tests {
    use super::{
        append_recent_output, contains_password_prompt, contains_shell_prompt,
        detect_connection_error_message,
    };

    #[test]
    fn detects_password_prompt_across_split_chunks() {
        let mut recent_output = String::new();
        append_recent_output(&mut recent_output, "user@example.com's pass");
        append_recent_output(&mut recent_output, "word:");

        assert!(contains_password_prompt(&recent_output));
    }

    #[test]
    fn ignores_ansi_sequences_when_matching_prompts() {
        let mut recent_output = String::new();
        append_recent_output(&mut recent_output, "\u{1b}[31muser@example.com's pass");
        append_recent_output(&mut recent_output, "word:\u{1b}[0m");

        assert!(contains_password_prompt(&recent_output));
    }

    #[test]
    fn detects_shell_prompts_from_recent_output() {
        let mut recent_output = String::new();
        append_recent_output(&mut recent_output, "Last login: today\r\n");
        append_recent_output(&mut recent_output, "user@host:~$ ");

        assert!(contains_shell_prompt(&recent_output));
    }

    #[test]
    fn detects_themed_shell_prompts_with_ansi_sequences() {
        let mut recent_output = String::new();
        append_recent_output(&mut recent_output, "\u{1b}]0;user@host: ~\u{7}");
        append_recent_output(&mut recent_output, "\u{1b}[?2004h❯ ");

        assert!(contains_shell_prompt(&recent_output));
    }

    #[test]
    fn detects_connection_errors_from_ssh_output() {
        let mut recent_output = String::new();
        append_recent_output(
            &mut recent_output,
            "ssh: connect to host example.com port 22: Connection refused\r\n",
        );

        assert_eq!(
            detect_connection_error_message(&recent_output).as_deref(),
            Some("ssh: connect to host example.com port 22: Connection refused")
        );
    }
}

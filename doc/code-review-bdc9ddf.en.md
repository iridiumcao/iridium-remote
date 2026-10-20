# Latest Commit Review

- Review date: 2026-10-16 (Asia/Shanghai)
- Commit: `bdc9ddf5113c7a9985de7e8d325c14ce2bbc53a2`
- Parent: `711a37ae9897f7cf940cf4e4370cb41d17c69b5e`
- Subject: Potential fix for code scanning alert no. 37: Cleartext logging of sensitive information
- Scope: the complete commit diff, related session logging and error propagation, and application logging configuration.
- Chinese version: [中文审查报告](code-review-bdc9ddf.zh-CN.md)

## Assessment

The commit removes free-form messages from the `emit_status` debug log and preserves the frontend event payload. No functional regression or confirmed credential disclosure was found. This particular debug statement is already disabled by the application's default release logging level, so changing it has no effect on normal release-build logs.

The observations below concern pre-existing, conditional exposure risks. The working-tree changes reduce logged content as optional defensive hardening; the evidence does not establish that they are necessary to fix a credential leak in normal operation. The earlier P1/P2 ratings overstated the evidence and are corrected to P3. No direct logging of the saved SSH password was identified in the inspected session code.

## Findings and Fixes

### 1. [P3] Free-form errors can contain sensitive values — optional hardening applied

Locations in the reviewed commit: `src-tauri/src/session.rs:647–652`, with additional debug sinks at `560–564` and `604–609`.

`detect_connection_error_message` strips ANSI escapes and returns an entire matching terminal line. `handle_output` passes that line to `finish_session`, which stores it in `snapshot.message` and logs the message at `info` level. The application enables `Info` logging to a file in release builds (`src-tauri/src/lib.rs:614–632`). Ordinary errors such as connection refusal or authentication failure do not inherently contain a password or token. A credential exposure requires sensitive data to be present in the error text in the first place, and the resulting log to be read or shared beyond the intended audience. The SSH-failure and exit-classification debug logs also include this text.

For example, a pre-shell terminal line such as `ssh: diagnostic token=REVIEW_ONLY_MARKER` matches the detector and can be written to the transition log with the marker intact. This constructed example only shows that text can propagate to the log. It does not demonstrate that the application normally produces such an error, that a real credential was exposed, or that saved SSH passwords are automatically logged.

Applied hardening: remove message arguments from all three logging statements. Keep the session UUID and status where applicable. Detailed error messages still reach the terminal and the frontend status event, but diagnostic logs lose useful error details. This tradeoff should be assessed against the application's logging policy rather than treated as an urgent security requirement.

### 2. [P3] Debug previews can copy already-visible secrets — optional hardening applied

Location in the reviewed commit: `src-tauri/src/session.rs:511–520`; preview helper at `736–748`.

The first five output chunks per session are logged with a preview of up to 160 characters. The helper strips ANSI sequences, flattens newlines, and truncates text, but performs no secret redaction. If a real token appears within those previews while debug logging is enabled, it is copied to a plaintext log even when optional session recording is disabled. Debug builds write these logs to both the log directory and stdout. The application's default release configuration filters out these debug statements. No real secret-bearing output or resulting log disclosure was reproduced during review.

Applied hardening: retain only the chunk number and byte count. Remove the preview helper, its limit constant, and its now-unused import. Terminal display, output buffering, prompt detection, and optional encrypted recording continue to use the original data. This reduces accidental retention when using debug builds with sensitive sessions, at the cost of terminal-preview diagnostics.

## Other Changes

Restored the randomly generated session UUID to the safe `emit_status` log so concurrent sessions remain distinguishable without logging their messages. Added comments explaining why terminal content and status messages are omitted.

No dependencies or frontend contracts changed. Earlier review reports were preserved.

## Validation

Executed after the code fix:

```text
cargo test --manifest-path src-tauri/Cargo.toml --locked --offline
```

- Final run outside the sandbox: **38 passed, 0 failed, 1 ignored**. Binary tests and doc tests each ran zero tests successfully.
- The ignored test is `update::tests::github_release_https_smoke_test`, which explicitly requires direct GitHub HTTPS access.
- The initial sandbox run had 35 passes, three failures, and one ignored test. Two local HTTP tests could not send requests and the Windows credential test received access denied. All three passed when rerun outside the sandbox.
- Compilation emitted incremental-cache hard-link warnings and used file copies instead; these did not prevent the successful run.
- `git diff HEAD^ HEAD --check` and `git diff --check` passed.
- Source review confirmed that the affected diagnostic logs now omit terminal previews and free-form session messages; frontend event emission and message assignment remain intact.

## Limits

No desktop session or runtime log-capture integration test was performed. Frontend checks and cross-platform packaging were not run. GitHub code scanning was not rerun, so closure of alert no. 37 remains unverified.

This is a focused review, not a repository-wide privacy audit. Existing connection metadata logging and historical log files were not changed or removed. The code fix prevents future writes through the identified paths; it does not erase prior logs.

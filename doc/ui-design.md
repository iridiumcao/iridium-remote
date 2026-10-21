# UI Design Document

## Window structure

The main window uses a two-column layout:

- **Left sidebar:** product branding, workspace tabs, browser-only settings controls when needed, and the active workspace's navigator
- **Right workspace:** the active workspace surface (`Connections`, `History`, or `Logs` when session recording is enabled)

The window itself should not scroll. The sidebar scrolls independently, uses scrollbar styling that matches the active light or dark theme, and terminal scroll stays inside the xterm viewport.

```mermaid
flowchart LR
    A[Left sidebar] --> B[Connections]
    A --> C[History]
    A --> D[Optional Logs]
    B --> E[Terminal tabs and terminal surface]
    C --> F[Overview links, host list, charts, session details]
    D --> G[Log source list, file selection, decrypt/preview/export]
```

## Sidebar top area

The top of the left sidebar contains:

- app tagline
- app title

In desktop builds, Language and Theme are not shown here because they live in the top-level Settings menu. Browser-only fallback mode may keep inline controls under the branding block because there is no desktop application menu there.

## Application menu

### File

- New Connection
- Import
- Export
- Exit

### Help

- ❤️ Star on GitHub
- Report Issue
- Check for Updates...
- About

### Settings

- Language
  - English
  - 简体中文
  - 繁體中文
- Theme
  - Dark
  - Light
- Session Recording

Selecting external-link items opens the user’s browser. Selecting About opens a modal dialog. Selecting Check for Updates checks the latest GitHub release and shows an in-app status message; when a newer version exists, that message includes an actionable release download link. The status banner auto-dismisses after about 5 seconds with a smooth fade-out.

## Sidebar design

The sidebar contains these layers in order:

1. **Branding block**
   - app tagline and app title
2. **Workspace tabs**
   - `Connections`
   - `History`
   - `Logs` only when session recording is enabled
   - visually styled like a lightly stacked folder/tab strip rather than flat segmented buttons
3. **Browser-only settings controls**
   - shown only outside the desktop runtime
   - language selector
   - theme selector
4. **Workspace-specific sidebar content**
   - `Connections`: search field, display mode control, grouped connection list
   - `History`: date-range filters, overall-statistics links, host search, host list
   - `Logs`: recording-directory actions and log-source list

### Normal mode

- One card-like row per connection
- Name is visually dominant
- Host, user, and metadata remain visible
- Primary actions are easy to reach

### Compact mode

- One dense row per connection
- Fewer secondary details
- Better for large connection libraries
- `Connect` stays visible while `Edit`, `Copy`, and `Delete` move into a small popup menu opened from a `⋮` button
- Right-clicking a connection opens the same compact popup menu

### Context menus

- The default browser-like context menu is suppressed across the app shell
- Right-clicking the terminal workspace opens a custom menu styled with the active app theme
- The terminal menu uses the active locale and should expose only relevant terminal actions such as copy, paste, and select all
- Right-clicking a session tab opens only two localized close actions for that tab: close the current tab and close the other tabs
- In normal mode, connection rows do not open a custom context menu

## Connection interactions

Each connection entry supports:

- connect
- edit
- duplicate
- delete

Single-clicking a connection row should keep that connection highlighted. If the connection already has an open session tab, the single click should also switch the workspace to that tab.
Double-clicking a connection row should open a new session tab for that connection immediately.
Switching to a session tab should update the highlighted connection row in the left sidebar and automatically expand its group if that group was collapsed.

File transfer is launched from the active workspace header for the currently selected connection, not from each sidebar row.

Search results should temporarily reveal matching groups even if those groups were collapsed previously.

## Terminal workspace

The right side of the `Connections` workspace contains:

- terminal tab strip for active sessions, with inactive-tab hover tooltips showing `username@host[:port]`
- workspace header showing only the active SSH target in `username@host[:port]` format
- recording indicator when the active session is being recorded
- connect / disconnect actions for the selected connection
- file transfer action for the active connection
- active terminal area
- empty state when no session is active

Only the terminal viewport scrolls for terminal output. The tab strip scrollbar should follow the active theme when it overflows horizontally, and the tabs themselves should feel closer to a lightly stacked folder strip than three flat buttons. Inactive tabs should reveal the remote SSH target through a native hover tooltip so duplicate saved names are still distinguishable at a glance. Right-clicking a tab should open only two localized close actions: one for the clicked tab and one for all other tabs. Tab switching should immediately restore the selected session buffer without injecting any input into the active terminal. Background session status changes and late connection completions must not steal the active tab from the session the user is currently viewing, because rapid multi-tab connection attempts should still leave the workspace focused on the user-selected tab. If SSH startup fails, the connecting state must stop immediately and the workspace should show a clear error message for that session. During SSH startup, the terminal itself must remain visible and interactive so host-key confirmation and password prompts can be read and answered before the remote shell is marked `Connected`. If the initial shell prompt races with that state transition, the workspace should keep rehydrating the active tab from the backend snapshot until the terminal buffer is actually visible instead of leaving xterm blank. Inactive tabs should also keep background SSH startup moving by answering basic terminal capability and cursor-position probes even before the tab becomes visible. Initial terminal fitting should also tolerate layout races: the UI may fit xterm locally right away, but it should wait until the tab has visible terminal output before sending the first PTY resize to the backend, so a new tab does not get stuck with only a blinking cursor in the top-left corner.

Switching away from `Connections` must keep existing SSH sessions alive. Returning to `Connections` should restore the same terminal tabs and active session state.

## History workspace

The `History` workspace uses the shared left/right shell:

- **Left sidebar:** date-range quick filters, a collapsible `Overall statistics` section with links for `Cross-host duration share`, `Cross-host connection count share`, and `Daily usage`, plus a collapsible `Host statistics` section with host search, host list, and deleted-connection markers
- **Right panel:** whichever view matches the current left-side selection; overall share views pair the pie chart with a sortable host list that supports `By current metric` and `By latest connection` ordering plus proportional horizontal value bars, while host items show selected-host summary cards, duration-distribution charts, and recent session detail tables

Switching away from `History` and back should keep the previously selected host and active filters visible.

## Logs workspace

The `Logs` workspace appears only when session recording is enabled and uses the shared left/right shell:

- **Left sidebar:** recording-directory actions and discovered source list
- **Right panel:** a compact log-directory summary card, then a two-column content area where the left column shows an inline `Encryption password` label+field row, decrypt/export actions, a lower `Selected logs` block with clear-selection control plus read-only multiline file list, and then the per-source `.irlog` file list while the right column keeps the preview area

Switching away from `Logs` and back should keep the selected source and files, but must clear the decryption password and decrypted preview content.

Unreadable or invalid files appear in an expandable warning below the directory summary with loaded/failed counts, filenames, and error reasons; readable logs remain usable. The summary is keyboard accessible and uses theme-appropriate warning colors. A directory-level load failure displays the backend error instead of an empty-directory message. Refresh is disabled while loading. Failed refreshes retain the last successful list and selection; successful refreshes reconcile the selected source/files with the new list. Only a successful scan with no files or warnings shows the empty-directory message.

## Dialogs

### Connection dialog

Used for create, edit, and duplicate flows.

Fields:

- name
- group
- host
- port
- username
- password (optional)

When saved groups exist, the group field uses a theme-aware suggestion list that lets the user pick an existing group or type a brand new one. Group names are normalized case-insensitively, stored in Title Case, and shown through the existing uppercase group-header presentation.

Password entry here is for optional keyring storage, not for runtime prompt handling.

### File transfer panel

The active terminal header's **File Transfer** button toggles a remote file panel to the right of the terminal. The terminal remains mounted and usable, fits its reduced viewport, and synchronizes the PTY dimensions. Closing the panel restores its width. The panel starts at 360 px, is capped at 55% of the available terminal body, and has a draggable separator with Left/Right arrow-key resizing (240–640 px preferred width).

- The panel starts in the SFTP user's home directory; it does not track the terminal shell's `cd` commands.
- A path field and Open allow direct navigation. The compact toolbar uses icons for parent folder, Home, Refresh and hidden-file visibility, with localized hover titles and accessible labels. The hidden-file icon switches between crossed-out/visible eyes and uses an explicit pressed/highlighted state.
- Home resets the expanded tree after successfully resolving the SFTP login directory using a blank listing path. Once known, that home path appears immediately in the address field during loading; the canonical response updates both the field and tree root. It does not mean `/` or the terminal shell's current directory.
- Folder arrows expand/collapse an indented directory tree. Children load only on first expansion; collapsed branches remain cached. Selecting a row changes the transfer target only. Double-clicking a directory loads/expands it and commits its canonical path to the address field, preserving the existing tree anchor and expanded branches when reachable. Double-clicking a file does not navigate.
- Editing the address is a draft until Open succeeds. Directory input resets the tree at its canonical directory. File input resets the tree at its parent, displays the parent's canonical path, and selects/scrolls to the file. Relative input (including a bare filename) resolves against the committed browsing directory. Invalid, missing or unreadable targets show the actual error and preserve the previous usable tree, selection and browsing directory; the draft remains editable.
- Toolbar Refresh reloads the committed browsing directory and its expanded descendants, keeping the address there and retaining selection/expansion for entries that remain present. Parent also uses the committed directory, independently of selection or unsubmitted text.
- Hidden entries are omitted initially; Hidden files reloads visible branches and invalidates other cached branches with the chosen visibility while keeping the current browsing directory. If an ancestor becomes hidden, the tree starts at the current directory so browsing can continue. Selection is cleared if the item disappears or becomes hidden. An explicitly opened hidden file is temporarily included and selected even with Hidden files off; the next refresh applies the preference again. `.` and `..` never become tree nodes.
- Right-clicking a row (including the root) selects it and opens Refresh, Copy path, Find by name and Find by content. Shift+F10 / the context-menu key also open it; arrow keys move between actions, Escape and outside clicks dismiss it. Refresh reloads the selected directory branch, or the containing directory for a file, discarding stale descendant caches. Copy path copies the complete remote path.
- Find opens an inline search view with a keyword, scope and result list. Matching uses a case-insensitive literal substring. Directories are searched recursively. For a file, name search uses its containing directory and content search uses only that file. The current hidden-file preference applies. Content results include a line number and text preview; selecting a result navigates to its directory and selects it. Back to tree preserves the previous tree state, while Home/path navigation closes search. Limits and skipped unreadable/binary/oversized items are explicitly reported.
- The footer uses a single Upload icon and a Download icon, both drawn as a tray with an outward/inward arrow to distinguish them from parent-folder navigation. Hover titles describe the operation; Upload's title includes its target directory. Both actions are disabled until a remote item is selected and while choosing a local path or confirming/running another transfer.
- Clicking Upload opens a small menu above the button with file/folder choices, then opens the appropriate native picker. Selecting a remote directory uploads into it; selecting a remote file uploads into its containing directory. The selected file's name is not used as the upload destination. Download still chooses the native save-file or destination-folder picker from the selected item's type. Menu actions support keyboard navigation, Escape, outside-click dismissal, and reset when selection changes or the panel is hidden.
- A copy icon immediately follows the footer's `Remote path` text. Long paths are visually truncated while the full path remains available in the hover title and clipboard. The icon copies the current selected item's complete path using the same handler as the tree's Copy path menu action. Successful copies show a green check and localized status for 1.5 seconds; failures show an error without a success indicator. Copy is disabled when nothing is selected and stays available during transfers.
- Before starting, an inline confirmation shows the local/remote paths and states that same-name files are replaced and directories merged. Directory transfers preserve the source directory's basename inside the destination directory.
- Loading, empty directories, per-branch errors/retry, working status, transfer failures and completion appear inside the panel. Progress percentages, cancellation, queues, multi-select and drag/drop remain future work.
- Each terminal session keeps its own open state, path, tree and selection while switching tabs or hiding the panel. In-flight operations retain their original connection ID. Closing a terminal tab disposes its panel; it does not cancel a backend transfer already started.
- SFTP authenticates independently using saved credentials or available SSH keys. Logging into the terminal by typing a password does not authenticate this panel.

### About dialog

Shows:

- product name
- version
- author: Cao Yi
- project URL
- license

The project URL is an actionable link or button.

### Session recording dialog

Shows:

- enable toggle
- recording mode selection
- encryption password and confirmation fields for first-time setup
- existing-password status, Verify Password to resume recording, and one Change Password action, with no always-visible replacement fields or separate Reset Password action
- new-password and confirmation fields for Change Password, with no old-password field or reset acknowledgement checkbox; an inline warning explains that existing logs still need the password used when they were recorded and cannot be recovered by changing the password
- storage policy fields for file size, total storage, and retention
- customizable log directory path with browse/open actions
- current storage usage
- open-folder action

When recording is disabled, all dependent controls below the enable toggle are disabled and visually dimmed.
The log-directory input and its browse/open actions should stay aligned on the same row in normal desktop widths.

The first-connection password-verification dialog is separate from settings. It asks only for the existing password and offers exactly **Skip Recording** and **OK**. Neither Cancel, Reset Password, a close button, Escape, nor backdrop click dismisses it. Only the Skip Recording tooltip explains that skipping continues the connection and disables recording for all sessions in this app run, without changing the saved enabled setting; verification is required again after restart. Do not repeat this explanation in the dialog body. Use a theme-aware floating tooltip above the button with an 8px gap, about 288px width (constrained on small screens), 8px corners, a subtle border and shadow, 12px horizontal / 10px vertical padding, and 12px text with relaxed line spacing. The two sentences occupy separate lines and wrap naturally. Show it after 300ms of hover, or immediately on keyboard focus; allow the pointer to move onto the tooltip and Escape to dismiss only the tooltip. Do not add a title, icon, or arrow, or retain the native title tooltip. OK verifies and continues with recording, while a wrong password keeps the dialog open for retry. Input and both actions are disabled while a request is pending.

The preview area's scrollbar should follow the active light or dark theme, just like the sidebar and terminal tab strip.

## Visual behavior

- Light and dark themes apply consistently across sidebar surfaces, sidebar scrollbars, terminal tab-strip scrollbars, dialogs, themed popup menus, and terminal shell framing.
- Language switching updates visible labels without changing layout structure.
- Notices for import/export results, settings changes, and operational errors appear inline near the top of the main window content.

## Shortcuts and Keybindings

The application supports a comprehensive set of keyboard shortcuts mapped to standard OS modifiers (`Ctrl` for Windows/Linux, `Cmd`/`⌘` for macOS).

### Global & Main Interface
- `Mod + N`: New Connection
- `Mod + ,`: Open Settings (including Shortcuts configuration)
- `Mod + K` / `Mod + P`: Open Quick Connect / Global Search
- `Mod + Shift + F`: Focus connection list search field
- `F11` / `Mod + Ctrl + F`: Toggle Fullscreen

### Modals & Dialogs
- `Esc`: Cancel / Close current topmost modal. In password prompts, this cancels the connection and closes the prompt.
- `Enter`: Confirm / Submit for single-line inputs (e.g., password prompt, confirmation dialogs).
- `Mod + Enter`: Save / Submit for complex forms (e.g., Edit Connection).
- `Mod + S`: Save changes in dedicated settings pages.

### Tabs & Terminal Management
- `Mod + W`: Close current terminal tab.
- `Mod + Shift + W`: Close all terminal tabs.
- `Mod + Tab` / `Mod + Shift + Tab`: Cycle through open terminal tabs.
- `Mod + 1` to `Mod + 9`: Switch to tab 1 through 9.
- `Mod + F`: Find in current terminal session.
- `Mod + =` / `Mod + -`: Zoom in / out terminal font.
- `Mod + 0`: Reset terminal font size.
- `Mod + Shift + C` / `Mod + Shift + V`: Copy / Paste within terminal.

### SFTP / File Manager
- `F5` / `Mod + R`: Refresh current directory.
- `F2`: Rename selected file/folder.
- `Delete` / `Mod + Backspace`: Delete selected file/folder.
- `Backspace`: Go to parent directory.

### Shortcuts Settings Page
A dedicated "Shortcuts" (or "Keyboard") tab is available in the global Settings modal. It includes:
- A top search box to filter actions by name.
- A list/table of categorized actions and their current keybindings.
- An interactive recording mode: clicking a shortcut row enables capturing the next key combination to rebind it.
- A reset action for each shortcut to restore its default binding.

The frontend uses `navigator.platform` or Tauri's OS detection to display the correct modifier key (`Ctrl` vs `⌘`) to the user. Terminal shortcuts (like `Mod + W`) are intercepted in xterm's `customKeyEventHandler` by returning `false` to prevent the terminal from swallowing the event, allowing it to bubble up to the global React event listeners.

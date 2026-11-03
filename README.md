# pi-tools-manager

A Pi extension to inspect, search, and toggle installed tools in Pi Coding Agent via an interactive TUI.

## Features

- **Interactive TUI Table**: View all installed tools, their origin (built-in, SDK, NPM extension, file-based extension), and descriptions.
- **Enable / Disable Toggling**: Easily toggle tools on and off with Space/Tab. Disabled tools are blocked from agent tool calls and session tools.
- **Instant Search & Filter**: Type any query to filter tools by name, source, or description.
- **Detailed Schema Inspection**: Press Enter on any tool to inspect parameter schemas, required flags, default values, and full source paths.
- **Zero Conversation Clutter**: Operates cleanly in the UI layer without injecting unwanted tokens into the LLM context.

## Installation

Install using Pi package manager:

```bash
pi install ./pi-tools-manager
```

Or from npm/git when published:

```bash
pi install npm:pi-tools-manager
```

## Usage

In any Pi session, run:

```text
/tools
```

Or view a specific tool directly:

```text
/tools bash
```

### Keyboard Shortcuts

#### List View
- `↑` / `↓` (or `k` / `j`, `Ctrl+P` / `Ctrl+N`): Navigate tools
- `Enter`: View detailed tool schema and documentation
- `Space` / `Tab` / `Ctrl+D`: Toggle enable / disable
- `Type any text`: Filter tools by keyword
- `Backspace`: Delete search character
- `Esc` / `Ctrl+C`: Exit manager

#### Detail View
- `↑` / `↓` (or `k` / `j`): Scroll description and parameter documentation
- `Space` / `Tab` / `Ctrl+D`: Toggle enable / disable
- `Enter` / `Esc` / `Backspace` / `q`: Return to list view
- `Ctrl+C`: Exit manager

## License

MIT

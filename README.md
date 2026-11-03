# pi-tools-manager

A Pi extension to inspect, search, and toggle installed tools in Pi Coding Agent via an interactive TUI.

## Why pi-tools-manager?

As you install extensions in Pi, your environment can quickly become crowded with tools:

- **Token & Context Overhead**: Every active tool definition and parameter schema is injected into the system prompt, consuming valuable context tokens on every request.
- **Tool Conflicts & Overlap**: Multiple extensions may register competing tools for the same task (such as multiple web search or browser tools), confusing the model and degrading tool selection accuracy.
- **Unclear Tool Purpose**: When many tools are loaded, it can be difficult to know what each tool does, which extension provided it, or what parameters it expects.

`pi-tools-manager` solves these problems by providing clear visibility and control:

- **Inspect Available Tools**: Easily browse all installed tools, see their origin (`builtin` or extension package), and inspect their full descriptions and parameter schemas.
- **Reduce Token Usage**: Disable tools you do not need for your current project or workflow to keep your prompt lean.
- **Prevent Conflicts**: Deactivate redundant or overlapping tools so the agent consistently uses the right one.

## Features

- **Interactive TUI List**: View all installed tools as a clean single-line list with their origin (`builtin` or extension name) and descriptions.
- **Enable / Disable Toggling**: Easily toggle tools on and off. Disabled tools are blocked from agent tool calls and session tools.
- **Instant Search & Filter**: Type any query to filter tools by name, source, or description.
- **Detailed Schema Inspection**: Inspect parameter schemas, required flags, default values, and full source paths.
- **Zero Conversation Clutter**: Operates cleanly in the UI layer without injecting unwanted tokens into the LLM context.

## Installation

```bash
pi install npm:@dsnbyte/pi-tools-manager
```

### Try Without Installing

You can test the extension in a single Pi session without modifying your settings:

```bash
pi -e npm:@dsnbyte/pi-tools-manager
```

## Usage

You can access the manager anytime during an active Pi session using the `/tools` slash command:

```text
/tools
```

Running `/tools` opens an interactive UI where you can:

- **Browse & Search**: View all installed tools and type to instantly filter by tool name, source, or description.
- **Inspect Details**: Select any tool to inspect its description, parameter schemas, required flags, and source location.
- **Toggle Tools**: Toggle tools enabled or disabled with `Ctrl+D`. Disabled tools are prevented from being called by the agent, and your configuration persists across sessions.

You can also jump directly to the inspection view of a specific tool by providing its name:

```text
/tools bash
```

## License

MIT

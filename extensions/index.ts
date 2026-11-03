import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
  type ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ToolsManagerOptions {
  configPath?: string;
}

interface ToolConfig {
  disabled: string[];
}

function resolveConfigFile(options?: ToolsManagerOptions): string {
  if (options?.configPath) {
    return options.configPath;
  }
  if (process.env.PI_TOOLS_MANAGER_CONFIG) {
    return process.env.PI_TOOLS_MANAGER_CONFIG;
  }
  return join(getAgentDir(), "tools-manager.json");
}

function loadConfig(configFile: string): ToolConfig {
  try {
    if (!existsSync(configFile)) {
      return { disabled: [] };
    }
    const raw = JSON.parse(readFileSync(configFile, "utf-8")) as unknown;
    const cfg = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const disabled = Array.isArray(cfg.disabled)
      ? cfg.disabled.filter((n): n is string => typeof n === "string" && n.length > 0)
      : [];
    return { disabled };
  } catch {
    return { disabled: [] };
  }
}

function saveConfig(configFile: string, cfg: ToolConfig): void {
  try {
    mkdirSync(dirname(configFile), { recursive: true });
    writeFileSync(configFile, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
  } catch {
    // Gracefully ignore write failures (e.g. read-only filesystem)
  }
}

/**
 * Resolved source information for a tool.
 */
interface ToolSourceDetail {
  isBuiltin: boolean;
  label: string;
  path?: string;
}

/**
 * Resolve where a tool originates from (Built-in Pi or specific Extension).
 */
function resolveToolSource(tool: ToolInfo): ToolSourceDetail {
  const sourceInfo = tool.sourceInfo;
  const pathStr = sourceInfo?.path ?? "";
  const sourceStr = sourceInfo?.source ?? "";

  // 1. Built-in tools in Pi core (e.g. builtin:read, builtin:bash)
  if (sourceStr === "builtin" || pathStr.startsWith("builtin:")) {
    return { isBuiltin: true, label: "Built-in (pi)", path: pathStr };
  }

  // 2. Built-in SDK tools (e.g. <sdk:...>)
  if (sourceStr === "sdk" || pathStr.startsWith("<sdk:")) {
    return { isBuiltin: true, label: "Built-in (sdk)", path: pathStr };
  }

  // 3. NPM package extensions (e.g. "npm:pi-agent-browser-native", "npm:@upstash/context7-pi")
  if (sourceStr.startsWith("npm:")) {
    const pkgName = sourceStr.replace(/^npm:/, "");
    return {
      isBuiltin: false,
      label: pkgName,
      path: pathStr || sourceInfo?.baseDir,
    };
  }

  // 4. File-based extensions in ~/.pi/agent/extensions or <cwd>/.pi/extensions
  const extDirMatch = pathStr.match(/[\\/]extensions[\\/]([^\\/]+)/);
  if (extDirMatch) {
    const rawName = extDirMatch[1];
    const cleanName = rawName.replace(/\.(ts|js|mjs|cjs)$/, "");
    return {
      isBuiltin: false,
      label: cleanName,
      path: pathStr,
    };
  }

  // 5. Explicit source string if defined and not generic "auto" or "local"
  if (sourceStr && sourceStr !== "auto" && sourceStr !== "local") {
    return {
      isBuiltin: false,
      label: sourceStr,
      path: pathStr,
    };
  }

  // 6. Base directory fallback
  if (sourceInfo?.baseDir) {
    const parts = sourceInfo.baseDir.split(/[\\/]/).filter(Boolean);
    const dirName = parts[parts.length - 1] || "unknown";
    return {
      isBuiltin: false,
      label: dirName,
      path: pathStr,
    };
  }

  // 7. File path fallback
  if (pathStr) {
    const parts = pathStr.split(/[\\/]/).filter(Boolean);
    const base = (parts[parts.length - 1] || "unknown").replace(/\.(ts|js|mjs|cjs)$/, "");
    return {
      isBuiltin: false,
      label: base,
      path: pathStr,
    };
  }

  return {
    isBuiltin: false,
    label: "extension",
    path: undefined,
  };
}

/**
 * Normalize multi-line description into a single line without excessive spaces.
 */
function normalizeDesc(desc: string | undefined): string {
  if (!desc) return "(no description)";
  return desc.replace(/\r?\n|\r/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Format a JSON Schema type descriptor into a readable string.
 */
function formatType(schema: any): string {
  if (!schema || typeof schema !== "object") return "any";
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v: unknown) => JSON.stringify(v)).join(" | ");
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map(formatType).join(" | ");
  }
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map(formatType).join(" | ");
  }
  if (schema.type === "array") {
    const itemType = schema.items ? formatType(schema.items) : "any";
    return `Array<${itemType}>`;
  }
  if (schema.type) {
    return Array.isArray(schema.type) ? schema.type.join(" | ") : String(schema.type);
  }
  return "any";
}

/**
 * Word wrap helper for clean paragraph formatting in detail view.
 */
function wrapText(text: string, maxWidth: number, indent = ""): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = indent;

  for (const word of words) {
    if (!word) continue;
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine === indent ? "" : " ") + word;
    } else {
      if (currentLine !== indent) lines.push(currentLine);
      currentLine = indent + word;
    }
  }
  if (currentLine !== indent) lines.push(currentLine);
  return lines.length > 0 ? lines : [indent];
}

/**
 * Format full detail for non-TUI fallback notification.
 */
function formatNonTuiDetail(tool: ToolInfo, disabled: Set<string>): string {
  const src = resolveToolSource(tool);
  const status = disabled.has(tool.name) ? "Disabled" : "Enabled";
  const lines: string[] = [
    `Tool: ${tool.name}`,
    `Status: ${status}`,
    `Origin: ${src.label}`,
    `Path: ${src.path || "builtin"}`,
    `Exposure: ${tool.exposure || "direct"}`,
    "",
    "Description:",
    `  ${tool.description || "(No description provided)"}`,
    "",
    "Parameters:",
  ];

  const params = tool.parameters as any;
  const properties = params?.properties || {};
  const required = new Set(Array.isArray(params?.required) ? params.required : []);
  const propKeys = Object.keys(properties);

  if (propKeys.length === 0) {
    lines.push("  None (no parameters required)");
  } else {
    for (const key of propKeys) {
      const prop = properties[key] || {};
      const typeStr = formatType(prop);
      const reqStr = required.has(key) ? "required" : "optional";
      const defaultStr = prop.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : "";
      lines.push(`  • ${key} (${typeStr}, ${reqStr})${defaultStr}`);
      if (prop.description) {
        lines.push(`      ${prop.description}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format list table for non-TUI fallback notification.
 */
function formatNonTuiTable(tools: ToolInfo[], disabled: Set<string>): string {
  const col1 = 28;
  const col2 = 24;
  const lines: string[] = [
    `${"Tool Name".padEnd(col1)}  ${"Origin".padEnd(col2)}  Description`,
    "─".repeat(80),
  ];

  for (const t of tools) {
    const src = resolveToolSource(t);
    const dis = disabled.has(t.name) ? " [disabled]" : "";
    const fullName = t.name + dis;
    const cleanName = fullName.length > col1 - 1 ? fullName.slice(0, col1 - 4) + "..." : fullName;
    const cleanOrigin = src.label.length > col2 - 1 ? src.label.slice(0, col2 - 4) + "..." : src.label;
    let desc = normalizeDesc(t.description);
    if (desc.length > 50) desc = desc.slice(0, 47) + "...";
    lines.push(`${cleanName.padEnd(col1)}  ${cleanOrigin.padEnd(col2)}  ${desc}`);
  }

  return lines.join("\n");
}

/**
 * Interactive TUI Component for displaying installed tools in a dark/muted table,
 * with keyboard navigation and detailed view upon pressing Enter.
 */
class ToolInfoComponent implements Component {
  private tools: ToolInfo[];
  private tui: TUI;
  private theme: Theme;
  private disabled: Set<string>;
  private onToggleTool: (toolName: string) => void;
  private onClose: () => void;
  private mode: "list" | "detail" = "list";
  private selectedIndex = 0;
  private listScrollTop = 0;
  private detailScrollTop = 0;
  private filterText = "";
  private selectedTool: ToolInfo | null = null;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    tools: ToolInfo[],
    tui: TUI,
    theme: Theme,
    disabled: Set<string>,
    onToggleTool: (toolName: string) => void,
    initialTool: ToolInfo | null,
    onClose: () => void,
  ) {
    this.tools = tools;
    this.tui = tui;
    this.theme = theme;
    this.disabled = disabled;
    this.onToggleTool = onToggleTool;
    this.onClose = onClose;

    if (initialTool) {
      this.selectedTool = initialTool;
      this.mode = "detail";
      const idx = tools.findIndex((t) => t.name === initialTool.name);
      if (idx !== -1) this.selectedIndex = idx;
    }
  }

  private getFilteredTools(): ToolInfo[] {
    if (!this.filterText) return this.tools;
    const kw = this.filterText.toLowerCase();
    return this.tools.filter((t) => {
      const src = resolveToolSource(t);
      return (
        t.name.toLowerCase().includes(kw) ||
        src.label.toLowerCase().includes(kw) ||
        (t.description && t.description.toLowerCase().includes(kw))
      );
    });
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const termRows = this.tui.terminal?.rows || process.stdout.rows || 24;
    let lines: string[];

    if (this.mode === "detail") {
      lines = this.renderDetail(width, termRows);
    } else {
      lines = this.renderList(width, termRows);
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderList(width: number, termRows: number): string[] {
    const lines: string[] = [];
    const th = this.theme;
    const filtered = this.getFilteredTools();

    // Top border in muted tone
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    // Header bar with tool counts and filter status
    const filterInfo = this.filterText ? ` [Filter: "${this.filterText}"]` : "";
    const disabledCount = this.tools.filter((t) => this.disabled.has(t.name)).length;
    const disabledInfo =
      disabledCount > 0
        ? ", " + th.style(`${disabledCount} disabled`, { fg: "error", dim: true, italic: true })
        : "";
    const titleText =
      th.fg("muted", ` Tools (${filtered.length}/${this.tools.length}`) +
      disabledInfo +
      th.fg("muted", `)${filterInfo}`);
    lines.push(titleText);
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    // Column widths
    const col1 = Math.min(30, Math.max(16, width > 85 ? 28 : 20));
    const col2 = Math.min(26, Math.max(16, width > 95 ? 24 : 18));
    const col3 = Math.max(10, width - col1 - col2 - 8);

    // Table header row in dim color
    const header = `  ${"Tool Name".padEnd(col1)}  ${"Origin".padEnd(col2)}  Description`;
    lines.push(th.fg("dim", truncateToWidth(header, width - 2, "")));
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    // Max visible table rows
    const maxVisibleRows = Math.max(6, Math.min(18, termRows - 10));

    if (filtered.length === 0) {
      lines.push(th.fg("dim", `  (No tools matching "${this.filterText}")`));
      for (let i = 1; i < maxVisibleRows; i++) {
        lines.push("");
      }
    } else {
      // Keep selection in range
      this.selectedIndex = Math.max(0, Math.min(filtered.length - 1, this.selectedIndex));

      // Scroll list if necessary
      if (this.selectedIndex < this.listScrollTop) {
        this.listScrollTop = this.selectedIndex;
      } else if (this.selectedIndex >= this.listScrollTop + maxVisibleRows) {
        this.listScrollTop = this.selectedIndex - maxVisibleRows + 1;
      }

      const start = this.listScrollTop;
      const end = Math.min(filtered.length, start + maxVisibleRows);

      for (let i = start; i < end; i++) {
        const tool = filtered[i];
        const isSelected = i === this.selectedIndex;
        const isDisabled = this.disabled.has(tool.name);
        const src = resolveToolSource(tool);

        const cleanName = tool.name.length > col1 - 1 ? tool.name.slice(0, col1 - 4) + "..." : tool.name;
        const nameStr = cleanName.padEnd(col1);

        const cleanOrigin = src.label.length > col2 - 1 ? src.label.slice(0, col2 - 4) + "..." : src.label;
        const originStr = cleanOrigin.padEnd(col2);

        const fullDesc = normalizeDesc(tool.description);
        const cleanDesc = fullDesc.length > col3 ? fullDesc.slice(0, col3 - 3) + "..." : fullDesc;

        if (isSelected) {
          // Selected item in darker / muted tone (or red dark + italic if disabled)
          const prefix = th.fg("muted", "▸ ");
          if (isDisabled) {
            const namePart = th.style(nameStr, { fg: "error", dim: true, italic: true });
            const originPart = th.style(originStr, { fg: "error", dim: true, italic: true });
            const descPart = th.style(cleanDesc, { fg: "error", dim: true, italic: true });
            lines.push(`${prefix}${namePart}  ${originPart}  ${descPart}`);
          } else {
            const namePart = th.fg("text", nameStr);
            const originPart = th.fg("muted", originStr);
            const descPart = th.fg("muted", cleanDesc);
            lines.push(`${prefix}${namePart}  ${originPart}  ${descPart}`);
          }
        } else {
          // Unselected item in dim/muted tones (or red dark + italic if disabled)
          const prefix = "  ";
          if (isDisabled) {
            const namePart = th.style(nameStr, { fg: "error", dim: true, italic: true });
            const originPart = th.style(originStr, { fg: "error", dim: true, italic: true });
            const descPart = th.style(cleanDesc, { fg: "error", dim: true, italic: true });
            lines.push(`${prefix}${namePart}  ${originPart}  ${descPart}`);
          } else {
            const namePart = th.fg("muted", nameStr);
            const originPart = th.fg("dim", originStr);
            const descPart = th.fg("dim", cleanDesc);
            lines.push(`${prefix}${namePart}  ${originPart}  ${descPart}`);
          }
        }
      }

      // Pad remaining empty rows to maintain layout stability
      for (let i = end - start; i < maxVisibleRows; i++) {
        lines.push("");
      }
    }

    // Bottom separator & control hint
    lines.push(th.fg("borderMuted", "─".repeat(width)));
    const scrollPos = filtered.length > 0 ? ` (${this.selectedIndex + 1}/${filtered.length})` : "";
    const hint = `  ↑/↓ navigate • Enter details • Space toggle • Type to filter • Esc exit${scrollPos}`;
    lines.push(th.fg("dim", truncateToWidth(hint, width - 2, "")));
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    return lines;
  }

  private renderDetail(width: number, termRows: number): string[] {
    const tool = this.selectedTool;
    if (!tool) return this.renderList(width, termRows);

    const th = this.theme;
    const src = resolveToolSource(tool);
    const contentWidth = Math.max(20, width - 6);
    const isDisabled = this.disabled.has(tool.name);

    const docLines: string[] = [];

    // Metadata
    const statusText = isDisabled
      ? th.style("Disabled", { fg: "error", dim: true, italic: true })
      : th.fg("muted", "Enabled");
    docLines.push(th.fg("dim", "Status:      ") + statusText + th.fg("dim", " (Space to toggle)"));
    docLines.push(th.fg("dim", "Origin:      ") + th.fg("muted", src.label));
    if (src.path) {
      docLines.push(th.fg("dim", "Source Path: ") + th.fg("dim", src.path));
    }
    docLines.push(th.fg("dim", "Exposure:    ") + th.fg("dim", tool.exposure || "direct"));
    docLines.push("");

    // Description
    docLines.push(th.fg("muted", "Description:"));
    const descText = tool.description || "(No description provided)";
    for (const line of wrapText(descText, contentWidth, "  ")) {
      docLines.push(th.fg("dim", line));
    }
    docLines.push("");

    // Parameters
    docLines.push(th.fg("muted", "Parameters:"));
    const params = tool.parameters as any;
    const properties = params?.properties || {};
    const required = new Set(Array.isArray(params?.required) ? params.required : []);
    const propKeys = Object.keys(properties);

    if (propKeys.length === 0) {
      docLines.push(th.fg("dim", "  None (no parameters required)"));
    } else {
      for (const key of propKeys) {
        const prop = properties[key] || {};
        const typeStr = formatType(prop);
        const reqStr = required.has(key) ? "required" : "optional";
        const defaultStr = prop.default !== undefined ? ` (default: ${JSON.stringify(prop.default)})` : "";

        docLines.push(
          th.fg("muted", `  • ${key}`) +
          th.fg("dim", ` (${typeStr}, ${reqStr})${defaultStr}`)
        );
        if (prop.description) {
          for (const descLine of wrapText(prop.description, contentWidth, "      ")) {
            docLines.push(th.fg("dim", descLine));
          }
        }
      }
    }
    docLines.push("");

    // Raw Parameters Schema
    docLines.push(th.fg("muted", "Parameters Schema (JSON):"));
    const schemaStr = JSON.stringify(tool.parameters || {}, null, 2);
    for (const line of schemaStr.split("\n")) {
      docLines.push(th.fg("dim", `  ${line}`));
    }

    // Visible scroll window
    const maxVisibleDetail = Math.max(8, Math.min(24, termRows - 8));
    const maxScroll = Math.max(0, docLines.length - maxVisibleDetail);
    this.detailScrollTop = Math.max(0, Math.min(maxScroll, this.detailScrollTop));

    const visibleContent = docLines.slice(
      this.detailScrollTop,
      this.detailScrollTop + maxVisibleDetail
    );

    const lines: string[] = [];
    lines.push(th.fg("borderMuted", "─".repeat(width)));
    const statusBadge = isDisabled ? " " + th.style("[DISABLED]", { fg: "error", dim: true, italic: true }) : "";
    lines.push(th.fg("muted", ` TOOL DETAILS: ${tool.name}`) + statusBadge);
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    for (const line of visibleContent) {
      lines.push(truncateToWidth(`  ${line}`, width, ""));
    }

    // Pad empty lines if content is short
    for (let i = visibleContent.length; i < maxVisibleDetail; i++) {
      lines.push("");
    }

    lines.push(th.fg("borderMuted", "─".repeat(width)));
    const scrollInfo = maxScroll > 0 ? ` • (${this.detailScrollTop + 1}/${docLines.length})` : "";
    const toggleLabel = isDisabled ? "Space enable" : "Space disable";
    const hint = `  ↑/↓ scroll • ${toggleLabel} • Enter / Esc / Backspace: back to list${scrollInfo}`;
    lines.push(th.fg("dim", truncateToWidth(hint, width - 2, "")));
    lines.push(th.fg("borderMuted", "─".repeat(width)));

    return lines;
  }

  handleInput(data: string): void {
    const filtered = this.getFilteredTools();

    // ----------------------------------------------------
    // Detail Mode Keyboard Handling
    // ----------------------------------------------------
    if (this.mode === "detail") {
      // Toggle disabled state directly from detail page
      if (
        matchesKey(data, "space") ||
        matchesKey(data, "tab") ||
        matchesKey(data, "ctrl+d") ||
        data === "d" ||
        data === " "
      ) {
        if (this.selectedTool) {
          this.onToggleTool(this.selectedTool.name);
          this.invalidate();
          this.tui.requestRender();
        }
        return;
      }

      // Esc, Enter, Backspace, or 'q': back to list
      if (
        matchesKey(data, "escape") ||
        matchesKey(data, "enter") ||
        matchesKey(data, "backspace") ||
        data === "\r" ||
        data === "\n" ||
        data === "\x7f" ||
        data === "\b" ||
        data === "q"
      ) {
        this.mode = "list";
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "ctrl+c")) {
        this.onClose();
        return;
      }

      // Scrolling
      if (matchesKey(data, "up") || matchesKey(data, "ctrl+p") || data === "k") {
        this.detailScrollTop = Math.max(0, this.detailScrollTop - 1);
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "down") || matchesKey(data, "ctrl+n") || data === "j") {
        this.detailScrollTop++;
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "pageUp")) {
        this.detailScrollTop = Math.max(0, this.detailScrollTop - 8);
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "pageDown")) {
        this.detailScrollTop += 8;
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "home")) {
        this.detailScrollTop = 0;
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      if (matchesKey(data, "end")) {
        this.detailScrollTop = 99999;
        this.invalidate();
        this.tui.requestRender();
        return;
      }

      return;
    }

    // ----------------------------------------------------
    // List Mode Keyboard Handling
    // ----------------------------------------------------
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
      return;
    }

    if (matchesKey(data, "enter") || data === "\r" || data === "\n") {
      if (filtered.length > 0 && filtered[this.selectedIndex]) {
        this.selectedTool = filtered[this.selectedIndex];
        this.mode = "detail";
        this.detailScrollTop = 0;
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    // Toggle disabled state shortcut in list mode
    if (
      matchesKey(data, "space") ||
      matchesKey(data, "tab") ||
      matchesKey(data, "ctrl+d")
    ) {
      if (filtered.length > 0 && filtered[this.selectedIndex]) {
        const tool = filtered[this.selectedIndex];
        this.onToggleTool(tool.name);
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) {
      if (filtered.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) {
      if (filtered.length > 0) {
        this.selectedIndex = Math.min(filtered.length - 1, this.selectedIndex + 1);
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "pageUp")) {
      if (filtered.length > 0) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 8);
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "pageDown")) {
      if (filtered.length > 0) {
        this.selectedIndex = Math.min(filtered.length - 1, this.selectedIndex + 8);
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (matchesKey(data, "home")) {
      this.selectedIndex = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "end")) {
      this.selectedIndex = Math.max(0, filtered.length - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, "backspace") || data === "\x7f" || data === "\b") {
      if (this.filterText.length > 0) {
        this.filterText = this.filterText.slice(0, -1);
        this.selectedIndex = 0;
        this.listScrollTop = 0;
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    // Printable character: add to search filter
    if (data.length === 1 && data >= " " && data <= "~") {
      this.filterText += data;
      this.selectedIndex = 0;
      this.listScrollTop = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }
}

/**
 * Tools Manager Extension for Pi.
 * Registers the /tools slash command to display installed tools in a clean,
 * keyboard-navigable table with darker/muted colors, showing details on Enter.
 * Operates purely in the UI layer without entering the conversation context.
 */
export default function toolsManagerExtension(pi: ExtensionAPI, options?: ToolsManagerOptions) {
  const configFile = resolveConfigFile(options);
  const disabled = new Set<string>(loadConfig(configFile).disabled);

  function persist(): void {
    saveConfig(configFile, { disabled: Array.from(disabled).sort() });
  }

  function applyTools(): void {
    const active = pi.getActiveTools();
    const next = active.filter((name) => !disabled.has(name));
    if (next.length !== active.length) pi.setActiveTools(next);
  }

  function enableTool(name: string): void {
    if (!disabled.delete(name)) return;
    const active = pi.getActiveTools();
    if (!active.includes(name)) pi.setActiveTools([...active, name]);
  }

  function disableTool(name: string): void {
    disabled.add(name);
    applyTools();
  }

  function toggleTool(name: string): boolean {
    if (disabled.has(name)) {
      enableTool(name);
    } else {
      disableTool(name);
    }
    persist();
    return disabled.has(name);
  }

  // Event hooks matching tool management exactly
  pi.on("session_start", () => {
    applyTools();
  });

  pi.on("before_agent_start", () => {
    applyTools();
  });

  pi.on("tool_call", (event) => {
    if (disabled.has(event.toolName)) {
      return {
        block: true,
        reason: `Tool ${event.toolName} is disabled`,
      };
    }
    return undefined;
  });

  pi.registerCommand("tools", {
    description: "Display installed tools table and details, toggle enabled/disabled status",
    getArgumentCompletions: (prefix) => {
      const tools = pi.getAllTools();
      const names = tools.map((t) => t.name);
      const search = prefix.trim().toLowerCase();
      const filtered = names.filter((name) => name.toLowerCase().startsWith(search));
      return filtered.length > 0 ? filtered.map((c) => ({ value: c, label: c })) : null;
    },
    handler: async (args, ctx: ExtensionCommandContext) => {
      const tools = pi.getAllTools();
      const trimmedArg = args.trim();

      // Find initial tool if argument was passed (e.g. `/tools bash`)
      let initialTool: ToolInfo | null = null;
      if (trimmedArg) {
        const found = tools.find((t) => t.name.toLowerCase() === trimmedArg.toLowerCase());
        if (!found) {
          ctx.ui.notify(
            `Tool "${trimmedArg}" not found. Run /tools to view all installed tools.`,
            "warning",
          );
          return;
        }
        initialTool = found;
      }

      // Non-TUI mode fallback (print, RPC without TUI)
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        if (initialTool) {
          ctx.ui.notify(formatNonTuiDetail(initialTool, disabled), "info");
        } else {
          ctx.ui.notify(formatNonTuiTable(tools, disabled), "info");
        }
        return;
      }

      // Interactive TUI mode: open custom table component
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        return new ToolInfoComponent(
          tools,
          tui,
          theme,
          disabled,
          (toolName) => toggleTool(toolName),
          initialTool,
          () => done(),
        );
      });
    },
  });
}

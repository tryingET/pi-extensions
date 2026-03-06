import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { wrapAutocompleteProviderForDollarPrefix } from "./ptxAutocompleteProvider.js";

const PREVIEW_COMMAND = "/ptx-preview";

function stripDollarPrefix(text) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("$$")) return null;

  const afterDollar = trimmed.slice(2).trimStart();
  return afterDollar;
}

function stripPreviewPrefix(text) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(PREVIEW_COMMAND)) return null;

  const afterCommand = trimmed.slice(PREVIEW_COMMAND.length);
  if (afterCommand.length > 0 && !/^\s/.test(afterCommand)) return null;

  return afterCommand.trimStart();
}

function isDollarSlashContext(textBeforeCursor) {
  const afterDollar = stripDollarPrefix(textBeforeCursor);
  return afterDollar !== null && afterDollar.startsWith("/");
}

function isPreviewSlashContext(textBeforeCursor) {
  const afterPreview = stripPreviewPrefix(textBeforeCursor);
  return afterPreview !== null && afterPreview.startsWith("/");
}

function isDollarCommandNameContext(textBeforeCursor) {
  const afterDollar = stripDollarPrefix(textBeforeCursor);
  if (afterDollar === null || !afterDollar.startsWith("/")) return false;
  return !afterDollar.includes(" ");
}

function isPreviewCommandNameContext(textBeforeCursor) {
  const afterPreview = stripPreviewPrefix(textBeforeCursor);
  if (afterPreview === null || !afterPreview.startsWith("/")) return false;
  return !afterPreview.includes(" ");
}

export class PtxAutocompleteEditor extends CustomEditor {
  setAutocompleteProvider(provider) {
    super.setAutocompleteProvider(wrapAutocompleteProviderForDollarPrefix(provider));
  }

  isAtStartOfMessage() {
    if (this.getCursor().line !== 0) return false;

    const line = this.getLines()[0] ?? "";
    const textBeforeCursor = line.slice(0, this.getCursor().col);
    const trimmed = textBeforeCursor.trim();

    if (trimmed === "" || trimmed === "/") return true;
    if (isDollarCommandNameContext(textBeforeCursor)) return true;
    if (isPreviewCommandNameContext(textBeforeCursor)) return true;

    return false;
  }

  isInSlashCommandContext(textBeforeCursor) {
    if (this.getCursor().line !== 0) return false;

    const trimmed = textBeforeCursor.trimStart();
    if (trimmed.startsWith("/")) return true;

    return isDollarSlashContext(textBeforeCursor) || isPreviewSlashContext(textBeforeCursor);
  }

  handleTabCompletion() {
    const cursor = this.getCursor();
    const line = this.getLines()[cursor.line] ?? "";
    const textBeforeCursor = line.slice(0, cursor.col);

    if (isDollarCommandNameContext(textBeforeCursor) || isPreviewCommandNameContext(textBeforeCursor)) {
      this.tryTriggerAutocomplete(true);
      return;
    }

    super.handleTabCompletion();
  }
}

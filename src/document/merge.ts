import { identity, type EditCommand } from "./commands";
import type { DocumentState, TextChange } from "./state";

/**
 * Joins several commands computed against the same document into one transaction (one Undo step).
 * Changes that overlap an earlier accepted change are skipped and counted, so the caller can say so.
 */
export function mergeCommands(document: DocumentState, commands: EditCommand[], label: string): { command: EditCommand | null; skipped: number } {
  const accepted: TextChange[] = [];
  let skipped = 0;
  const overlaps = (change: TextChange) => accepted.some((item) => change.from < item.to && item.from < change.to || (change.from === change.to || item.from === item.to) && change.from === item.from && change.to === item.to);
  for (const command of commands) for (const change of command.changes) {
    if (command.documentId !== document.id || command.revision !== document.revision || overlaps(change)) { skipped++; continue; }
    accepted.push(change);
  }
  return { command: accepted.length ? { ...identity(document), label, changes: accepted.sort((a, b) => a.from - b.from || a.to - b.to) } : null, skipped };
}

/** Keeps only the changes that lie inside a range (a selection or the current spoiler). */
export function restrictCommand(command: EditCommand | null, range: { from: number; to: number } | null): EditCommand | null {
  if (!command || !range) return command;
  const changes = command.changes.filter((change) => change.from >= range.from && change.to <= range.to);
  return changes.length ? { ...command, changes } : null;
}

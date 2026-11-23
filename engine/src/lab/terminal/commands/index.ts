import type { TerminalCommandDefinition } from "../types.js";
import { createDiagnosticCommands } from "./diagnostics.js";
import { createNetworkCommands } from "./network.js";
import { createSystemCommands } from "./system.js";

export function createTerminalCommands(): readonly TerminalCommandDefinition[] {
  const operationalCommands = [
    ...createNetworkCommands(),
    ...createDiagnosticCommands(),
  ];
  const initialSystemCommands = createSystemCommands([]);
  const catalogue = [...operationalCommands, ...initialSystemCommands];
  return [...operationalCommands, ...createSystemCommands(catalogue)];
}

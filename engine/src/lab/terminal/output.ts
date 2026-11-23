import type { TerminalCommandContext, TerminalOutput, TerminalTone } from "./types.js";

export function line(text: string, tone: TerminalTone = "normal"): TerminalOutput {
  return { kind: "line", text, tone };
}

export async function* writeLines(
  context: TerminalCommandContext,
  texts: readonly string[],
  signal: AbortSignal,
  tone: TerminalTone = "normal",
): AsyncGenerator<TerminalOutput> {
  for (const text of texts) {
    if (signal.aborted) return;
    yield line(text, tone);
    if (context.lineDelayMs > 0) await wait(context.lineDelayMs, signal);
  }
}

export function wait(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (milliseconds <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function connectedInterfaceIds(context: TerminalCommandContext): ReadonlySet<string> {
  const connected = new Set(context.topology.connections.flatMap((connection) => [
    connection.firstInterfaceId,
    connection.secondInterfaceId,
  ]));
  return new Set(context.computer.interfaces
    .filter((networkInterface) => networkInterface.enabled && connected.has(networkInterface.id))
    .map((networkInterface) => networkInterface.id));
}

import type { TerminalCommandContext, TerminalOutput, TerminalTone } from "./types.js";
export declare function line(text: string, tone?: TerminalTone): TerminalOutput;
export declare function writeLines(context: TerminalCommandContext, texts: readonly string[], signal: AbortSignal, tone?: TerminalTone): AsyncGenerator<TerminalOutput>;
export declare function wait(milliseconds: number, signal: AbortSignal): Promise<boolean>;
export declare function connectedInterfaceIds(context: TerminalCommandContext): ReadonlySet<string>;

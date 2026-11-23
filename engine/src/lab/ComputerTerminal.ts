import type { SimulationEvent } from "../domain/SimulationEvent.js";
import { createTerminalCommands } from "./terminal/commands/index.js";
import type { TerminalCommandContext, TerminalCommandDefinition, TerminalOutput } from "./terminal/types.js";
import { TopologySimulation, type TopologySimulationConfiguration } from "./TopologySimulation.js";

export interface ComputerTerminalOptions {
  readonly lineDelayMs?: number;
  readonly pingIntervalMs?: number;
  readonly simulation?: TopologySimulation;
}

function tokenize(commandLine: string): string[] {
  const tokens = commandLine.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+/g) ?? [];
  return tokens.map((token) =>
    token.startsWith('"') || token.startsWith("'")
      ? token.slice(1, -1).replace(/\\(["'])/g, "$1")
      : token);
}

export class ComputerTerminal {
  private readonly simulation: TopologySimulation;
  private readonly context: TerminalCommandContext;
  private readonly commandMap: ReadonlyMap<string, TerminalCommandDefinition>;
  private commandRunning = false;

  constructor(
    topology: TopologySimulationConfiguration,
    deviceId: string,
    options: ComputerTerminalOptions = {},
  ) {
    const computer = topology.devices.find((device) =>
      device.id === deviceId && device.kind === "pc");
    if (!computer) throw new Error("Ordinateur introuvable dans la topologie.");
    this.simulation = options.simulation ?? new TopologySimulation(topology);
    this.context = {
      computer,
      deviceId,
      simulation: this.simulation,
      topology,
      lineDelayMs: Math.max(0, options.lineDelayMs ?? 0),
      pingIntervalMs: Math.max(0, options.pingIntervalMs ?? 250),
    };
    this.commandMap = new Map(
      createTerminalCommands().map((command) => [command.name, command]),
    );
  }

  get events(): readonly SimulationEvent[] {
    return this.simulation.engine.events;
  }

  get commands(): readonly TerminalCommandDefinition[] {
    return [...this.commandMap.values()];
  }

  async *execute(
    commandLine: string,
    signal: AbortSignal = new AbortController().signal,
  ): AsyncGenerator<TerminalOutput> {
    if (this.commandRunning) {
      yield {
        kind: "line",
        text: "Une commande est déjà en cours ; interrompez-la avant d’en lancer une autre.",
        tone: "error",
      };
      return;
    }
    const [commandName, ...arguments_] = tokenize(commandLine);
    if (!commandName) return;
    const command = this.commandMap.get(commandName.toLowerCase());
    if (!command) {
      yield { kind: "line", text: `'${commandName}' n’est pas reconnu comme une commande interne.`, tone: "error" };
      return;
    }

    this.commandRunning = true;
    try {
      yield* command.execute(this.context, arguments_, signal);
    } catch (error) {
      if (signal.aborted) return;
      yield {
        kind: "line",
        text: `Erreur de commande : ${error instanceof Error ? error.message : "échec inconnu"}`,
        tone: "error",
      };
    } finally {
      this.commandRunning = false;
    }
  }
}

import type { SimulationEvent } from "../domain/SimulationEvent.js";
import type { TerminalCommandDefinition, TerminalOutput } from "./terminal/types.js";
import { TopologySimulation, type TopologySimulationConfiguration } from "./TopologySimulation.js";
export interface ComputerTerminalOptions {
    readonly lineDelayMs?: number;
    readonly pingIntervalMs?: number;
    readonly simulation?: TopologySimulation;
}
export declare class ComputerTerminal {
    private readonly simulation;
    private readonly context;
    private readonly commandMap;
    private commandRunning;
    constructor(topology: TopologySimulationConfiguration, deviceId: string, options?: ComputerTerminalOptions);
    get events(): readonly SimulationEvent[];
    get commands(): readonly TerminalCommandDefinition[];
    execute(commandLine: string, signal?: AbortSignal): AsyncGenerator<TerminalOutput>;
}

import type { SimulationEvent } from "../../domain/SimulationEvent.js";
import type { TopologyDeviceConfiguration, TopologySimulationConfiguration } from "../TopologySimulation.js";
import type { TopologySimulation } from "../TopologySimulation.js";
export type TerminalTone = "normal" | "info" | "success" | "error";
export type TerminalOutput = {
    readonly kind: "line";
    readonly text: string;
    readonly tone?: TerminalTone;
} | {
    readonly kind: "events";
    readonly events: readonly SimulationEvent[];
} | {
    readonly kind: "clear";
};
export interface TerminalCommandContext {
    readonly computer: TopologyDeviceConfiguration;
    readonly deviceId: string;
    readonly simulation: TopologySimulation;
    readonly topology: TopologySimulationConfiguration;
    readonly lineDelayMs: number;
    readonly pingIntervalMs: number;
}
export interface TerminalCommandDefinition {
    readonly name: string;
    readonly syntax: string;
    readonly description: string;
    execute(context: TerminalCommandContext, arguments_: readonly string[], signal: AbortSignal): AsyncGenerator<TerminalOutput>;
}

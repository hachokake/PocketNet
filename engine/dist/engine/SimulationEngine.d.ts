import { NetworkDevice, type DeviceKind } from "../domain/NetworkDevice.js";
import { Packet } from "../domain/Packet.js";
import type { SimulationEvent, SimulationEventType } from "../domain/SimulationEvent.js";
import { NetworkInterface, type DeviceId, type InterfaceId } from "../domain/NetworkInterface.js";
import { NetworkConnection } from "../domain/NetworkConnection.js";
import { NetworkTopology, type IdFactory } from "../topology/NetworkTopology.js";
export type SimulationStatus = "idle" | "running" | "paused" | "stopped";
export type Clock = () => Date;
export interface SimulationEngineOptions {
    readonly idFactory?: IdFactory;
    readonly clock?: Clock;
}
export interface PacketInput {
    readonly sourceInterfaceId: InterfaceId;
    readonly destinationInterfaceId: InterfaceId;
    readonly payload: Uint8Array;
}
export declare class SimulationEngine {
    readonly topology: NetworkTopology;
    private readonly idFactory;
    private readonly clock;
    private readonly eventLog;
    private readonly packetLog;
    private currentStatus;
    constructor(options?: SimulationEngineOptions);
    get status(): SimulationStatus;
    get events(): readonly SimulationEvent[];
    get packets(): readonly Packet[];
    createDevice(name: string, kind: DeviceKind): NetworkDevice;
    createInterface(deviceId: DeviceId, name: string, macAddress?: string): NetworkInterface;
    connectInterfaces(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): NetworkConnection;
    createPacket(input: PacketInput): Packet;
    start(): void;
    pause(): void;
    resume(): void;
    stop(): void;
    private requireStatus;
    recordEvent(type: SimulationEventType, message: string, details?: Readonly<Record<string, string>>): void;
}

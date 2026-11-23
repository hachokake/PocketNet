import { NetworkDevice, type DeviceKind } from "../domain/NetworkDevice.js";
import { Packet } from "../domain/Packet.js";
import { SimulationError } from "../domain/SimulationError.js";
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

export class SimulationEngine {
  readonly topology: NetworkTopology;
  private readonly idFactory: IdFactory;
  private readonly clock: Clock;
  private readonly eventLog: SimulationEvent[] = [];
  private readonly packetLog: Packet[] = [];
  private currentStatus: SimulationStatus = "idle";

  constructor(options: SimulationEngineOptions = {}) {
    this.idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.topology = new NetworkTopology(this.idFactory);
  }

  get status(): SimulationStatus {
    return this.currentStatus;
  }

  get events(): readonly SimulationEvent[] {
    return this.eventLog.map((event) => ({
      ...event,
      details: { ...event.details },
    }));
  }

  get packets(): readonly Packet[] {
    return [...this.packetLog];
  }

  createDevice(name: string, kind: DeviceKind): NetworkDevice {
    const device = this.topology.createDevice(name, kind);
    this.recordEvent("device-created", `Équipement « ${device.name} » créé.`, {
      deviceId: device.id,
      kind: device.kind,
    });
    return device;
  }

  createInterface(deviceId: DeviceId, name: string, macAddress?: string): NetworkInterface {
    const networkInterface = this.topology.createInterface(deviceId, name, macAddress);
    this.recordEvent("interface-created", `Interface « ${networkInterface.name} » créée.`, {
      deviceId,
      interfaceId: networkInterface.id,
      macAddress: networkInterface.macAddress,
    });
    return networkInterface;
  }

  connectInterfaces(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): NetworkConnection {
    try {
      const connection = this.topology.connectInterfaces(firstInterfaceId, secondInterfaceId);
      this.recordEvent("connection-created", "Connexion créée entre deux interfaces.", {
        connectionId: connection.id,
        firstInterfaceId,
        secondInterfaceId,
      });
      return connection;
    } catch (error) {
      if (error instanceof SimulationError) {
        this.recordEvent("connection-error", error.message, {
          code: error.code,
          firstInterfaceId,
          secondInterfaceId,
        });
      }
      throw error;
    }
  }

  createPacket(input: PacketInput): Packet {
    const source = this.topology.getInterface(input.sourceInterfaceId);
    const destination = this.topology.getInterface(input.destinationInterfaceId);
    if (!source || !destination) {
      throw new SimulationError(
        "invalid-packet",
        "Le paquet doit référencer des interfaces présentes dans la topologie.",
      );
    }

    const packet = new Packet({
      id: this.idFactory(),
      sourceInterfaceId: source.id,
      destinationInterfaceId: destination.id,
      payload: input.payload,
      createdAt: this.clock().toISOString(),
    });
    this.packetLog.push(packet);
    this.recordEvent(
      "packet-created",
      "Paquet enregistré comme structure de données ; aucun protocole ni transfert n’a été exécuté.",
      { packetId: packet.id },
    );
    return packet;
  }

  start(): void {
    this.requireStatus(["idle", "stopped"], "Le moteur ne peut démarrer que depuis l’état inactif ou arrêté.");
    this.currentStatus = "running";
    this.recordEvent(
      "simulation-started",
      "Cycle de simulation démarré ; aucun protocole réseau n’est encore exécuté.",
    );
  }

  pause(): void {
    this.requireStatus(["running"], "Seul un moteur en cours d’exécution peut être mis en pause.");
    this.currentStatus = "paused";
    this.recordEvent("simulation-paused", "Cycle de simulation mis en pause.");
  }

  resume(): void {
    this.requireStatus(["paused"], "Seul un moteur en pause peut reprendre son exécution.");
    this.currentStatus = "running";
    this.recordEvent(
      "simulation-resumed",
      "Cycle de simulation repris ; aucun protocole réseau n’est encore exécuté.",
    );
  }

  stop(): void {
    this.requireStatus(["running", "paused"], "Seul un moteur actif peut être arrêté.");
    this.currentStatus = "stopped";
    this.recordEvent(
      "simulation-stopped",
      "Cycle de simulation arrêté ; aucun protocole réseau n’a été exécuté.",
    );
  }

  private requireStatus(allowedStatuses: readonly SimulationStatus[], message: string): void {
    if (!allowedStatuses.includes(this.currentStatus)) {
      throw new SimulationError("invalid-simulation-state", message);
    }
  }

  recordEvent(
    type: SimulationEventType,
    message: string,
    details: Readonly<Record<string, string>> = {},
  ): void {
    this.eventLog.push({
      id: this.idFactory(),
      type,
      timestamp: this.clock().toISOString(),
      message,
      details: { ...details },
    });
  }
}

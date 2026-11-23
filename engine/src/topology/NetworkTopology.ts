import { NetworkConnection } from "../domain/NetworkConnection.js";
import { NetworkDevice, type DeviceKind } from "../domain/NetworkDevice.js";
import { SimulationError } from "../domain/SimulationError.js";
import { NetworkInterface } from "../domain/NetworkInterface.js";
import type { DeviceId, InterfaceId } from "../domain/NetworkInterface.js";
import { generateLocalMacAddress, normalizeMacAddress } from "../protocols/arp/arp.js";

export type IdFactory = () => string;

function createRandomId(): string {
  return globalThis.crypto.randomUUID();
}

export class NetworkTopology {
  private readonly deviceMap = new Map<DeviceId, NetworkDevice>();
  private readonly interfaceMap = new Map<InterfaceId, NetworkInterface>();
  private readonly connectionMap = new Map<string, NetworkConnection>();
  private readonly interfaceConnectionMap = new Map<InterfaceId, string>();

  constructor(private readonly idFactory: IdFactory = createRandomId) {}

  get devices(): readonly NetworkDevice[] {
    return [...this.deviceMap.values()];
  }

  get interfaces(): readonly NetworkInterface[] {
    return [...this.interfaceMap.values()];
  }

  get connections(): readonly NetworkConnection[] {
    return [...this.connectionMap.values()];
  }

  createDevice(name: string, kind: DeviceKind): NetworkDevice {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new SimulationError("invalid-device-name", "Le nom de l’équipement est obligatoire.");
    }

    const device = new NetworkDevice(this.createUniqueId(), normalizedName, kind);
    this.deviceMap.set(device.id, device);
    return device;
  }

  createInterface(deviceId: DeviceId, name: string, macAddress?: string): NetworkInterface {
    const device = this.deviceMap.get(deviceId);
    if (!device) {
      throw new SimulationError("unknown-device", `Équipement inconnu : ${deviceId}.`);
    }

    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new SimulationError("invalid-interface-name", "Le nom de l’interface est obligatoire.");
    }
    if (device.interfaces.some((networkInterface) => networkInterface.name === normalizedName)) {
      throw new SimulationError(
        "duplicate-interface-name",
        `L’interface « ${normalizedName} » existe déjà sur « ${device.name} ».`,
      );
    }

    const usedMacAddresses = new Set(
      [...this.interfaceMap.values()].map((item) => item.macAddress),
    );
    const assignedMacAddress = macAddress === undefined
      ? generateLocalMacAddress(usedMacAddresses)
      : normalizeMacAddress(macAddress);
    if (usedMacAddresses.has(assignedMacAddress)) {
      throw new SimulationError(
        "duplicate-interface-mac-address",
        `L’adresse MAC ${assignedMacAddress} est déjà utilisée dans cette topologie.`,
      );
    }

    const networkInterface = new NetworkInterface(
      this.createUniqueId(),
      device.id,
      normalizedName,
      assignedMacAddress,
    );
    device.addInterface(networkInterface);
    this.interfaceMap.set(networkInterface.id, networkInterface);
    return networkInterface;
  }

  connectInterfaces(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): NetworkConnection {
    const firstInterface = this.requireInterface(firstInterfaceId);
    const secondInterface = this.requireInterface(secondInterfaceId);

    if (firstInterface.id === secondInterface.id) {
      throw new SimulationError(
        "same-interface",
        `Une interface ne peut pas être connectée à elle-même (« ${firstInterface.name} »).`,
      );
    }
    if (firstInterface.deviceId === secondInterface.deviceId) {
      throw new SimulationError(
        "same-device",
        "Une connexion doit relier deux équipements différents.",
      );
    }
    if (this.interfaceConnectionMap.has(firstInterface.id)) {
      throw new SimulationError(
        "interface-already-connected",
        `L’interface « ${firstInterface.name} » est déjà connectée.`,
      );
    }
    if (this.interfaceConnectionMap.has(secondInterface.id)) {
      throw new SimulationError(
        "interface-already-connected",
        `L’interface « ${secondInterface.name} » est déjà connectée.`,
      );
    }

    const connection = new NetworkConnection(
      this.createUniqueId(),
      firstInterface.id,
      secondInterface.id,
    );
    this.connectionMap.set(connection.id, connection);
    this.interfaceConnectionMap.set(firstInterface.id, connection.id);
    this.interfaceConnectionMap.set(secondInterface.id, connection.id);
    return connection;
  }

  disconnect(connectionId: string): boolean {
    const connection = this.connectionMap.get(connectionId);
    if (!connection) return false;

    this.connectionMap.delete(connectionId);
    this.interfaceConnectionMap.delete(connection.firstInterfaceId);
    this.interfaceConnectionMap.delete(connection.secondInterfaceId);
    return true;
  }

  getDevice(deviceId: DeviceId): NetworkDevice | undefined {
    return this.deviceMap.get(deviceId);
  }

  getInterface(interfaceId: InterfaceId): NetworkInterface | undefined {
    return this.interfaceMap.get(interfaceId);
  }

  getConnection(connectionId: string): NetworkConnection | undefined {
    return this.connectionMap.get(connectionId);
  }

  getConnectionForInterface(interfaceId: InterfaceId): NetworkConnection | undefined {
    const connectionId = this.interfaceConnectionMap.get(interfaceId);
    return connectionId === undefined ? undefined : this.connectionMap.get(connectionId);
  }

  isConnected(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): boolean {
    const connection = this.getConnectionForInterface(firstInterfaceId);
    return connection?.includesInterface(secondInterfaceId) ?? false;
  }

  private requireInterface(interfaceId: InterfaceId): NetworkInterface {
    const networkInterface = this.interfaceMap.get(interfaceId);
    if (!networkInterface) {
      throw new SimulationError("unknown-interface", `Interface inconnue : ${interfaceId}.`);
    }
    return networkInterface;
  }

  private createUniqueId(): string {
    const id = this.idFactory();
    if (
      this.deviceMap.has(id)
      || this.interfaceMap.has(id)
      || this.connectionMap.has(id)
      || !id.trim()
    ) {
      throw new Error(`L’identifiant généré est invalide ou déjà utilisé : ${id}.`);
    }
    return id;
  }
}

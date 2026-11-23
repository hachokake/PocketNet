import type { DeviceId, NetworkInterface } from "./NetworkInterface.js";
import { SimulationError } from "./SimulationError.js";

export type DeviceKind = "router" | "switch" | "host" | "server" | "custom";

export class NetworkDevice {
  private readonly interfaceMap = new Map<string, NetworkInterface>();

  constructor(
    readonly id: DeviceId,
    readonly name: string,
    readonly kind: DeviceKind,
  ) {}

  get interfaces(): readonly NetworkInterface[] {
    return [...this.interfaceMap.values()];
  }

  addInterface(networkInterface: NetworkInterface): void {
    if (networkInterface.deviceId !== this.id) {
      throw new SimulationError(
        "interface-belongs-to-another-device",
        `L’interface « ${networkInterface.name} » appartient à un autre équipement.`,
      );
    }
    if (!networkInterface.name.trim()) {
      throw new SimulationError("invalid-interface-name", "Le nom de l’interface est obligatoire.");
    }
    if (this.interfaceMap.has(networkInterface.id)) {
      throw new SimulationError(
        "duplicate-interface-id",
        `L’identifiant d’interface « ${networkInterface.id} » existe déjà.`,
      );
    }
    if ([...this.interfaceMap.values()].some((item) => item.name === networkInterface.name)) {
      throw new SimulationError(
        "duplicate-interface-name",
        `L’interface « ${networkInterface.name} » existe déjà sur « ${this.name} ».`,
      );
    }
    this.interfaceMap.set(networkInterface.id, networkInterface);
  }
}

import { SimulationError } from "../../domain/SimulationError.js";

export type MacAddress = string;

export type ArpMessage =
  | {
      readonly operation: "request";
      readonly senderMac: MacAddress;
      readonly senderIp: string;
      readonly targetIp: string;
    }
  | {
      readonly operation: "reply";
      readonly senderMac: MacAddress;
      readonly senderIp: string;
      readonly targetMac: MacAddress;
      readonly targetIp: string;
    };

export function normalizeMacAddress(address: string): MacAddress {
  const normalized = address.toLowerCase();
  if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalized)) {
    throw new SimulationError("invalid-mac-address", `Adresse MAC invalide : ${address}.`);
  }
  return normalized;
}

export function generateLocalMacAddress(
  usedAddresses: ReadonlySet<MacAddress> = new Set(),
  randomValues = (bytes: Uint8Array): void => {
    if (!globalThis.crypto?.getRandomValues) {
      throw new SimulationError(
        "mac-random-source-unavailable",
        "Un générateur cryptographique est requis pour créer une adresse MAC.",
      );
    }
    globalThis.crypto.getRandomValues(bytes);
  },
): MacAddress {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const bytes = new Uint8Array(6);
    randomValues(bytes);
    bytes[0] = (bytes[0] & 0xfc) | 0x02;
    const address = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(":");
    if (!usedAddresses.has(address)) return address;
  }
  throw new SimulationError("mac-address-exhausted", "Impossible de générer une adresse MAC unique.");
}

export const ETHERNET_BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";

export function isMulticastMacAddress(address: MacAddress): boolean {
  return (Number.parseInt(address.slice(0, 2), 16) & 1) === 1;
}

export class ArpCache {
  private readonly entries = new Map<string, MacAddress>();

  get(ipAddress: string): MacAddress | undefined {
    return this.entries.get(ipAddress);
  }

  learn(ipAddress: string, macAddress: MacAddress): boolean {
    const changed = this.entries.get(ipAddress) !== macAddress;
    this.entries.set(ipAddress, macAddress);
    return changed;
  }

  delete(ipAddress: string): boolean {
    return this.entries.delete(ipAddress);
  }

  get snapshot(): ReadonlyMap<string, MacAddress> {
    return new Map(this.entries);
  }
}

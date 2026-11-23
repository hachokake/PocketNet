import { SimulationError } from "../../domain/SimulationError.js";
export function normalizeMacAddress(address) {
    const normalized = address.toLowerCase();
    if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalized)) {
        throw new SimulationError("invalid-mac-address", `Adresse MAC invalide : ${address}.`);
    }
    return normalized;
}
export function generateLocalMacAddress(usedAddresses = new Set(), randomValues = (bytes) => {
    if (!globalThis.crypto?.getRandomValues) {
        throw new SimulationError("mac-random-source-unavailable", "Un générateur cryptographique est requis pour créer une adresse MAC.");
    }
    globalThis.crypto.getRandomValues(bytes);
}) {
    for (let attempt = 0; attempt < 1024; attempt += 1) {
        const bytes = new Uint8Array(6);
        randomValues(bytes);
        bytes[0] = (bytes[0] & 0xfc) | 0x02;
        const address = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(":");
        if (!usedAddresses.has(address))
            return address;
    }
    throw new SimulationError("mac-address-exhausted", "Impossible de générer une adresse MAC unique.");
}
export const ETHERNET_BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";
export function isMulticastMacAddress(address) {
    return (Number.parseInt(address.slice(0, 2), 16) & 1) === 1;
}
export class ArpCache {
    entries = new Map();
    get(ipAddress) {
        return this.entries.get(ipAddress);
    }
    learn(ipAddress, macAddress) {
        const changed = this.entries.get(ipAddress) !== macAddress;
        this.entries.set(ipAddress, macAddress);
        return changed;
    }
    delete(ipAddress) {
        return this.entries.delete(ipAddress);
    }
    get snapshot() {
        return new Map(this.entries);
    }
}

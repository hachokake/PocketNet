import type { DeviceId, NetworkInterface } from "./NetworkInterface.js";
export type DeviceKind = "router" | "switch" | "host" | "server" | "custom";
export declare class NetworkDevice {
    readonly id: DeviceId;
    readonly name: string;
    readonly kind: DeviceKind;
    private readonly interfaceMap;
    constructor(id: DeviceId, name: string, kind: DeviceKind);
    get interfaces(): readonly NetworkInterface[];
    addInterface(networkInterface: NetworkInterface): void;
}

import type { InterfaceId } from "./NetworkInterface.js";
export type PacketId = string;
export interface PacketOptions {
    readonly id: PacketId;
    readonly sourceInterfaceId: InterfaceId;
    readonly destinationInterfaceId: InterfaceId;
    readonly payload: Uint8Array;
    readonly createdAt: string;
}
export declare class Packet {
    readonly id: PacketId;
    readonly sourceInterfaceId: InterfaceId;
    readonly destinationInterfaceId: InterfaceId;
    readonly payload: Uint8Array;
    readonly createdAt: string;
    constructor(options: PacketOptions);
}

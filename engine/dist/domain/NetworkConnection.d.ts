import type { InterfaceId } from "./NetworkInterface.js";
export type ConnectionId = string;
export declare class NetworkConnection {
    readonly id: ConnectionId;
    readonly firstInterfaceId: InterfaceId;
    readonly secondInterfaceId: InterfaceId;
    constructor(id: ConnectionId, firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId);
    includesInterface(interfaceId: InterfaceId): boolean;
}

import type { InterfaceId } from "./NetworkInterface.js";

export type ConnectionId = string;

export class NetworkConnection {
  constructor(
    readonly id: ConnectionId,
    readonly firstInterfaceId: InterfaceId,
    readonly secondInterfaceId: InterfaceId,
  ) {}

  includesInterface(interfaceId: InterfaceId): boolean {
    return this.firstInterfaceId === interfaceId
      || this.secondInterfaceId === interfaceId;
  }
}

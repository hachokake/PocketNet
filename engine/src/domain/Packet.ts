import type { InterfaceId } from "./NetworkInterface.js";

export type PacketId = string;

export interface PacketOptions {
  readonly id: PacketId;
  readonly sourceInterfaceId: InterfaceId;
  readonly destinationInterfaceId: InterfaceId;
  readonly payload: Uint8Array;
  readonly createdAt: string;
}

export class Packet {
  readonly id: PacketId;
  readonly sourceInterfaceId: InterfaceId;
  readonly destinationInterfaceId: InterfaceId;
  readonly payload: Uint8Array;
  readonly createdAt: string;

  constructor(options: PacketOptions) {
    this.id = options.id;
    this.sourceInterfaceId = options.sourceInterfaceId;
    this.destinationInterfaceId = options.destinationInterfaceId;
    this.payload = new Uint8Array(options.payload);
    this.createdAt = options.createdAt;
  }
}

export type InterfaceId = string;
export type DeviceId = string;

export class NetworkInterface {
  constructor(
    readonly id: InterfaceId,
    readonly deviceId: DeviceId,
    readonly name: string,
    readonly macAddress: string,
  ) {}
}

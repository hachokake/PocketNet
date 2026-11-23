export type InterfaceId = string;
export type DeviceId = string;
export declare class NetworkInterface {
    readonly id: InterfaceId;
    readonly deviceId: DeviceId;
    readonly name: string;
    readonly macAddress: string;
    constructor(id: InterfaceId, deviceId: DeviceId, name: string, macAddress: string);
}

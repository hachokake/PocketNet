import { NetworkConnection } from "../domain/NetworkConnection.js";
import { NetworkDevice, type DeviceKind } from "../domain/NetworkDevice.js";
import { NetworkInterface } from "../domain/NetworkInterface.js";
import type { DeviceId, InterfaceId } from "../domain/NetworkInterface.js";
export type IdFactory = () => string;
export declare class NetworkTopology {
    private readonly idFactory;
    private readonly deviceMap;
    private readonly interfaceMap;
    private readonly connectionMap;
    private readonly interfaceConnectionMap;
    constructor(idFactory?: IdFactory);
    get devices(): readonly NetworkDevice[];
    get interfaces(): readonly NetworkInterface[];
    get connections(): readonly NetworkConnection[];
    createDevice(name: string, kind: DeviceKind): NetworkDevice;
    createInterface(deviceId: DeviceId, name: string, macAddress?: string): NetworkInterface;
    connectInterfaces(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): NetworkConnection;
    disconnect(connectionId: string): boolean;
    getDevice(deviceId: DeviceId): NetworkDevice | undefined;
    getInterface(interfaceId: InterfaceId): NetworkInterface | undefined;
    getConnection(connectionId: string): NetworkConnection | undefined;
    getConnectionForInterface(interfaceId: InterfaceId): NetworkConnection | undefined;
    isConnected(firstInterfaceId: InterfaceId, secondInterfaceId: InterfaceId): boolean;
    private requireInterface;
    private createUniqueId;
}

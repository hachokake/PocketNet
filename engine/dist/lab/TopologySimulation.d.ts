import { SimulationEngine } from "../engine/SimulationEngine.js";
import type { SimulationEvent } from "../domain/SimulationEvent.js";
import { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
import { type SwitchPersistentConfiguration } from "../protocols/ethernet/SwitchConfiguration.js";
import type { IcmpMessage } from "../protocols/icmp/icmp.js";
export interface TopologyInterfaceConfiguration {
    readonly id: string;
    readonly name: string;
    readonly macAddress: string;
    readonly enabled: boolean;
    readonly ipv4Address?: string;
    readonly subnetMask?: string;
}
export interface TopologyDeviceConfiguration {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
    readonly interfaces: readonly TopologyInterfaceConfiguration[];
    readonly initialTtl?: number;
    readonly defaultGateway?: string;
    readonly staticRoutes?: readonly TopologyStaticRouteConfiguration[];
    readonly dnsServer?: string;
    readonly dhcpEnabled?: boolean;
    readonly icmpEnabled?: boolean;
    readonly switchConfig?: SwitchPersistentConfiguration;
}
export interface TopologyStaticRouteConfiguration {
    readonly destination: string;
    readonly subnetMask: string;
    readonly nextHop: string;
}
export interface TopologyConnectionConfiguration {
    readonly firstDeviceId: string;
    readonly secondDeviceId: string;
    readonly firstInterfaceId: string;
    readonly secondInterfaceId: string;
}
export interface TopologySimulationConfiguration {
    readonly devices: readonly TopologyDeviceConfiguration[];
    readonly connections: readonly TopologyConnectionConfiguration[];
}
export interface TopologyPingResult {
    readonly success: boolean;
    readonly sourceIp: string;
    readonly destinationIp: string;
    readonly sequence: number;
    readonly message: string;
    readonly events: readonly SimulationEvent[];
    readonly responseType?: IcmpMessage["type"];
    readonly responseIp?: string;
    readonly responseTtl?: number;
}
export declare class TopologySimulation {
    private readonly configuration;
    readonly engine: SimulationEngine;
    private readonly interfaces;
    private readonly interfaceConfigurations;
    private readonly configuredInterfaceIdsByEngineId;
    private readonly engineDevices;
    private readonly hostsByDevice;
    private readonly hostsByInterface;
    private readonly hostsByEngineInterface;
    private readonly switches;
    private readonly routerInterfaces;
    private readonly staticRoutesByDevice;
    private readonly vlanInterfaces;
    private readonly layer3HostInterfaceIds;
    private readonly pendingPings;
    private sequence;
    constructor(configuration: TopologySimulationConfiguration);
    getSwitch(deviceId: string): EthernetSwitch | undefined;
    serializeSwitchConfiguration(deviceId: string, configuration: SwitchPersistentConfiguration): SwitchPersistentConfiguration;
    traceProbe(sourceDeviceId: string, destinationIp: string, ttl: number): TopologyPingResult;
    getArpEntries(deviceId: string): readonly {
        readonly ipAddress: string;
        readonly macAddress: string;
    }[];
    clearArpEntry(deviceId: string, ipAddress: string): boolean;
    getRouteEntries(deviceId: string): readonly {
        readonly destination: string;
        readonly netmask: string;
        readonly gateway: string;
        readonly interfaceName: string;
        readonly metric: number;
    }[];
    getLayer3InterfaceEntries(deviceId: string): readonly {
        readonly name: string;
        readonly address: string;
        readonly status: "up" | "down";
        readonly protocol: "up" | "down";
    }[];
    ping(sourceDeviceId: string, destinationIp: string, initialTtl?: number, operation?: "ping" | "tracert"): TopologyPingResult;
    private createDevicesAndInterfaces;
    private mapSwitchRunningConfiguration;
    private connectEnabledInterfaces;
    private createSwitchesAndHosts;
    private forwardRouterPacket;
    private sendRouterControl;
    private normalizeStaticRoutes;
    private findRouterRoute;
    private refreshLayer3SwitchInterfaces;
    private createLayer3Host;
    private getVlanEngineInterface;
    private receiveLayer3SwitchFrame;
    private getLayer3Host;
    private getDeviceHosts;
    private getLayer3RouteEntries;
    private transmit;
    private receiveEchoReply;
    private receiveIcmpControl;
    private failPing;
    private isSwitchDevice;
    private getPingSourceConfiguration;
}

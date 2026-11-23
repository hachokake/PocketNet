import type { InterfaceId } from "../../domain/NetworkInterface.js";
import type { SimulationEventSink } from "../../domain/SimulationEvent.js";
import type { NetworkTopology } from "../../topology/NetworkTopology.js";
import { type MacAddress } from "../arp/arp.js";
import { type SwitchPersistentConfiguration, type SwitchPortConfiguration, type SwitchRunningConfiguration } from "./SwitchConfiguration.js";
import type { EthernetFrame } from "./ethernet.js";
export interface MacTableEntry {
    readonly macAddress: MacAddress;
    readonly portInterfaceId: InterfaceId;
    readonly vlanId: number;
    readonly type: "dynamic" | "static";
    readonly lastUpdated: number;
}
export interface SwitchEgress {
    readonly portInterfaceId: InterfaceId;
    readonly frame: EthernetFrame;
}
export declare class EthernetSwitch {
    readonly name: string;
    private readonly topology;
    private readonly events;
    private readonly now;
    readonly macAgingTimeMs: number;
    private readonly macTable;
    private running;
    private startup;
    private readonly switchPortIds;
    private readonly switchModel;
    constructor(name: string, portInterfaceIds: readonly InterfaceId[], topology: NetworkTopology, events: SimulationEventSink, configuration?: unknown, now?: () => number, macAgingTimeMs?: number);
    get persistentConfiguration(): SwitchPersistentConfiguration;
    get model(): SwitchPersistentConfiguration["model"];
    get runningConfiguration(): SwitchRunningConfiguration;
    get startupConfiguration(): SwitchRunningConfiguration | null;
    get portInterfaceIds(): readonly InterfaceId[];
    getPortName(portInterfaceId: InterfaceId): string;
    get macTableSnapshot(): readonly MacTableEntry[];
    getPortConfiguration(portInterfaceId: InterfaceId): SwitchPortConfiguration;
    isPortOperational(portInterfaceId: InterfaceId): boolean;
    setRunningConfiguration(configuration: SwitchRunningConfiguration): void;
    saveStartupConfiguration(): void;
    reloadStartupConfiguration(): void;
    addStaticMacAddress(macAddress: string, vlanId: number, portInterfaceId: InterfaceId): void;
    clearDynamicMacAddresses(vlanId?: number): number;
    removeVlanMacEntries(vlanId: number): void;
    receive(ingressPortId: InterfaceId, frame: EthernetFrame): readonly SwitchEgress[];
    private learnSource;
    private ingressVlan;
    private prepareEgress;
    private withVlan;
    private findMacEntry;
    private expireMacEntries;
    private macKey;
    private installStaticMacEntries;
    private assertPort;
    private assertVlanExists;
    private isPhysicallyActive;
    private portName;
    private activePorts;
    private drop;
}

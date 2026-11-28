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
export interface SwitchInterfaceCounters {
    readonly inputPackets: number;
    readonly outputPackets: number;
    readonly inputErrors: number;
    readonly outputErrors: number;
}
export interface SwitchEgress {
    readonly portInterfaceId: InterfaceId;
    readonly frame: EthernetFrame;
}
export type Layer3FrameHandler = (ingressPortId: InterfaceId, vlanId: number | null, frame: EthernetFrame) => boolean;
export declare class EthernetSwitch {
    readonly name: string;
    private readonly topology;
    private readonly events;
    private readonly now;
    private readonly macAgingTimeMsOverride?;
    private readonly macTable;
    private readonly interfaceCounters;
    private running;
    private startup;
    private readonly switchPortIds;
    private readonly switchModel;
    private layer3FrameHandler?;
    private configurationChangeHandler?;
    constructor(name: string, portInterfaceIds: readonly InterfaceId[], topology: NetworkTopology, events: SimulationEventSink, configuration?: unknown, now?: () => number, macAgingTimeMsOverride?: number | undefined);
    get persistentConfiguration(): SwitchPersistentConfiguration;
    get model(): SwitchPersistentConfiguration["model"];
    get runningConfiguration(): SwitchRunningConfiguration;
    get startupConfiguration(): SwitchRunningConfiguration | null;
    get portInterfaceIds(): readonly InterfaceId[];
    getPortName(portInterfaceId: InterfaceId): string;
    get macTableSnapshot(): readonly MacTableEntry[];
    getPortConfiguration(portInterfaceId: InterfaceId): SwitchPortConfiguration;
    getPortMacAddress(portInterfaceId: InterfaceId): string | undefined;
    getPortCounters(portInterfaceId: InterfaceId): SwitchInterfaceCounters;
    isPortOperational(portInterfaceId: InterfaceId): boolean;
    get supportsLayer3(): boolean;
    setLayer3FrameHandler(handler: Layer3FrameHandler): void;
    setConfigurationChangeHandler(handler: () => void): void;
    isVlanOperational(vlanId: number): boolean;
    setRunningConfiguration(configuration: SwitchRunningConfiguration): void;
    saveStartupConfiguration(): void;
    reloadStartupConfiguration(): void;
    addStaticMacAddress(macAddress: string, vlanId: number, portInterfaceId: InterfaceId): void;
    clearDynamicMacAddresses(vlanId?: number, portInterfaceId?: InterfaceId): number;
    removeVlanMacEntries(vlanId: number): void;
    receive(ingressPortId: InterfaceId, frame: EthernetFrame): readonly SwitchEgress[];
    forwardFromVlan(vlanId: number, frame: EthernetFrame): readonly SwitchEgress[];
    recordRoutedOutput(portInterfaceId: InterfaceId): void;
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
    private incrementCounter;
    private isPhysicallyActive;
    private portName;
    private activePorts;
    private drop;
}

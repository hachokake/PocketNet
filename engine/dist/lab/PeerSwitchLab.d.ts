import { SimulationEngine } from "../engine/SimulationEngine.js";
import type { NetworkDevice } from "../domain/NetworkDevice.js";
import type { NetworkInterface } from "../domain/NetworkInterface.js";
import type { SimulationEvent } from "../domain/SimulationEvent.js";
import { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
import { type IPv4Configuration } from "../protocols/ipv4/address.js";
import { SimulatedHost } from "./SimulatedHost.js";
export interface PeerSwitchLabOptions {
    readonly pc1?: Partial<PcConfiguration>;
    readonly pc2?: Partial<PcConfiguration>;
    readonly switchPortCount?: number;
}
export interface PcConfiguration extends IPv4Configuration {
    readonly macAddress: string;
}
export interface PingResult {
    readonly success: boolean;
    readonly sourceIp: string;
    readonly destinationIp: string;
    readonly sequence: number;
    readonly message: string;
    readonly events: readonly SimulationEvent[];
}
export declare class PeerSwitchLab {
    readonly engine: SimulationEngine;
    readonly pc1: SimulatedHost;
    readonly pc2: SimulatedHost;
    readonly switchDevice: NetworkDevice;
    readonly ethernetSwitch: EthernetSwitch;
    readonly pc1Configuration: PcConfiguration;
    readonly pc2Configuration: PcConfiguration;
    readonly pc1SwitchPort: NetworkInterface;
    readonly pc2SwitchPort: NetworkInterface;
    private readonly hostsByInterface;
    private sequence;
    private pendingPing;
    constructor(options?: PeerSwitchLabOptions);
    ping(destinationIp?: string): PingResult;
    private normalizePcConfiguration;
    private transmit;
    private receiveEchoReply;
    private failPing;
}

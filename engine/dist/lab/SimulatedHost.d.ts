import type { NetworkDevice } from "../domain/NetworkDevice.js";
import type { NetworkInterface } from "../domain/NetworkInterface.js";
import type { SimulationEventSink } from "../domain/SimulationEvent.js";
import { ArpCache, type MacAddress } from "../protocols/arp/arp.js";
import { type EthernetFrame, type IPv4Packet } from "../protocols/ethernet/ethernet.js";
import { type IPv4Configuration } from "../protocols/ipv4/address.js";
export type FrameTransmitter = (sourceInterfaceId: string, frame: EthernetFrame) => void;
export type EchoReplyHandler = (packet: IPv4Packet) => void;
export type IcmpControlHandler = (packet: IPv4Packet) => void;
export type IPv4ForwardHandler = (packet: IPv4Packet, sourceMac: MacAddress) => void;
export interface SimulatedHostOptions {
    readonly device: NetworkDevice;
    readonly networkInterface: NetworkInterface;
    readonly macAddress: string;
    readonly ipv4: IPv4Configuration;
    readonly initialTtl?: number;
    readonly icmpAllowed?: boolean;
    readonly transmit: FrameTransmitter;
    readonly events: SimulationEventSink;
    readonly onEchoReply: EchoReplyHandler;
    readonly onIcmpControl?: IcmpControlHandler;
    readonly onForwardPacket?: IPv4ForwardHandler;
}
export declare class SimulatedHost {
    private readonly options;
    readonly device: NetworkDevice;
    readonly networkInterface: NetworkInterface;
    readonly macAddress: MacAddress;
    readonly ipv4: IPv4Configuration;
    readonly initialTtl: number;
    readonly icmpAllowed: boolean;
    readonly arpCache: ArpCache;
    constructor(options: SimulatedHostOptions);
    sendArpRequest(targetIp: string): void;
    sendIPv4Packet(destinationMac: MacAddress, packet: IPv4Packet): void;
    deliverLocalEchoRequest(request: IPv4Packet): void;
    receiveFrame(frame: EthernetFrame): void;
    private receiveArp;
    private receiveIPv4;
    private learnArpEntry;
    private sendFrame;
}

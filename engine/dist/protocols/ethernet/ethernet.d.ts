import type { ArpMessage, MacAddress } from "../arp/arp.js";
import type { IcmpMessage } from "../icmp/icmp.js";
export type EtherType = "ARP" | "IPv4";
export declare const DEFAULT_IPV4_TTL = 128;
export declare function validateIPv4Ttl(ttl: number): number;
export interface IPv4Packet {
    readonly sourceIp: string;
    readonly destinationIp: string;
    readonly ttl: number;
    readonly payload: IcmpMessage;
}
interface EthernetFrameHeader {
    readonly sourceMac: MacAddress;
    readonly destinationMac: MacAddress;
    readonly vlanId?: number;
}
export type EthernetFrame = (EthernetFrameHeader & {
    readonly etherType: "ARP";
    readonly payload: ArpMessage;
}) | (EthernetFrameHeader & {
    readonly etherType: "IPv4";
    readonly payload: IPv4Packet;
});
export {};

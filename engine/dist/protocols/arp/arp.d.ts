export type MacAddress = string;
export type ArpMessage = {
    readonly operation: "request";
    readonly senderMac: MacAddress;
    readonly senderIp: string;
    readonly targetIp: string;
} | {
    readonly operation: "reply";
    readonly senderMac: MacAddress;
    readonly senderIp: string;
    readonly targetMac: MacAddress;
    readonly targetIp: string;
};
export declare function normalizeMacAddress(address: string): MacAddress;
export declare function generateLocalMacAddress(usedAddresses?: ReadonlySet<MacAddress>, randomValues?: (bytes: Uint8Array) => void): MacAddress;
export declare const ETHERNET_BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";
export declare function isMulticastMacAddress(address: MacAddress): boolean;
export declare class ArpCache {
    private readonly entries;
    get(ipAddress: string): MacAddress | undefined;
    learn(ipAddress: string, macAddress: MacAddress): boolean;
    delete(ipAddress: string): boolean;
    get snapshot(): ReadonlyMap<string, MacAddress>;
}

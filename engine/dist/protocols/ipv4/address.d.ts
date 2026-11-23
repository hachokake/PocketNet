export interface IPv4Configuration {
    readonly address: string;
    readonly subnetMask: string;
}
export declare function normalizeIPv4Address(address: string): string;
export declare function validateIPv4Configuration(configuration: IPv4Configuration): IPv4Configuration;
export declare function getNetworkAddress(address: string, subnetMask: string): string;
export declare function getSubnetPrefixLength(subnetMask: string): number;
export declare function isSameSubnet(firstAddress: string, secondAddress: string, subnetMask: string): boolean;

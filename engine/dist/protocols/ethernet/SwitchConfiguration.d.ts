import type { InterfaceId } from "../../domain/NetworkInterface.js";
export type SwitchPortMode = "access" | "trunk";
export type AllowedVlanSet = "all" | readonly number[];
export declare const CATALYST_2960_MODEL: "catalyst-2960";
export type SwitchModel = typeof CATALYST_2960_MODEL;
export interface SwitchPortConfiguration {
    readonly enabled: boolean;
    readonly mode: SwitchPortMode;
    readonly accessVlan: number;
    readonly nativeVlan: number;
    readonly allowedVlans: AllowedVlanSet;
    readonly description: string;
    readonly speedMbps: 10 | 100 | 1000 | "auto";
    readonly duplex: "half" | "full" | "auto";
}
export interface SwitchVlan {
    readonly id: number;
    readonly name: string;
    readonly status: "active";
}
export interface SwitchStaticMacEntry {
    readonly macAddress: string;
    readonly vlanId: number;
    readonly portInterfaceId: InterfaceId;
}
export interface SwitchRunningConfiguration {
    readonly hostname: string;
    readonly vlans: readonly SwitchVlan[];
    readonly ports: Readonly<Record<InterfaceId, SwitchPortConfiguration>>;
    readonly staticMacEntries: readonly SwitchStaticMacEntry[];
    readonly consoleLine: {
        readonly loginRequired: boolean;
        readonly password: string;
    };
}
export interface SwitchPersistentConfiguration {
    readonly model: SwitchModel;
    readonly running: SwitchRunningConfiguration;
    readonly startup: SwitchRunningConfiguration | null;
}
export declare function isReservedVlanId(vlanId: number): boolean;
export declare function defaultSwitchPortConfiguration(): SwitchPortConfiguration;
export declare function createDefaultSwitchConfiguration(hostname: string, portIds: readonly InterfaceId[], model?: SwitchModel): SwitchPersistentConfiguration;
export declare function normalizeSwitchConfiguration(value: unknown, hostname: string, portIds: readonly InterfaceId[]): SwitchPersistentConfiguration;
export declare function isVlanAllowed(allowedVlans: AllowedVlanSet, vlanId: number): boolean;

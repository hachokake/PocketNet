import { type SwitchPersistentConfiguration } from "../protocols/ethernet/SwitchConfiguration.js";
import type { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
export type SwitchTerminalMode = "user" | "privileged" | "global" | "interface" | "vlan" | "line";
export interface SwitchTerminalResult {
    readonly output: string;
    readonly tone: "normal" | "error" | "info";
}
export interface SwitchTerminalState {
    readonly mode: SwitchTerminalMode;
    readonly selectedPorts: readonly string[];
    readonly selectedVlanId: number | null;
    readonly authenticated: boolean;
    readonly awaitingPassword: boolean;
}
export interface SwitchTerminalOptions {
    readonly onConfigurationChange: (configuration: SwitchPersistentConfiguration) => void;
    readonly ping?: (destinationIp: string) => {
        readonly success: boolean;
        readonly message: string;
    };
    readonly getLayer3Interfaces?: () => readonly {
        readonly name: string;
        readonly address: string;
        readonly status: "up" | "down";
        readonly protocol: "up" | "down";
    }[];
    readonly getRouteEntries?: () => readonly {
        readonly destination: string;
        readonly netmask: string;
        readonly gateway: string;
        readonly interfaceName: string;
        readonly metric: number;
    }[];
    readonly getArpEntries?: () => readonly {
        readonly ipAddress: string;
        readonly macAddress: string;
    }[];
}
export declare class SwitchTerminal {
    private readonly networkSwitch;
    private readonly options;
    mode: SwitchTerminalMode;
    private selectedPorts;
    private selectedVlanId;
    private authenticated;
    private awaitingPassword;
    constructor(networkSwitch: EthernetSwitch, options: SwitchTerminalOptions);
    get prompt(): string;
    execute(commandLine: string): SwitchTerminalResult;
    complete(line: string): string;
    snapshot(): SwitchTerminalState;
    restoreState(state: unknown): void;
    private authenticate;
    private commandsForMode;
    private executeUser;
    private executePrivileged;
    private executeGlobal;
    private executeGlobalNo;
    private configureGlobalIp;
    private configureInterfaceIp;
    private resetSelectedPorts;
    private updateSelectedVlanInterface;
    private setSelectedPortSwitchport;
    private executeInterface;
    private executeInterfaceNo;
    private configureSwitchport;
    private executeVlan;
    private executeLine;
    private show;
    private showInterfaces;
    private showIp;
    private showArp;
    private showMacTable;
    private clear;
    private configureMac;
    private addStaticMac;
    private removeStaticMac;
    private resolvePorts;
    private updateSelectedPorts;
    private updateSelectedPortsForEach;
    private saveStartup;
    private changeRunning;
    private renderVlans;
    private renderPortStatus;
    private renderInterfaceDetails;
    private renderSwitchportDetails;
    private renderInterfaceCounters;
    private renderInterfaceDescriptions;
    private renderInterfaceConfiguration;
    private renderLayer3Interfaces;
    private renderRoutes;
    private renderVlanInterfaceConfiguration;
    private renderTrunks;
    private renderMacTable;
    private renderMacTableCount;
    private renderMacAgingTime;
    private renderConfiguration;
    private renderPortConfiguration;
    private helpText;
    private interfaceShowCompletions;
    private completions;
    private incomplete;
    private invalid;
    private stpUnavailable;
    private error;
    private info;
    private normal;
}

export type SimulationErrorCode = "invalid-device-name" | "invalid-interface-name" | "unknown-device" | "unknown-interface" | "duplicate-interface-name" | "duplicate-interface-id" | "interface-belongs-to-another-device" | "interface-already-connected" | "same-interface" | "same-device" | "invalid-packet" | "invalid-mac-address" | "duplicate-interface-mac-address" | "mac-random-source-unavailable" | "mac-address-exhausted" | "invalid-ipv4-address" | "invalid-subnet-mask" | "invalid-switch-port-count" | "duplicate-host-mac-address" | "duplicate-host-ip-address" | "invalid-simulation-state";
export declare class SimulationError extends Error {
    readonly code: SimulationErrorCode;
    constructor(code: SimulationErrorCode, message: string);
}

export type SimulationEventType = "device-created" | "interface-created" | "connection-created" | "connection-error" | "packet-created" | "simulation-started" | "simulation-resumed" | "simulation-paused" | "simulation-stopped" | "ethernet-frame-sent" | "ethernet-frame-received" | "ethernet-frame-forwarded" | "ethernet-frame-flooded" | "ethernet-frame-dropped" | "interface-down" | "duplicate-ip-address" | "switch-mac-learned" | "switch-mac-moved" | "switch-mac-table-cleared" | "arp-request-sent" | "arp-request-received" | "arp-reply-sent" | "arp-reply-received" | "arp-cache-learned" | "arp-cache-cleared" | "arp-resolution-failed" | "ipv4-packet-sent" | "ipv4-packet-created" | "ipv4-packet-received" | "ipv4-packet-forwarded" | "ipv4-ttl-decremented" | "ipv4-packet-dropped" | "ipv4-configuration-error" | "icmp-echo-request-sent" | "icmp-echo-request-received" | "icmp-echo-reply-sent" | "icmp-echo-reply-received" | "icmp-request-blocked" | "icmp-time-exceeded" | "icmp-destination-unreachable" | "icmp-ping-succeeded" | "icmp-ping-failed" | "icmp-ping-started" | "icmp-trace-probe-started" | "lab-ready";
export interface SimulationEvent {
    readonly id: string;
    readonly type: SimulationEventType;
    readonly timestamp: string;
    readonly message: string;
    readonly details: Readonly<Record<string, string>>;
}
export interface SimulationEventSink {
    recordEvent(type: SimulationEventType, message: string, details?: Readonly<Record<string, string>>): void;
}

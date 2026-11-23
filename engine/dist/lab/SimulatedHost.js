import { ArpCache, ETHERNET_BROADCAST_MAC, normalizeMacAddress } from "../protocols/arp/arp.js";
import { DEFAULT_IPV4_TTL, validateIPv4Ttl, } from "../protocols/ethernet/ethernet.js";
import { normalizeIPv4Address, validateIPv4Configuration } from "../protocols/ipv4/address.js";
export class SimulatedHost {
    options;
    device;
    networkInterface;
    macAddress;
    ipv4;
    initialTtl;
    icmpAllowed;
    arpCache = new ArpCache();
    constructor(options) {
        this.options = options;
        this.device = options.device;
        this.networkInterface = options.networkInterface;
        this.macAddress = normalizeMacAddress(options.macAddress);
        this.ipv4 = validateIPv4Configuration(options.ipv4);
        this.initialTtl = validateIPv4Ttl(options.initialTtl ?? DEFAULT_IPV4_TTL);
        this.icmpAllowed = options.icmpAllowed ?? true;
        if (options.device.id !== options.networkInterface.deviceId) {
            throw new Error("L’interface du poste doit appartenir à son équipement.");
        }
        if (this.networkInterface.macAddress !== this.macAddress) {
            throw new Error("L’adresse MAC du poste doit correspondre à celle de son interface.");
        }
    }
    sendArpRequest(targetIp) {
        const normalizedTargetIp = normalizeIPv4Address(targetIp);
        const payload = {
            operation: "request",
            senderMac: this.macAddress,
            senderIp: this.ipv4.address,
            targetIp: normalizedTargetIp,
        };
        this.options.events.recordEvent("arp-request-sent", `${this.options.device.name} demande l’adresse MAC de ${normalizedTargetIp}.`, {
            layer: "ARP",
            host: this.options.device.name,
            senderIp: this.ipv4.address,
            senderMac: this.macAddress,
            targetIp: normalizedTargetIp,
        });
        this.sendFrame({
            sourceMac: this.macAddress,
            destinationMac: ETHERNET_BROADCAST_MAC,
            etherType: "ARP",
            payload,
        });
    }
    sendIPv4Packet(destinationMac, packet) {
        validateIPv4Ttl(packet.ttl);
        const message = packet.payload;
        if (message.type === "echo-request") {
            this.options.events.recordEvent("icmp-echo-request-sent", `${this.options.device.name} envoie un ICMP Echo Request à ${packet.destinationIp}.`, {
                layer: "ICMP",
                host: this.options.device.name,
                destinationIp: packet.destinationIp,
                sequence: String(message.sequence),
            });
        }
        if (message.type === "destination-unreachable") {
            this.options.events.recordEvent("icmp-destination-unreachable", `${this.options.device.name} signale une destination inaccessible.`, {
                layer: "ICMP",
                host: this.options.device.name,
                destinationIp: packet.destinationIp,
                sequence: String(message.sequence),
            });
        }
        this.options.events.recordEvent("ipv4-packet-sent", `${this.options.device.name} transmet un paquet IPv4 vers ${packet.destinationIp} avec un TTL de ${packet.ttl}.`, {
            layer: "IPv4",
            host: this.options.device.name,
            sourceIp: packet.sourceIp,
            destinationIp: packet.destinationIp,
            ttl: String(packet.ttl),
        });
        this.sendFrame({
            sourceMac: this.macAddress,
            destinationMac,
            etherType: "IPv4",
            payload: packet,
        });
    }
    deliverLocalEchoRequest(request) {
        validateIPv4Ttl(request.ttl);
        if (request.sourceIp !== this.ipv4.address
            || request.destinationIp !== this.ipv4.address
            || request.payload.type !== "echo-request") {
            throw new Error("Un paquet ICMP local doit viser l’adresse IPv4 active de cet hôte.");
        }
        const sequence = request.payload.sequence;
        this.options.events.recordEvent("icmp-echo-request-sent", `${this.options.device.name} remet localement un Echo Request à ${this.ipv4.address}.`, {
            layer: "ICMP",
            host: this.options.device.name,
            sourceIp: this.ipv4.address,
            destinationIp: this.ipv4.address,
            sequence: String(sequence),
            ttl: String(request.ttl),
            delivery: "local",
        });
        this.options.events.recordEvent("ipv4-packet-received", `${this.options.device.name} remet localement le paquet IPv4 à sa pile réseau.`, {
            layer: "IPv4",
            host: this.options.device.name,
            sourceIp: this.ipv4.address,
            destinationIp: this.ipv4.address,
            ttl: String(request.ttl),
            delivery: "local",
        });
        if (!this.icmpAllowed) {
            this.options.events.recordEvent("icmp-request-blocked", `${this.options.device.name} refuse la requête ICMP Echo locale.`, {
                layer: "ICMP",
                host: this.options.device.name,
                sourceIp: this.ipv4.address,
                sequence: String(sequence),
                delivery: "local",
            });
            return;
        }
        this.options.events.recordEvent("icmp-echo-request-received", `${this.options.device.name} traite localement l’Echo Request ${sequence}.`, {
            layer: "ICMP",
            host: this.options.device.name,
            sourceIp: this.ipv4.address,
            sequence: String(sequence),
            delivery: "local",
        });
        const reply = {
            sourceIp: this.ipv4.address,
            destinationIp: this.ipv4.address,
            ttl: this.initialTtl,
            payload: {
                type: "echo-reply",
                identifier: request.payload.identifier,
                sequence,
            },
        };
        this.options.events.recordEvent("ipv4-packet-created", `${this.options.device.name} crée un Echo Reply IPv4 avec un TTL initial de ${reply.ttl}.`, {
            layer: "IPv4",
            host: this.options.device.name,
            sourceIp: reply.sourceIp,
            destinationIp: reply.destinationIp,
            initialTtl: String(reply.ttl),
        });
        this.options.events.recordEvent("icmp-echo-reply-sent", `${this.options.device.name} génère localement l’Echo Reply ${sequence}.`, {
            layer: "ICMP",
            host: this.options.device.name,
            destinationIp: this.ipv4.address,
            sequence: String(sequence),
            ttl: String(reply.ttl),
            delivery: "local",
        });
        this.options.events.recordEvent("icmp-echo-reply-received", `${this.options.device.name} reçoit localement l’Echo Reply ${sequence}.`, {
            layer: "ICMP",
            host: this.options.device.name,
            sourceIp: this.ipv4.address,
            sequence: String(sequence),
            ttl: String(reply.ttl),
            delivery: "local",
        });
        this.options.onEchoReply(reply);
    }
    receiveFrame(frame) {
        if (frame.destinationMac !== this.macAddress
            && frame.destinationMac !== ETHERNET_BROADCAST_MAC) {
            return;
        }
        this.options.events.recordEvent("ethernet-frame-received", `${this.options.device.name} reçoit une trame ${frame.etherType}.`, {
            layer: "L2",
            host: this.options.device.name,
            sourceMac: frame.sourceMac,
            destinationMac: frame.destinationMac,
            etherType: frame.etherType,
        });
        if (frame.etherType === "ARP") {
            this.receiveArp(frame.payload);
        }
        else {
            this.receiveIPv4(frame.payload, frame.sourceMac);
        }
    }
    receiveArp(message) {
        if (message.operation === "request") {
            this.options.events.recordEvent("arp-request-received", `${this.options.device.name} reçoit une requête ARP pour ${message.targetIp}.`, {
                layer: "ARP",
                host: this.options.device.name,
                senderIp: message.senderIp,
                senderMac: message.senderMac,
                targetIp: message.targetIp,
            });
            this.learnArpEntry(message.senderIp, message.senderMac);
            if (message.targetIp !== this.ipv4.address)
                return;
            const reply = {
                operation: "reply",
                senderMac: this.macAddress,
                senderIp: this.ipv4.address,
                targetMac: message.senderMac,
                targetIp: message.senderIp,
            };
            this.options.events.recordEvent("arp-reply-sent", `${this.options.device.name} répond à la requête ARP de ${message.senderIp}.`, {
                layer: "ARP",
                host: this.options.device.name,
                senderIp: this.ipv4.address,
                senderMac: this.macAddress,
                targetIp: message.senderIp,
                targetMac: message.senderMac,
            });
            this.sendFrame({
                sourceMac: this.macAddress,
                destinationMac: message.senderMac,
                etherType: "ARP",
                payload: reply,
            });
            return;
        }
        if (message.targetIp !== this.ipv4.address || message.targetMac !== this.macAddress)
            return;
        this.options.events.recordEvent("arp-reply-received", `${this.options.device.name} reçoit l’adresse MAC de ${message.senderIp}.`, {
            layer: "ARP",
            host: this.options.device.name,
            senderIp: message.senderIp,
            senderMac: message.senderMac,
        });
        this.learnArpEntry(message.senderIp, message.senderMac);
    }
    receiveIPv4(packet, sourceMac) {
        if (packet.destinationIp !== this.ipv4.address) {
            this.options.onForwardPacket?.(packet, sourceMac);
            return;
        }
        this.options.events.recordEvent("ipv4-packet-received", `${this.options.device.name} reçoit un paquet IPv4 de ${packet.sourceIp}.`, {
            layer: "IPv4",
            host: this.options.device.name,
            sourceIp: packet.sourceIp,
            destinationIp: packet.destinationIp,
            ttl: String(packet.ttl),
        });
        if (packet.payload.type === "echo-request") {
            if (!this.icmpAllowed) {
                this.options.events.recordEvent("icmp-request-blocked", `${this.options.device.name} refuse la requête ICMP Echo.`, {
                    layer: "ICMP",
                    host: this.options.device.name,
                    sourceIp: packet.sourceIp,
                    sequence: String(packet.payload.sequence),
                });
                return;
            }
            this.options.events.recordEvent("icmp-echo-request-received", `${this.options.device.name} reçoit l’Echo Request ${packet.payload.sequence}.`, {
                layer: "ICMP",
                host: this.options.device.name,
                sourceIp: packet.sourceIp,
                sequence: String(packet.payload.sequence),
            });
            const reply = {
                sourceIp: this.ipv4.address,
                destinationIp: packet.sourceIp,
                ttl: this.initialTtl,
                payload: {
                    type: "echo-reply",
                    identifier: packet.payload.identifier,
                    sequence: packet.payload.sequence,
                },
            };
            this.options.events.recordEvent("ipv4-packet-created", `${this.options.device.name} crée un Echo Reply IPv4 avec un TTL initial de ${reply.ttl}.`, {
                layer: "IPv4",
                host: this.options.device.name,
                sourceIp: reply.sourceIp,
                destinationIp: reply.destinationIp,
                initialTtl: String(reply.ttl),
            });
            this.options.events.recordEvent("icmp-echo-reply-sent", `${this.options.device.name} prépare l’Echo Reply ${packet.payload.sequence}.`, {
                layer: "ICMP",
                host: this.options.device.name,
                destinationIp: packet.sourceIp,
                sequence: String(packet.payload.sequence),
            });
            this.sendIPv4Packet(sourceMac, reply);
            return;
        }
        if (packet.payload.type === "echo-reply") {
            this.options.events.recordEvent("icmp-echo-reply-received", `${this.options.device.name} reçoit l’Echo Reply ${packet.payload.sequence}.`, {
                layer: "ICMP",
                host: this.options.device.name,
                sourceIp: packet.sourceIp,
                sequence: String(packet.payload.sequence),
            });
            this.options.onEchoReply(packet);
            return;
        }
        this.options.events.recordEvent(packet.payload.type === "time-exceeded" ? "icmp-time-exceeded" : "icmp-destination-unreachable", packet.payload.type === "time-exceeded"
            ? `${this.options.device.name} reçoit un message ICMP Time Exceeded de ${packet.sourceIp}.`
            : `${this.options.device.name} reçoit un message ICMP Destination Unreachable de ${packet.sourceIp}.`, {
            layer: "ICMP",
            host: this.options.device.name,
            sourceIp: packet.sourceIp,
            sequence: String(packet.payload.sequence),
        });
        this.options.onIcmpControl?.(packet);
    }
    learnArpEntry(ipAddress, macAddress) {
        if (!this.arpCache.learn(ipAddress, macAddress))
            return;
        this.options.events.recordEvent("arp-cache-learned", `${this.options.device.name} mémorise ${ipAddress} → ${macAddress}.`, { layer: "ARP", host: this.options.device.name, ipAddress, macAddress });
    }
    sendFrame(frame) {
        this.options.events.recordEvent("ethernet-frame-sent", `${this.options.device.name} émet une trame ${frame.etherType} (${frame.sourceMac} → ${frame.destinationMac}).`, {
            layer: "L2",
            host: this.options.device.name,
            sourceMac: frame.sourceMac,
            destinationMac: frame.destinationMac,
            etherType: frame.etherType,
        });
        this.options.transmit(this.options.networkInterface.id, frame);
    }
}

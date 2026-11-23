import { SimulationEngine } from "../engine/SimulationEngine.js";
import { SimulationError } from "../domain/SimulationError.js";
import { normalizeMacAddress } from "../protocols/arp/arp.js";
import { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
import { normalizeIPv4Address, isSameSubnet, validateIPv4Configuration } from "../protocols/ipv4/address.js";
import { SimulatedHost } from "./SimulatedHost.js";
const DEFAULT_PC1 = {
    macAddress: "02:00:00:00:00:01",
    address: "192.168.10.1",
    subnetMask: "255.255.255.0",
};
const DEFAULT_PC2 = {
    macAddress: "02:00:00:00:00:02",
    address: "192.168.10.2",
    subnetMask: "255.255.255.0",
};
export class PeerSwitchLab {
    engine;
    pc1;
    pc2;
    switchDevice;
    ethernetSwitch;
    pc1Configuration;
    pc2Configuration;
    pc1SwitchPort;
    pc2SwitchPort;
    hostsByInterface = new Map();
    sequence = 0;
    pendingPing;
    constructor(options = {}) {
        const portCount = options.switchPortCount ?? 8;
        if (!Number.isInteger(portCount) || portCount < 2) {
            throw new SimulationError("invalid-switch-port-count", "Le commutateur doit avoir au moins deux ports.");
        }
        this.pc1Configuration = this.normalizePcConfiguration(DEFAULT_PC1, options.pc1);
        this.pc2Configuration = this.normalizePcConfiguration(DEFAULT_PC2, options.pc2);
        if (this.pc1Configuration.macAddress === this.pc2Configuration.macAddress) {
            throw new SimulationError("duplicate-host-mac-address", "PC1 et PC2 doivent avoir des adresses MAC différentes.");
        }
        if (this.pc1Configuration.address === this.pc2Configuration.address) {
            throw new SimulationError("duplicate-host-ip-address", "PC1 et PC2 doivent avoir des adresses IPv4 différentes.");
        }
        this.engine = new SimulationEngine();
        const pc1Device = this.engine.createDevice("PC1", "host");
        const pc2Device = this.engine.createDevice("PC2", "host");
        this.switchDevice = this.engine.createDevice("Switch Ethernet", "switch");
        const pc1Interface = this.engine.createInterface(pc1Device.id, "eth0", this.pc1Configuration.macAddress);
        const pc2Interface = this.engine.createInterface(pc2Device.id, "eth0", this.pc2Configuration.macAddress);
        const switchPorts = Array.from({ length: portCount }, (_, index) => this.engine.createInterface(this.switchDevice.id, `port${index + 1}`));
        this.pc1SwitchPort = switchPorts[0];
        this.pc2SwitchPort = switchPorts[1];
        this.engine.connectInterfaces(pc1Interface.id, this.pc1SwitchPort.id);
        this.engine.connectInterfaces(pc2Interface.id, this.pc2SwitchPort.id);
        const transmit = (sourceInterfaceId, frame) => this.transmit(sourceInterfaceId, frame);
        const onEchoReply = (packet) => this.receiveEchoReply(packet);
        this.pc1 = new SimulatedHost({
            device: pc1Device,
            networkInterface: pc1Interface,
            macAddress: this.pc1Configuration.macAddress,
            ipv4: this.pc1Configuration,
            transmit,
            events: this.engine,
            onEchoReply,
        });
        this.pc2 = new SimulatedHost({
            device: pc2Device,
            networkInterface: pc2Interface,
            macAddress: this.pc2Configuration.macAddress,
            ipv4: this.pc2Configuration,
            transmit,
            events: this.engine,
            onEchoReply,
        });
        this.hostsByInterface.set(pc1Interface.id, this.pc1);
        this.hostsByInterface.set(pc2Interface.id, this.pc2);
        this.ethernetSwitch = new EthernetSwitch(this.switchDevice.name, switchPorts.map((networkInterface) => networkInterface.id), this.engine.topology, this.engine);
        this.engine.recordEvent("lab-ready", "Laboratoire prêt : PC1 et PC2 sont reliés au switch par deux câbles Ethernet.", {
            pc1Mac: this.pc1.macAddress,
            pc1Ip: this.pc1.ipv4.address,
            pc2Mac: this.pc2.macAddress,
            pc2Ip: this.pc2.ipv4.address,
            cableCount: "2",
        });
    }
    ping(destinationIp = this.pc2.ipv4.address) {
        const normalizedDestinationIp = normalizeIPv4Address(destinationIp);
        const startIndex = this.engine.events.length;
        const sequence = ++this.sequence;
        const pending = {
            destinationIp: normalizedDestinationIp,
            sequence,
            success: false,
        };
        this.pendingPing = pending;
        this.engine.recordEvent("icmp-ping-started", `PC1 démarre un ping vers ${normalizedDestinationIp}.`, {
            layer: "ICMP",
            sourceIp: this.pc1.ipv4.address,
            destinationIp: normalizedDestinationIp,
            sequence: String(sequence),
        });
        if (!isSameSubnet(this.pc1.ipv4.address, normalizedDestinationIp, this.pc1.ipv4.subnetMask)) {
            return this.failPing(startIndex, pending, "icmp-destination-unreachable", `Aucune passerelle n’est configurée pour joindre ${normalizedDestinationIp} hors du sous-réseau local.`);
        }
        let destinationMac = this.pc1.arpCache.get(normalizedDestinationIp);
        if (!destinationMac) {
            this.pc1.sendArpRequest(normalizedDestinationIp);
            destinationMac = this.pc1.arpCache.get(normalizedDestinationIp);
        }
        if (!destinationMac) {
            return this.failPing(startIndex, pending, "arp-resolution-failed", `Aucune réponse ARP reçue pour ${normalizedDestinationIp} ; le ping ne peut pas commencer.`);
        }
        const request = {
            sourceIp: this.pc1.ipv4.address,
            destinationIp: normalizedDestinationIp,
            ttl: this.pc1.initialTtl,
            payload: { type: "echo-request", identifier: 1, sequence },
        };
        this.engine.recordEvent("ipv4-packet-created", `PC1 crée un Echo Request IPv4 avec un TTL initial de ${request.ttl}.`, {
            layer: "IPv4",
            host: "PC1",
            sourceIp: request.sourceIp,
            destinationIp: request.destinationIp,
            initialTtl: String(request.ttl),
        });
        this.pc1.sendIPv4Packet(destinationMac, request);
        if (!pending.success) {
            return this.failPing(startIndex, pending, "icmp-ping-failed", `Aucune réponse ICMP reçue de ${normalizedDestinationIp}.`);
        }
        return {
            success: true,
            sourceIp: this.pc1.ipv4.address,
            destinationIp: normalizedDestinationIp,
            sequence,
            message: `Réponse de ${normalizedDestinationIp} : le ping a réussi dans le simulateur.`,
            events: this.engine.events.slice(startIndex),
        };
    }
    normalizePcConfiguration(defaults, overrides) {
        const ipv4 = validateIPv4Configuration({
            address: overrides?.address ?? defaults.address,
            subnetMask: overrides?.subnetMask ?? defaults.subnetMask,
        });
        return {
            macAddress: normalizeMacAddress(overrides?.macAddress ?? defaults.macAddress),
            ...ipv4,
        };
    }
    transmit(sourceInterfaceId, frame) {
        const connection = this.engine.topology.getConnectionForInterface(sourceInterfaceId);
        if (!connection) {
            this.engine.recordEvent("ethernet-frame-dropped", `Trame abandonnée : aucune connexion sur l’interface ${sourceInterfaceId}.`, { layer: "L2", sourceInterfaceId });
            return;
        }
        const switchPortId = connection.firstInterfaceId === sourceInterfaceId
            ? connection.secondInterfaceId
            : connection.firstInterfaceId;
        const egresses = this.ethernetSwitch.receive(switchPortId, frame);
        egresses.forEach(({ portInterfaceId, frame: forwardedFrame }) => {
            const portConnection = this.engine.topology.getConnectionForInterface(portInterfaceId);
            if (!portConnection)
                return;
            const peerInterfaceId = portConnection.firstInterfaceId === portInterfaceId
                ? portConnection.secondInterfaceId
                : portConnection.firstInterfaceId;
            const host = this.hostsByInterface.get(peerInterfaceId);
            if (host)
                host.receiveFrame(forwardedFrame);
        });
    }
    receiveEchoReply(packet) {
        const pending = this.pendingPing;
        if (!pending
            || packet.payload.type !== "echo-reply"
            || packet.destinationIp !== this.pc1.ipv4.address
            || packet.sourceIp !== pending.destinationIp
            || packet.payload.sequence !== pending.sequence) {
            return;
        }
        pending.success = true;
        this.engine.recordEvent("icmp-ping-succeeded", `PC1 reçoit l’Echo Reply ${pending.sequence} de ${packet.sourceIp}.`, {
            layer: "ICMP",
            sourceIp: this.pc1.ipv4.address,
            destinationIp: packet.sourceIp,
            sequence: String(pending.sequence),
        });
    }
    failPing(startIndex, pending, eventType, message) {
        this.engine.recordEvent(eventType, message, {
            layer: eventType === "arp-resolution-failed" ? "ARP" : "ICMP",
            sourceIp: this.pc1.ipv4.address,
            destinationIp: pending.destinationIp,
            sequence: String(pending.sequence),
        });
        if (eventType !== "icmp-ping-failed") {
            this.engine.recordEvent("icmp-ping-failed", message, {
                layer: "ICMP",
                sourceIp: this.pc1.ipv4.address,
                destinationIp: pending.destinationIp,
                sequence: String(pending.sequence),
            });
        }
        return {
            success: false,
            sourceIp: this.pc1.ipv4.address,
            destinationIp: pending.destinationIp,
            sequence: pending.sequence,
            message,
            events: this.engine.events.slice(startIndex),
        };
    }
}

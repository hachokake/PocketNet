import { SimulationEngine } from "../engine/SimulationEngine.js";
import { normalizeMacAddress } from "../protocols/arp/arp.js";
import { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
import { defaultSwitchPortConfiguration, } from "../protocols/ethernet/SwitchConfiguration.js";
import { DEFAULT_IPV4_TTL, validateIPv4Ttl, } from "../protocols/ethernet/ethernet.js";
import { getNetworkAddress, getSubnetPrefixLength, isSameSubnet, normalizeIPv4Address, validateIPv4Configuration, } from "../protocols/ipv4/address.js";
import { SimulatedHost } from "./SimulatedHost.js";
export class TopologySimulation {
    configuration;
    engine = new SimulationEngine();
    interfaces = new Map();
    interfaceConfigurations = new Map();
    configuredInterfaceIdsByEngineId = new Map();
    engineDevices = new Map();
    hostsByDevice = new Map();
    hostsByInterface = new Map();
    hostsByEngineInterface = new Map();
    switches = new Map();
    routerInterfaces = new Map();
    staticRoutesByDevice = new Map();
    pendingPings = new Map();
    sequence = 0;
    constructor(configuration) {
        this.configuration = configuration;
        this.createDevicesAndInterfaces();
        this.connectEnabledInterfaces();
        this.createSwitchesAndHosts();
    }
    getSwitch(deviceId) {
        return this.switches.get(deviceId);
    }
    serializeSwitchConfiguration(deviceId, configuration) {
        const device = this.configuration.devices.find((candidate) => candidate.id === deviceId && candidate.kind === "switch");
        if (!device)
            throw new Error(`Le commutateur ${deviceId} est introuvable.`);
        const serializeRunning = (running) => ({
            ...running,
            ports: Object.fromEntries(device.interfaces.map((networkInterface) => {
                const engineInterface = this.interfaces.get(networkInterface.id);
                const port = engineInterface && running.ports[engineInterface.id];
                return [
                    networkInterface.id,
                    port ?? defaultSwitchPortConfiguration(),
                ];
            })),
            staticMacEntries: running.staticMacEntries.map((entry) => {
                const interfaceId = this.configuredInterfaceIdsByEngineId.get(entry.portInterfaceId);
                if (!interfaceId)
                    throw new Error(`Le port ${entry.portInterfaceId} n’a pas d’identifiant de laboratoire.`);
                return { ...entry, portInterfaceId: interfaceId };
            }),
        });
        return {
            model: configuration.model,
            running: serializeRunning(configuration.running),
            startup: configuration.startup ? serializeRunning(configuration.startup) : null,
        };
    }
    traceProbe(sourceDeviceId, destinationIp, ttl) {
        if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
            throw new Error("La durée de vie du paquet doit être comprise entre 1 et 255.");
        }
        return this.ping(sourceDeviceId, destinationIp, ttl, "tracert");
    }
    getArpEntries(deviceId) {
        const hostConfiguration = this.hostsByDevice.get(deviceId);
        const host = hostConfiguration
            && this.hostsByInterface.get(hostConfiguration.networkInterface.id);
        return host
            ? [...host.arpCache.snapshot].map(([ipAddress, macAddress]) => ({ ipAddress, macAddress }))
            : [];
    }
    clearArpEntry(deviceId, ipAddress) {
        const hostConfiguration = this.hostsByDevice.get(deviceId);
        const host = hostConfiguration
            && this.hostsByInterface.get(hostConfiguration.networkInterface.id);
        const normalizedAddress = normalizeIPv4Address(ipAddress);
        const deleted = host?.arpCache.delete(normalizedAddress) ?? false;
        if (deleted) {
            this.engine.recordEvent("arp-cache-cleared", `${hostConfiguration?.device.name ?? deviceId} supprime l’entrée ARP de ${normalizedAddress}.`, { layer: "ARP", deviceId, ipAddress: normalizedAddress });
        }
        return deleted;
    }
    getRouteEntries(deviceId) {
        const device = this.configuration.devices.find((item) => item.id === deviceId && item.kind === "pc");
        if (!device)
            return [];
        const routes = [];
        for (const networkInterface of device.interfaces) {
            if (!networkInterface.enabled || !networkInterface.ipv4Address)
                continue;
            const ipv4 = validateIPv4Configuration({
                address: networkInterface.ipv4Address,
                subnetMask: networkInterface.subnetMask || "255.255.255.0",
            });
            routes.push({
                destination: getNetworkAddress(ipv4.address, ipv4.subnetMask),
                netmask: ipv4.subnetMask,
                gateway: "On-link",
                interfaceName: networkInterface.name,
                metric: 10,
            });
            if (device.defaultGateway) {
                routes.push({
                    destination: "0.0.0.0",
                    netmask: "0.0.0.0",
                    gateway: normalizeIPv4Address(device.defaultGateway),
                    interfaceName: networkInterface.name,
                    metric: 25,
                });
            }
        }
        return routes;
    }
    ping(sourceDeviceId, destinationIp, initialTtl, operation = "ping") {
        const normalizedDestinationIp = normalizeIPv4Address(destinationIp);
        const startIndex = this.engine.events.length;
        const sequence = ++this.sequence;
        const source = this.hostsByDevice.get(sourceDeviceId);
        const sourceIp = source?.ipv4?.address ?? "";
        const packetTtl = validateIPv4Ttl(initialTtl ?? source?.device.initialTtl ?? DEFAULT_IPV4_TTL);
        const pending = {
            destinationIp: normalizedDestinationIp,
            sequence,
            success: false,
        };
        this.pendingPings.set(sourceDeviceId, pending);
        this.engine.recordEvent(operation === "ping" ? "icmp-ping-started" : "icmp-trace-probe-started", `${source?.device.name ?? sourceDeviceId} démarre ${operation === "ping" ? `un ping avec un TTL initial de ${packetTtl}` : `une sonde tracert TTL=${packetTtl}`} vers ${normalizedDestinationIp}.`, {
            layer: operation === "ping" ? "ICMP" : "TRACEROUTE",
            sourceIp,
            destinationIp: normalizedDestinationIp,
            sequence: String(sequence),
            initialTtl: String(packetTtl),
        });
        if (!source) {
            return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, "Cet équipement ne possède pas de terminal réseau.");
        }
        if (!source.networkInterface.enabled) {
            return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, `L’interface ${source.networkInterface.name} est désactivée.`, "interface-down");
        }
        if (source.device.dhcpEnabled) {
            return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, "Aucune adresse IPv4 n’est attribuée : aucun serveur DHCP n’est disponible dans cette simulation.", "icmp-destination-unreachable");
        }
        if (!source.ipv4) {
            return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, source.configurationError ?? "Configurez une adresse IPv4 valide avant d’utiliser ping.", "icmp-destination-unreachable");
        }
        if (source.device.icmpEnabled === false) {
            return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, "ICMP est désactivé sur l’ordinateur source.", "icmp-destination-unreachable");
        }
        let nextHopIp = normalizedDestinationIp;
        if (!isSameSubnet(source.ipv4.address, normalizedDestinationIp, source.ipv4.subnetMask)) {
            if (!source.device.defaultGateway) {
                return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `Aucune passerelle n’est configurée pour joindre ${normalizedDestinationIp} hors du sous-réseau local.`, "icmp-destination-unreachable");
            }
            try {
                nextHopIp = normalizeIPv4Address(source.device.defaultGateway);
            }
            catch {
                return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, "La passerelle configurée n’est pas une adresse IPv4 valide.", "icmp-destination-unreachable");
            }
            if (!isSameSubnet(source.ipv4.address, nextHopIp, source.ipv4.subnetMask)) {
                return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `La passerelle ${nextHopIp} n’est pas joignable sur le sous-réseau local.`, "icmp-destination-unreachable");
            }
        }
        const duplicateAddress = [
            ...this.hostsByDevice.values(),
            ...[...this.routerInterfaces.values()].flat(),
        ].filter((host) => host.ipv4?.address === normalizedDestinationIp);
        if (duplicateAddress.length > 1) {
            return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `L’adresse IPv4 ${normalizedDestinationIp} est configurée sur plusieurs ordinateurs.`, "duplicate-ip-address");
        }
        const sourceHost = this.hostsByInterface.get(source.networkInterface.id);
        if (!sourceHost) {
            return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, "L’interface source n’est pas disponible pour la simulation.");
        }
        if (normalizedDestinationIp === source.ipv4.address) {
            const request = {
                sourceIp: source.ipv4.address,
                destinationIp: normalizedDestinationIp,
                ttl: packetTtl,
                payload: { type: "echo-request", identifier: 1, sequence },
            };
            this.engine.recordEvent("ipv4-packet-created", `${source.device.name} crée un Echo Request IPv4 avec un TTL initial de ${packetTtl}.`, {
                layer: "IPv4",
                host: source.device.name,
                sourceIp: request.sourceIp,
                destinationIp: request.destinationIp,
                initialTtl: String(packetTtl),
            });
            sourceHost.deliverLocalEchoRequest(request);
            if (!pending.success) {
                return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `Aucune réponse ICMP reçue de ${normalizedDestinationIp}.`);
            }
            return {
                success: true,
                sourceIp: source.ipv4.address,
                destinationIp: normalizedDestinationIp,
                sequence,
                message: `Réponse ICMP reçue localement de ${normalizedDestinationIp}.`,
                responseType: pending.responseType,
                responseIp: pending.responseIp,
                responseTtl: pending.responseTtl,
                events: this.engine.events.slice(startIndex),
            };
        }
        let destinationMac = sourceHost.arpCache.get(nextHopIp);
        if (!destinationMac) {
            sourceHost.sendArpRequest(nextHopIp);
            destinationMac = sourceHost.arpCache.get(nextHopIp);
        }
        if (!destinationMac) {
            return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `Aucune réponse ARP reçue pour ${nextHopIp} ; vérifiez les interfaces et les câbles.`, "arp-resolution-failed");
        }
        const request = {
            sourceIp: source.ipv4.address,
            destinationIp: normalizedDestinationIp,
            ttl: packetTtl,
            payload: { type: "echo-request", identifier: 1, sequence },
        };
        this.engine.recordEvent("ipv4-packet-created", `${source.device.name} crée un Echo Request IPv4 avec un TTL initial de ${packetTtl}.`, {
            layer: "IPv4",
            host: source.device.name,
            sourceIp: request.sourceIp,
            destinationIp: request.destinationIp,
            initialTtl: String(packetTtl),
        });
        sourceHost.sendIPv4Packet(destinationMac, request);
        if (pending.responseType === "time-exceeded") {
            return {
                success: false,
                sourceIp: source.ipv4.address,
                destinationIp: normalizedDestinationIp,
                sequence,
                message: `TTL expiré sur ${pending.responseIp ?? "un routeur"}.`,
                responseType: pending.responseType,
                responseIp: pending.responseIp,
                responseTtl: pending.responseTtl,
                events: this.engine.events.slice(startIndex),
            };
        }
        if (pending.responseType === "destination-unreachable") {
            return {
                success: false,
                sourceIp: source.ipv4.address,
                destinationIp: normalizedDestinationIp,
                sequence,
                message: `Destination inaccessible via ${pending.responseIp ?? "le routeur"}.`,
                responseType: pending.responseType,
                responseIp: pending.responseIp,
                responseTtl: pending.responseTtl,
                events: this.engine.events.slice(startIndex),
            };
        }
        if (!pending.success) {
            return this.failPing(startIndex, source.ipv4.address, normalizedDestinationIp, sequence, `Aucune réponse ICMP reçue de ${normalizedDestinationIp}.`);
        }
        return {
            success: true,
            sourceIp: source.ipv4.address,
            destinationIp: normalizedDestinationIp,
            sequence,
            message: `Réponse ICMP reçue de ${normalizedDestinationIp}.`,
            responseType: pending.responseType,
            responseIp: pending.responseIp,
            responseTtl: pending.responseTtl,
            events: this.engine.events.slice(startIndex),
        };
    }
    createDevicesAndInterfaces() {
        for (const device of this.configuration.devices) {
            const kind = device.kind === "switch"
                ? "switch"
                : device.kind === "router"
                    ? "router"
                    : device.kind === "server"
                        ? "server"
                        : "host";
            const engineDevice = this.engine.createDevice(device.name, kind);
            this.engineDevices.set(device.id, engineDevice);
            if (device.kind === "router") {
                this.staticRoutesByDevice.set(device.id, this.normalizeStaticRoutes(device));
            }
            for (const networkInterface of device.interfaces) {
                const engineInterface = this.engine.createInterface(engineDevice.id, networkInterface.name, networkInterface.macAddress);
                this.interfaces.set(networkInterface.id, engineInterface);
                this.configuredInterfaceIdsByEngineId.set(engineInterface.id, networkInterface.id);
                this.interfaceConfigurations.set(networkInterface.id, networkInterface);
            }
        }
    }
    mapSwitchRunningConfiguration(device, running) {
        return {
            ...running,
            ports: Object.fromEntries(device.interfaces.map((networkInterface) => {
                const engineInterface = this.interfaces.get(networkInterface.id);
                if (!engineInterface)
                    throw new Error(`L’interface ${networkInterface.id} n’a pas été créée.`);
                return [
                    engineInterface.id,
                    running.ports[networkInterface.id] ?? defaultSwitchPortConfiguration(),
                ];
            })),
            staticMacEntries: running.staticMacEntries.map((entry) => {
                const engineInterface = this.interfaces.get(entry.portInterfaceId);
                if (!engineInterface)
                    throw new Error(`Le port statique ${entry.portInterfaceId} n’existe pas.`);
                return { ...entry, portInterfaceId: engineInterface.id };
            }),
        };
    }
    connectEnabledInterfaces() {
        for (const connection of this.configuration.connections) {
            const first = this.interfaceConfigurations.get(connection.firstInterfaceId);
            const second = this.interfaceConfigurations.get(connection.secondInterfaceId);
            const firstInterface = this.interfaces.get(connection.firstInterfaceId);
            const secondInterface = this.interfaces.get(connection.secondInterfaceId);
            if (!first || !second || !firstInterface || !secondInterface || !first.enabled || !second.enabled)
                continue;
            this.engine.connectInterfaces(firstInterface.id, secondInterface.id);
        }
    }
    createSwitchesAndHosts() {
        for (const device of this.configuration.devices) {
            const engineDevice = this.engineDevices.get(device.id);
            if (!engineDevice)
                continue;
            if (device.kind === "switch") {
                const portIds = device.interfaces
                    .map((networkInterface) => this.interfaces.get(networkInterface.id)?.id)
                    .filter((id) => id !== undefined);
                const switchConfiguration = device.switchConfig
                    ? {
                        model: device.switchConfig.model,
                        running: this.mapSwitchRunningConfiguration(device, device.switchConfig.running),
                        startup: device.switchConfig.startup
                            ? this.mapSwitchRunningConfiguration(device, device.switchConfig.startup)
                            : null,
                    }
                    : undefined;
                this.switches.set(device.id, new EthernetSwitch(engineDevice.name, portIds, this.engine.topology, this.engine, switchConfiguration));
                continue;
            }
            if (device.kind === "router") {
                const routerInterfaces = [];
                for (const networkInterface of device.interfaces) {
                    const engineInterface = this.interfaces.get(networkInterface.id);
                    if (!engineInterface || !networkInterface.enabled || !networkInterface.ipv4Address)
                        continue;
                    let ipv4;
                    try {
                        ipv4 = validateIPv4Configuration({
                            address: networkInterface.ipv4Address,
                            subnetMask: networkInterface.subnetMask || "255.255.255.0",
                        });
                    }
                    catch (error) {
                        this.engine.recordEvent("ipv4-configuration-error", `${device.name} : configuration IP invalide sur ${networkInterface.name} : ${error instanceof Error ? error.message : "adresse inconnue"}`, { layer: "IPv4", deviceId: device.id, interfaceId: networkInterface.id });
                        continue;
                    }
                    const hostConfiguration = {
                        device,
                        networkInterface,
                        engineDevice,
                        engineInterface,
                        ipv4,
                    };
                    const host = new SimulatedHost({
                        device: engineDevice,
                        networkInterface: engineInterface,
                        macAddress: normalizeMacAddress(networkInterface.macAddress),
                        ipv4,
                        initialTtl: device.initialTtl,
                        transmit: (sourceInterfaceId, frame) => this.transmit(sourceInterfaceId, frame),
                        events: this.engine,
                        onEchoReply: () => undefined,
                        onForwardPacket: (packet) => this.forwardRouterPacket(hostConfiguration, packet),
                    });
                    routerInterfaces.push(hostConfiguration);
                    this.hostsByInterface.set(networkInterface.id, host);
                    this.hostsByEngineInterface.set(engineInterface.id, host);
                }
                this.routerInterfaces.set(device.id, routerInterfaces);
                continue;
            }
            if (device.kind !== "pc" && device.kind !== "laptop")
                continue;
            const networkInterface = device.interfaces[0];
            const engineInterface = networkInterface && this.interfaces.get(networkInterface.id);
            if (!networkInterface || !engineInterface)
                continue;
            let ipv4;
            let configurationError;
            if (!device.dhcpEnabled && networkInterface.ipv4Address) {
                try {
                    ipv4 = validateIPv4Configuration({
                        address: networkInterface.ipv4Address,
                        subnetMask: networkInterface.subnetMask || "255.255.255.0",
                    });
                }
                catch (error) {
                    configurationError = error instanceof Error ? error.message : "Configuration IPv4 invalide.";
                }
            }
            const hostConfiguration = {
                device,
                networkInterface,
                engineDevice,
                engineInterface,
                ...(ipv4 ? { ipv4 } : {}),
                ...(configurationError ? { configurationError } : {}),
            };
            this.hostsByDevice.set(device.id, hostConfiguration);
            if (!ipv4 || !networkInterface.enabled)
                continue;
            const host = new SimulatedHost({
                device: engineDevice,
                networkInterface: engineInterface,
                macAddress: normalizeMacAddress(networkInterface.macAddress),
                ipv4,
                initialTtl: device.initialTtl,
                icmpAllowed: device.icmpEnabled !== false,
                transmit: (sourceInterfaceId, frame) => this.transmit(sourceInterfaceId, frame),
                events: this.engine,
                onEchoReply: (packet) => this.receiveEchoReply(device.id, packet),
                onIcmpControl: (packet) => this.receiveIcmpControl(device.id, packet),
            });
            this.hostsByInterface.set(networkInterface.id, host);
            this.hostsByEngineInterface.set(engineInterface.id, host);
        }
    }
    forwardRouterPacket(ingress, packet) {
        const ingressHost = this.hostsByEngineInterface.get(ingress.engineInterface.id);
        if (!ingressHost || !ingress.ipv4)
            return;
        this.engine.recordEvent("ipv4-packet-received", `${ingress.device.name} reçoit un paquet IPv4 destiné à ${packet.destinationIp} avec un TTL de ${packet.ttl}.`, {
            layer: "IPv4",
            deviceId: ingress.device.id,
            interfaceId: ingress.networkInterface.id,
            sourceIp: packet.sourceIp,
            destinationIp: packet.destinationIp,
            ttl: String(packet.ttl),
        });
        const remainingTtl = packet.ttl - 1;
        this.engine.recordEvent("ipv4-ttl-decremented", `${ingress.device.name} décrémente le TTL de ${packet.ttl} à ${remainingTtl}.`, {
            layer: "IPv4",
            deviceId: ingress.device.id,
            interfaceId: ingress.networkInterface.id,
            sourceIp: packet.sourceIp,
            destinationIp: packet.destinationIp,
            ttlBefore: String(packet.ttl),
            ttlAfter: String(remainingTtl),
        });
        if (remainingTtl <= 0) {
            this.engine.recordEvent("ipv4-packet-dropped", `${ingress.device.name} abandonne le paquet IPv4 : le TTL a atteint ${remainingTtl}.`, {
                layer: "IPv4",
                deviceId: ingress.device.id,
                interfaceId: ingress.networkInterface.id,
                sourceIp: packet.sourceIp,
                destinationIp: packet.destinationIp,
                ttl: String(remainingTtl),
                reason: "ttl-expired",
            });
            this.engine.recordEvent("icmp-time-exceeded", `${ingress.device.name} génère ICMP Time Exceeded : le TTL original (${packet.ttl}) a expiré.`, {
                layer: "ICMP",
                deviceId: ingress.device.id,
                sourceIp: packet.sourceIp,
                destinationIp: packet.destinationIp,
                sequence: String(packet.payload.sequence),
                expiredTtl: String(packet.ttl),
            });
            this.sendRouterControl(ingress, packet, {
                type: "time-exceeded",
                sequence: packet.payload.sequence,
                expiredTtl: packet.ttl,
            });
            return;
        }
        const route = this.findRouterRoute(ingress.device.id, packet.destinationIp);
        if (!route) {
            this.sendRouterControl(ingress, packet, {
                type: "destination-unreachable",
                sequence: packet.payload.sequence,
                reason: "Aucune route connectée ne correspond à la destination.",
            });
            return;
        }
        const egressHost = this.hostsByEngineInterface.get(route.egress.engineInterface.id);
        if (!egressHost) {
            this.engine.recordEvent("ipv4-packet-dropped", `${ingress.device.name} abandonne le paquet : l’interface de sortie n’est pas active.`, {
                layer: "IPv4",
                deviceId: ingress.device.id,
                egressInterfaceId: route.egress.networkInterface.id,
                destinationIp: packet.destinationIp,
                ttl: String(remainingTtl),
                reason: "egress-interface-down",
            });
            return;
        }
        let destinationMac = egressHost.arpCache.get(route.nextHopIp);
        if (!destinationMac) {
            egressHost.sendArpRequest(route.nextHopIp);
            destinationMac = egressHost.arpCache.get(route.nextHopIp);
        }
        if (!destinationMac) {
            this.engine.recordEvent("arp-resolution-failed", `${ingress.device.name} ne peut pas résoudre le prochain saut ${route.nextHopIp} sur ${route.egress.networkInterface.name}.`, {
                layer: "ARP",
                deviceId: ingress.device.id,
                interfaceId: route.egress.networkInterface.id,
                targetIp: route.nextHopIp,
            });
            return;
        }
        this.engine.recordEvent("ipv4-packet-forwarded", `${ingress.device.name} achemine un paquet de ${packet.sourceIp} vers ${packet.destinationIp} via ${route.egress.networkInterface.name}.`, {
            layer: "IPv4",
            deviceId: ingress.device.id,
            ingressInterfaceId: ingress.networkInterface.id,
            egressInterfaceId: route.egress.networkInterface.id,
            nextHopIp: route.nextHopIp,
            sourceIp: packet.sourceIp,
            destinationIp: packet.destinationIp,
            ttl: String(remainingTtl),
        });
        egressHost.sendIPv4Packet(destinationMac, { ...packet, ttl: remainingTtl });
    }
    sendRouterControl(ingress, originalPacket, message) {
        const route = this.findRouterRoute(ingress.device.id, originalPacket.sourceIp);
        if (!route) {
            this.engine.recordEvent("ipv4-packet-dropped", `${ingress.device.name} ne peut pas acheminer le message ICMP vers ${originalPacket.sourceIp}.`, {
                layer: "IPv4",
                deviceId: ingress.device.id,
                sourceIp: originalPacket.sourceIp,
                reason: "no-return-route",
            });
            return;
        }
        const egressHost = this.hostsByEngineInterface.get(route.egress.engineInterface.id);
        const egressIpv4 = route.egress.ipv4;
        if (!egressHost || !egressIpv4) {
            this.engine.recordEvent("ipv4-packet-dropped", `${ingress.device.name} ne peut pas émettre le message ICMP sur l’interface de retour.`, {
                layer: "IPv4",
                deviceId: ingress.device.id,
                egressInterfaceId: route.egress.networkInterface.id,
                sourceIp: originalPacket.sourceIp,
                reason: "egress-interface-down",
            });
            return;
        }
        let destinationMac = egressHost.arpCache.get(route.nextHopIp);
        if (!destinationMac) {
            egressHost.sendArpRequest(route.nextHopIp);
            destinationMac = egressHost.arpCache.get(route.nextHopIp);
        }
        if (!destinationMac) {
            this.engine.recordEvent("arp-resolution-failed", `${ingress.device.name} ne peut pas résoudre le prochain saut ${route.nextHopIp} pour son message ICMP.`, {
                layer: "ARP",
                deviceId: ingress.device.id,
                interfaceId: route.egress.networkInterface.id,
                targetIp: route.nextHopIp,
            });
            return;
        }
        const response = {
            sourceIp: egressIpv4.address,
            destinationIp: originalPacket.sourceIp,
            ttl: egressHost.initialTtl,
            payload: message,
        };
        this.engine.recordEvent("ipv4-packet-created", `${ingress.device.name} crée un message ICMP IPv4 avec un TTL initial de ${response.ttl}.`, {
            layer: "IPv4",
            host: ingress.device.name,
            sourceIp: response.sourceIp,
            destinationIp: response.destinationIp,
            initialTtl: String(response.ttl),
        });
        egressHost.sendIPv4Packet(destinationMac, response);
    }
    normalizeStaticRoutes(device) {
        return (device.staticRoutes ?? []).flatMap((route, index) => {
            try {
                const configuration = validateIPv4Configuration({
                    address: route.destination,
                    subnetMask: route.subnetMask,
                });
                return [{
                        destination: getNetworkAddress(configuration.address, configuration.subnetMask),
                        subnetMask: configuration.subnetMask,
                        nextHop: normalizeIPv4Address(route.nextHop),
                        prefixLength: getSubnetPrefixLength(configuration.subnetMask),
                    }];
            }
            catch (error) {
                this.engine.recordEvent("ipv4-configuration-error", `${device.name} : route statique ${index + 1} invalide : ${error instanceof Error ? error.message : "configuration inconnue"}`, { layer: "IPv4", deviceId: device.id, routeIndex: String(index) });
                return [];
            }
        });
    }
    findRouterRoute(routerDeviceId, destinationIp) {
        const interfaces = this.routerInterfaces.get(routerDeviceId) ?? [];
        const candidates = [];
        interfaces.forEach((networkInterface) => {
            if (networkInterface.ipv4
                && isSameSubnet(networkInterface.ipv4.address, destinationIp, networkInterface.ipv4.subnetMask)) {
                candidates.push({
                    egress: networkInterface,
                    nextHopIp: destinationIp,
                    prefixLength: getSubnetPrefixLength(networkInterface.ipv4.subnetMask),
                });
            }
        });
        (this.staticRoutesByDevice.get(routerDeviceId) ?? []).forEach((route) => {
            if (!isSameSubnet(destinationIp, route.destination, route.subnetMask))
                return;
            const egress = interfaces.find((networkInterface) => networkInterface.ipv4 && isSameSubnet(networkInterface.ipv4.address, route.nextHop, networkInterface.ipv4.subnetMask));
            if (egress) {
                candidates.push({
                    egress,
                    nextHopIp: route.nextHop,
                    prefixLength: route.prefixLength,
                });
            }
        });
        return candidates.sort((first, second) => second.prefixLength - first.prefixLength)[0];
    }
    transmit(sourceInterfaceId, frame, traversedSwitches = new Set()) {
        const connection = this.engine.topology.getConnectionForInterface(sourceInterfaceId);
        if (!connection) {
            this.engine.recordEvent("ethernet-frame-dropped", `Trame abandonnée : aucune connexion active sur l’interface ${sourceInterfaceId}.`, { layer: "L2", sourceInterfaceId });
            return;
        }
        const peerInterfaceId = connection.firstInterfaceId === sourceInterfaceId
            ? connection.secondInterfaceId
            : connection.firstInterfaceId;
        const peerInterface = this.engine.topology.getInterface(peerInterfaceId);
        const peerDevice = peerInterface && this.engine.topology.getDevice(peerInterface.deviceId);
        if (!peerInterface || !peerDevice)
            return;
        if (peerDevice.kind === "switch") {
            const switchDeviceId = [...this.engineDevices]
                .find(([, candidate]) => candidate.id === peerDevice.id)?.[0];
            const ethernetSwitch = switchDeviceId && this.switches.get(switchDeviceId);
            if (!ethernetSwitch)
                return;
            if (traversedSwitches.has(switchDeviceId)) {
                this.engine.recordEvent("ethernet-frame-dropped", `Trame abandonnée : boucle détectée à travers ${peerDevice.name}.`, { layer: "L2", deviceId: peerDevice.id });
                return;
            }
            const nextPath = new Set(traversedSwitches);
            nextPath.add(switchDeviceId);
            ethernetSwitch.receive(peerInterface.id, frame).forEach((egress) => this.transmit(egress.portInterfaceId, egress.frame, nextPath));
            return;
        }
        const host = this.hostsByEngineInterface.get(peerInterface.id);
        if (host) {
            if (frame.vlanId !== undefined) {
                this.engine.recordEvent("ethernet-frame-dropped", `Trame 802.1Q marquée VLAN ${frame.vlanId} abandonnée : ${peerDevice.name} ne traite pas les tags VLAN.`, {
                    layer: "L2",
                    deviceId: peerDevice.id,
                    interfaceId: peerInterface.id,
                    vlanId: String(frame.vlanId),
                });
                return;
            }
            host.receiveFrame(frame);
        }
        else {
            this.engine.recordEvent("ethernet-frame-dropped", `Trame abandonnée : ${peerDevice.name} ne possède pas d’hôte actif sur ${peerInterface.name}.`, { layer: "L2", deviceId: peerDevice.id, interfaceId: peerInterface.id });
        }
    }
    receiveEchoReply(sourceDeviceId, packet) {
        const pending = this.pendingPings.get(sourceDeviceId);
        const source = this.hostsByDevice.get(sourceDeviceId);
        if (!pending
            || !source?.ipv4
            || packet.payload.type !== "echo-reply"
            || packet.destinationIp !== source.ipv4.address
            || packet.sourceIp !== pending.destinationIp
            || packet.payload.sequence !== pending.sequence) {
            return;
        }
        pending.success = true;
        pending.responseType = packet.payload.type;
        pending.responseIp = packet.sourceIp;
        pending.responseTtl = packet.ttl;
        this.engine.recordEvent("icmp-ping-succeeded", `${source.device.name} reçoit l’Echo Reply ${pending.sequence} de ${packet.sourceIp}.`, {
            layer: "ICMP",
            sourceIp: source.ipv4.address,
            destinationIp: packet.sourceIp,
            sequence: String(pending.sequence),
        });
    }
    receiveIcmpControl(sourceDeviceId, packet) {
        const pending = this.pendingPings.get(sourceDeviceId);
        const source = this.hostsByDevice.get(sourceDeviceId);
        if (!pending
            || !source?.ipv4
            || (packet.payload.type !== "time-exceeded" && packet.payload.type !== "destination-unreachable")
            || packet.destinationIp !== source.ipv4.address
            || packet.payload.sequence !== pending.sequence) {
            return;
        }
        pending.responseType = packet.payload.type;
        pending.responseIp = packet.sourceIp;
        pending.responseTtl = packet.ttl;
    }
    failPing(startIndex, sourceIp, destinationIp, sequence, message, eventType = "icmp-ping-failed") {
        this.engine.recordEvent(eventType, message, {
            layer: eventType === "arp-resolution-failed" ? "ARP" : "ICMP",
            sourceIp,
            destinationIp,
            sequence: String(sequence),
        });
        if (eventType !== "icmp-ping-failed") {
            this.engine.recordEvent("icmp-ping-failed", message, {
                layer: "ICMP",
                sourceIp,
                destinationIp,
                sequence: String(sequence),
            });
        }
        return {
            success: false,
            sourceIp,
            destinationIp,
            sequence,
            message,
            events: this.engine.events.slice(startIndex),
        };
    }
}

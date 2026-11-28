import { SimulationEngine } from "../engine/SimulationEngine.js";
import type { NetworkDevice } from "../domain/NetworkDevice.js";
import type { NetworkInterface } from "../domain/NetworkInterface.js";
import type { SimulationEvent } from "../domain/SimulationEvent.js";
import { normalizeMacAddress } from "../protocols/arp/arp.js";
import { EthernetSwitch } from "../protocols/ethernet/EthernetSwitch.js";
import {
  CATALYST_3560_MODEL,
  createDefaultSwitchConfiguration,
  defaultSwitchPortConfiguration,
  type SwitchPersistentConfiguration,
  type SwitchRunningConfiguration,
} from "../protocols/ethernet/SwitchConfiguration.js";
import {
  DEFAULT_IPV4_TTL,
  validateIPv4Ttl,
  type EthernetFrame,
  type IPv4Packet,
} from "../protocols/ethernet/ethernet.js";
import {
  getNetworkAddress,
  getSubnetPrefixLength,
  isSameSubnet,
  normalizeIPv4Address,
  validateIPv4Configuration,
  type IPv4Configuration,
} from "../protocols/ipv4/address.js";
import { SimulatedHost } from "./SimulatedHost.js";
import type { IcmpMessage } from "../protocols/icmp/icmp.js";

export interface TopologyInterfaceConfiguration {
  readonly id: string;
  readonly name: string;
  readonly macAddress: string;
  readonly enabled: boolean;
  readonly ipv4Address?: string;
  readonly subnetMask?: string;
}

export interface TopologyDeviceConfiguration {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly interfaces: readonly TopologyInterfaceConfiguration[];
  readonly initialTtl?: number;
  readonly defaultGateway?: string;
  readonly staticRoutes?: readonly TopologyStaticRouteConfiguration[];
  readonly dnsServer?: string;
  readonly dhcpEnabled?: boolean;
  readonly icmpEnabled?: boolean;
  readonly switchConfig?: SwitchPersistentConfiguration;
}

export interface TopologyStaticRouteConfiguration {
  readonly destination: string;
  readonly subnetMask: string;
  readonly nextHop: string;
}

export interface TopologyConnectionConfiguration {
  readonly firstDeviceId: string;
  readonly secondDeviceId: string;
  readonly firstInterfaceId: string;
  readonly secondInterfaceId: string;
}

export interface TopologySimulationConfiguration {
  readonly devices: readonly TopologyDeviceConfiguration[];
  readonly connections: readonly TopologyConnectionConfiguration[];
}

export interface TopologyPingResult {
  readonly success: boolean;
  readonly sourceIp: string;
  readonly destinationIp: string;
  readonly sequence: number;
  readonly message: string;
  readonly events: readonly SimulationEvent[];
  readonly responseType?: IcmpMessage["type"];
  readonly responseIp?: string;
  readonly responseTtl?: number;
}

interface HostConfiguration {
  readonly device: TopologyDeviceConfiguration;
  readonly networkInterface: TopologyInterfaceConfiguration;
  readonly engineDevice: NetworkDevice;
  readonly engineInterface: NetworkInterface;
  readonly ipv4?: IPv4Configuration;
  readonly configurationError?: string;
}

interface PendingPing {
  readonly destinationIp: string;
  readonly sequence: number;
  readonly sourceInterfaceId?: string;
  success: boolean;
  responseType?: IcmpMessage["type"];
  responseIp?: string;
  responseTtl?: number;
}

interface NormalizedStaticRoute {
  readonly destination: string;
  readonly subnetMask: string;
  readonly nextHop: string;
  readonly prefixLength: number;
}

interface RouterRoute {
  readonly egress: HostConfiguration;
  readonly nextHopIp: string;
  readonly prefixLength: number;
}

export class TopologySimulation {
  readonly engine = new SimulationEngine();
  private readonly interfaces = new Map<string, NetworkInterface>();
  private readonly interfaceConfigurations = new Map<string, TopologyInterfaceConfiguration>();
  private readonly configuredInterfaceIdsByEngineId = new Map<string, string>();
  private readonly engineDevices = new Map<string, NetworkDevice>();
  private readonly hostsByDevice = new Map<string, HostConfiguration>();
  private readonly hostsByInterface = new Map<string, SimulatedHost>();
  private readonly hostsByEngineInterface = new Map<string, SimulatedHost>();
  private readonly switches = new Map<string, EthernetSwitch>();
  private readonly routerInterfaces = new Map<string, HostConfiguration[]>();
  private readonly staticRoutesByDevice = new Map<string, readonly NormalizedStaticRoute[]>();
  private readonly vlanInterfaces = new Map<string, NetworkInterface>();
  private readonly layer3HostInterfaceIds = new Map<string, Set<string>>();
  private readonly pendingPings = new Map<string, PendingPing>();
  private sequence = 0;

  constructor(private readonly configuration: TopologySimulationConfiguration) {
    this.createDevicesAndInterfaces();
    this.connectEnabledInterfaces();
    this.createSwitchesAndHosts();
  }

  getSwitch(deviceId: string): EthernetSwitch | undefined {
    return this.switches.get(deviceId);
  }

  serializeSwitchConfiguration(
    deviceId: string,
    configuration: SwitchPersistentConfiguration,
  ): SwitchPersistentConfiguration {
    const device = this.configuration.devices.find((candidate) =>
      candidate.id === deviceId && this.isSwitchDevice(candidate));
    if (!device) throw new Error(`Le commutateur ${deviceId} est introuvable.`);
    const serializeRunning = (running: SwitchRunningConfiguration): SwitchRunningConfiguration => ({
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
        if (!interfaceId) throw new Error(`Le port ${entry.portInterfaceId} n’a pas d’identifiant de laboratoire.`);
        return { ...entry, portInterfaceId: interfaceId };
      }),
      ...(running.routedPorts
        ? {
            routedPorts: Object.fromEntries(Object.entries(running.routedPorts).map(([engineId, ipv4]) => {
              const interfaceId = this.configuredInterfaceIdsByEngineId.get(engineId);
              if (!interfaceId) throw new Error(`L’interface routée ${engineId} n’a pas d’identifiant de laboratoire.`);
              return [interfaceId, ipv4];
            })),
          }
        : {}),
    });
    return {
      model: configuration.model,
      running: serializeRunning(configuration.running),
      startup: configuration.startup ? serializeRunning(configuration.startup) : null,
    };
  }

  traceProbe(sourceDeviceId: string, destinationIp: string, ttl: number): TopologyPingResult {
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
      throw new Error("La durée de vie du paquet doit être comprise entre 1 et 255.");
    }
    return this.ping(sourceDeviceId, destinationIp, ttl, "tracert");
  }

  getArpEntries(deviceId: string): readonly { readonly ipAddress: string; readonly macAddress: string }[] {
    return this.getDeviceHosts(deviceId).flatMap((host) =>
      [...host.arpCache.snapshot].map(([ipAddress, macAddress]) => ({ ipAddress, macAddress })));
  }

  clearArpEntry(deviceId: string, ipAddress: string): boolean {
    const normalizedAddress = normalizeIPv4Address(ipAddress);
    const hosts = this.getDeviceHosts(deviceId);
    const deleted = hosts.reduce(
      (removed, host) => host.arpCache.delete(normalizedAddress) || removed,
      false,
    );
    if (deleted) {
      this.engine.recordEvent(
        "arp-cache-cleared",
        `${this.configuration.devices.find((device) => device.id === deviceId)?.name ?? deviceId} supprime l’entrée ARP de ${normalizedAddress}.`,
        { layer: "ARP", deviceId, ipAddress: normalizedAddress },
      );
    }
    return deleted;
  }

  getRouteEntries(deviceId: string): readonly {
    readonly destination: string;
    readonly netmask: string;
    readonly gateway: string;
    readonly interfaceName: string;
    readonly metric: number;
  }[] {
    const device = this.configuration.devices.find((item) => item.id === deviceId);
    if (!device) return [];
    if (device.kind === "layer3-switch") {
      return this.getLayer3RouteEntries(deviceId);
    }
    if (device.kind !== "pc") return [];
    const routes: Array<{
      destination: string;
      netmask: string;
      gateway: string;
      interfaceName: string;
      metric: number;
    }> = [];
    for (const networkInterface of device.interfaces) {
      if (!networkInterface.enabled || !networkInterface.ipv4Address) continue;
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

  getLayer3InterfaceEntries(deviceId: string): readonly {
    readonly name: string;
    readonly address: string;
    readonly status: "up" | "down";
    readonly protocol: "up" | "down";
  }[] {
    const networkSwitch = this.switches.get(deviceId);
    const device = this.configuration.devices.find((item) => item.id === deviceId);
    if (!networkSwitch || !device || !networkSwitch.supportsLayer3) return [];
    const entries = (networkSwitch.runningConfiguration.vlanInterfaces ?? []).map((svi) => {
      const up = svi.enabled && networkSwitch.isVlanOperational(svi.vlanId);
      return {
        name: `Vlan${svi.vlanId}`,
        address: svi.ipv4?.address ?? "unassigned",
        status: up ? "up" as const : "down" as const,
        protocol: up ? "up" as const : "down" as const,
      };
    });
    for (const networkInterface of device.interfaces) {
      const engineInterface = this.interfaces.get(networkInterface.id);
      const port = engineInterface && networkSwitch.getPortConfiguration(engineInterface.id);
      if (!engineInterface || !port || port.switchport) continue;
      const ipv4 = networkSwitch.runningConfiguration.routedPorts?.[engineInterface.id];
      const up = networkSwitch.isPortOperational(engineInterface.id);
      entries.push({
        name: networkInterface.name,
        address: ipv4?.address ?? "unassigned",
        status: up ? "up" : "down",
        protocol: up ? "up" : "down",
      });
    }
    return entries;
  }

  ping(
    sourceDeviceId: string,
    destinationIp: string,
    initialTtl?: number,
    operation: "ping" | "tracert" = "ping",
  ): TopologyPingResult {
    const normalizedDestinationIp = normalizeIPv4Address(destinationIp);
    const startIndex = this.engine.events.length;
    const sequence = ++this.sequence;
    const source = this.hostsByDevice.get(sourceDeviceId)
      ?? this.getLayer3Host(sourceDeviceId, normalizedDestinationIp);
    const sourceIp = source?.ipv4?.address ?? "";
    const packetTtl = validateIPv4Ttl(
      initialTtl ?? source?.device.initialTtl ?? DEFAULT_IPV4_TTL,
    );
    const pending: PendingPing = {
      destinationIp: normalizedDestinationIp,
      sequence,
      ...(source ? { sourceInterfaceId: source.networkInterface.id } : {}),
      success: false,
    };
    this.pendingPings.set(sourceDeviceId, pending);
    this.engine.recordEvent(
      operation === "ping" ? "icmp-ping-started" : "icmp-trace-probe-started",
      `${source?.device.name ?? sourceDeviceId} démarre ${operation === "ping" ? `un ping avec un TTL initial de ${packetTtl}` : `une sonde tracert TTL=${packetTtl}`} vers ${normalizedDestinationIp}.`,
      {
        layer: operation === "ping" ? "ICMP" : "TRACEROUTE",
        sourceIp,
        destinationIp: normalizedDestinationIp,
        sequence: String(sequence),
        initialTtl: String(packetTtl),
      },
    );

    if (!source) {
      return this.failPing(startIndex, sourceIp, normalizedDestinationIp, sequence, "Cet équipement ne possède pas de terminal réseau.");
    }
    if (!source.networkInterface.enabled) {
      return this.failPing(
        startIndex,
        sourceIp,
        normalizedDestinationIp,
        sequence,
        `L’interface ${source.networkInterface.name} est désactivée.`,
        "interface-down",
      );
    }
    if (source.device.dhcpEnabled) {
      return this.failPing(
        startIndex,
        sourceIp,
        normalizedDestinationIp,
        sequence,
        "Aucune adresse IPv4 n’est attribuée : aucun serveur DHCP n’est disponible dans cette simulation.",
        "icmp-destination-unreachable",
      );
    }
    if (!source.ipv4) {
      return this.failPing(
        startIndex,
        sourceIp,
        normalizedDestinationIp,
        sequence,
        source.configurationError ?? "Configurez une adresse IPv4 valide avant d’utiliser ping.",
        "icmp-destination-unreachable",
      );
    }
    if (source.device.icmpEnabled === false) {
      return this.failPing(
        startIndex,
        sourceIp,
        normalizedDestinationIp,
        sequence,
        "ICMP est désactivé sur l’ordinateur source.",
        "icmp-destination-unreachable",
      );
    }
    let nextHopIp = normalizedDestinationIp;
    if (!isSameSubnet(source.ipv4.address, normalizedDestinationIp, source.ipv4.subnetMask)) {
      if (source.device.kind === "layer3-switch") {
        const route = this.findRouterRoute(sourceDeviceId, normalizedDestinationIp);
        if (!route) {
          return this.failPing(
            startIndex,
            source.ipv4.address,
            normalizedDestinationIp,
            sequence,
            `Aucune route active ne permet de joindre ${normalizedDestinationIp}.`,
            "icmp-destination-unreachable",
          );
        }
        nextHopIp = route.nextHopIp;
      } else if (!source.device.defaultGateway) {
        return this.failPing(
          startIndex,
          source.ipv4.address,
          normalizedDestinationIp,
          sequence,
          `Aucune passerelle n’est configurée pour joindre ${normalizedDestinationIp} hors du sous-réseau local.`,
          "icmp-destination-unreachable",
        );
      }
      if (source.device.kind !== "layer3-switch") {
        try {
          nextHopIp = normalizeIPv4Address(source.device.defaultGateway!);
        } catch {
          return this.failPing(
            startIndex,
            source.ipv4.address,
            normalizedDestinationIp,
            sequence,
            "La passerelle configurée n’est pas une adresse IPv4 valide.",
            "icmp-destination-unreachable",
          );
        }
        if (!isSameSubnet(source.ipv4.address, nextHopIp, source.ipv4.subnetMask)) {
          return this.failPing(
            startIndex,
            source.ipv4.address,
            normalizedDestinationIp,
            sequence,
            `La passerelle ${nextHopIp} n’est pas joignable sur le sous-réseau local.`,
            "icmp-destination-unreachable",
          );
        }
      }
    }

    const duplicateAddress = [
      ...this.hostsByDevice.values(),
      ...[...this.routerInterfaces.values()].flat(),
    ].filter((host) => host.ipv4?.address === normalizedDestinationIp);
    if (duplicateAddress.length > 1) {
      return this.failPing(
        startIndex,
        source.ipv4.address,
        normalizedDestinationIp,
        sequence,
        `L’adresse IPv4 ${normalizedDestinationIp} est configurée sur plusieurs ordinateurs.`,
        "duplicate-ip-address",
      );
    }

    const sourceHost = this.hostsByInterface.get(source.networkInterface.id);
    if (!sourceHost) {
      return this.failPing(
        startIndex,
        source.ipv4.address,
        normalizedDestinationIp,
        sequence,
        "L’interface source n’est pas disponible pour la simulation.",
      );
    }

    if (normalizedDestinationIp === source.ipv4.address) {
      const request: IPv4Packet = {
        sourceIp: source.ipv4.address,
        destinationIp: normalizedDestinationIp,
        ttl: packetTtl,
        payload: { type: "echo-request", identifier: 1, sequence },
      };
      this.engine.recordEvent(
        "ipv4-packet-created",
        `${source.device.name} crée un Echo Request IPv4 avec un TTL initial de ${packetTtl}.`,
        {
          layer: "IPv4",
          host: source.device.name,
          sourceIp: request.sourceIp,
          destinationIp: request.destinationIp,
          initialTtl: String(packetTtl),
        },
      );
      sourceHost.deliverLocalEchoRequest(request);
      if (!pending.success) {
        return this.failPing(
          startIndex,
          source.ipv4.address,
          normalizedDestinationIp,
          sequence,
          `Aucune réponse ICMP reçue de ${normalizedDestinationIp}.`,
        );
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
      return this.failPing(
        startIndex,
        source.ipv4.address,
        normalizedDestinationIp,
        sequence,
        `Aucune réponse ARP reçue pour ${nextHopIp} ; vérifiez les interfaces et les câbles.`,
        "arp-resolution-failed",
      );
    }

    const request: IPv4Packet = {
      sourceIp: source.ipv4.address,
      destinationIp: normalizedDestinationIp,
      ttl: packetTtl,
      payload: { type: "echo-request", identifier: 1, sequence },
    };
    this.engine.recordEvent(
      "ipv4-packet-created",
      `${source.device.name} crée un Echo Request IPv4 avec un TTL initial de ${packetTtl}.`,
      {
        layer: "IPv4",
        host: source.device.name,
        sourceIp: request.sourceIp,
        destinationIp: request.destinationIp,
        initialTtl: String(packetTtl),
      },
    );
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
      return this.failPing(
        startIndex,
        source.ipv4.address,
        normalizedDestinationIp,
        sequence,
        `Aucune réponse ICMP reçue de ${normalizedDestinationIp}.`,
      );
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

  private createDevicesAndInterfaces(): void {
    for (const device of this.configuration.devices) {
      const kind = this.isSwitchDevice(device)
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
        const engineInterface = this.engine.createInterface(
          engineDevice.id,
          networkInterface.name,
          networkInterface.macAddress,
        );
        this.interfaces.set(networkInterface.id, engineInterface);
        this.configuredInterfaceIdsByEngineId.set(engineInterface.id, networkInterface.id);
        this.interfaceConfigurations.set(networkInterface.id, networkInterface);
      }
    }
  }

  private mapSwitchRunningConfiguration(
    device: TopologyDeviceConfiguration,
    running: SwitchRunningConfiguration,
  ): SwitchRunningConfiguration {
    return {
      ...running,
      ports: Object.fromEntries(device.interfaces.map((networkInterface) => {
        const engineInterface = this.interfaces.get(networkInterface.id);
        if (!engineInterface) throw new Error(`L’interface ${networkInterface.id} n’a pas été créée.`);
        return [
          engineInterface.id,
          running.ports[networkInterface.id] ?? defaultSwitchPortConfiguration(),
        ];
      })),
      staticMacEntries: running.staticMacEntries.map((entry) => {
        const engineInterface = this.interfaces.get(entry.portInterfaceId);
        if (!engineInterface) throw new Error(`Le port statique ${entry.portInterfaceId} n’existe pas.`);
        return { ...entry, portInterfaceId: engineInterface.id };
      }),
      ...(running.routedPorts
        ? {
            routedPorts: Object.fromEntries(Object.entries(running.routedPorts).map(([configuredId, ipv4]) => {
              const engineInterface = this.interfaces.get(configuredId);
              if (!engineInterface) throw new Error(`L’interface routée ${configuredId} n’existe pas.`);
              return [engineInterface.id, ipv4];
            })),
          }
        : {}),
    };
  }

  private connectEnabledInterfaces(): void {
    for (const connection of this.configuration.connections) {
      const first = this.interfaceConfigurations.get(connection.firstInterfaceId);
      const second = this.interfaceConfigurations.get(connection.secondInterfaceId);
      const firstInterface = this.interfaces.get(connection.firstInterfaceId);
      const secondInterface = this.interfaces.get(connection.secondInterfaceId);
      if (!first || !second || !firstInterface || !secondInterface || !first.enabled || !second.enabled) continue;
      this.engine.connectInterfaces(firstInterface.id, secondInterface.id);
    }
  }

  private createSwitchesAndHosts(): void {
    for (const device of this.configuration.devices) {
      const engineDevice = this.engineDevices.get(device.id);
      if (!engineDevice) continue;
      if (this.isSwitchDevice(device)) {
        const portIds = device.interfaces
          .map((networkInterface) => this.interfaces.get(networkInterface.id)?.id)
          .filter((id): id is string => id !== undefined);
        const switchConfiguration = device.switchConfig
          ? {
              model: device.switchConfig.model,
              running: this.mapSwitchRunningConfiguration(device, device.switchConfig.running),
              startup: device.switchConfig.startup
                ? this.mapSwitchRunningConfiguration(device, device.switchConfig.startup)
                : null,
            }
          : device.kind === "layer3-switch"
            ? createDefaultSwitchConfiguration(
                engineDevice.name,
                portIds,
                CATALYST_3560_MODEL,
              )
            : undefined;
        if (
          (device.kind === "layer3-switch"
            && switchConfiguration?.model !== CATALYST_3560_MODEL)
          || (device.kind === "switch"
            && switchConfiguration?.model === CATALYST_3560_MODEL)
        ) {
          throw new Error(`Le modèle de commutateur ne correspond pas au type d’équipement ${device.name}.`);
        }
        const networkSwitch = new EthernetSwitch(
          engineDevice.name,
          portIds,
          this.engine.topology,
          this.engine,
          switchConfiguration,
        );
        this.switches.set(device.id, networkSwitch);
        if (device.kind === "layer3-switch") {
          networkSwitch.setLayer3FrameHandler((portId, vlanId, frame) =>
            this.receiveLayer3SwitchFrame(device.id, portId, vlanId, frame));
          networkSwitch.setConfigurationChangeHandler(() =>
            this.refreshLayer3SwitchInterfaces(device, networkSwitch));
        }
        continue;
      }
      if (device.kind === "router") {
        const routerInterfaces: HostConfiguration[] = [];
        for (const networkInterface of device.interfaces) {
          const engineInterface = this.interfaces.get(networkInterface.id);
          if (!engineInterface || !networkInterface.enabled || !networkInterface.ipv4Address) continue;
          let ipv4: IPv4Configuration;
          try {
            ipv4 = validateIPv4Configuration({
              address: networkInterface.ipv4Address,
              subnetMask: networkInterface.subnetMask || "255.255.255.0",
            });
          } catch (error) {
            this.engine.recordEvent(
              "ipv4-configuration-error",
              `${device.name} : configuration IP invalide sur ${networkInterface.name} : ${error instanceof Error ? error.message : "adresse inconnue"}`,
              { layer: "IPv4", deviceId: device.id, interfaceId: networkInterface.id },
            );
            continue;
          }
          const hostConfiguration: HostConfiguration = {
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
      if (device.kind !== "pc" && device.kind !== "laptop") continue;
      const networkInterface = device.interfaces[0];
      const engineInterface = networkInterface && this.interfaces.get(networkInterface.id);
      if (!networkInterface || !engineInterface) continue;

      let ipv4: IPv4Configuration | undefined;
      let configurationError: string | undefined;
      if (!device.dhcpEnabled && networkInterface.ipv4Address) {
        try {
          ipv4 = validateIPv4Configuration({
            address: networkInterface.ipv4Address,
            subnetMask: networkInterface.subnetMask || "255.255.255.0",
          });
        } catch (error) {
          configurationError = error instanceof Error ? error.message : "Configuration IPv4 invalide.";
        }
      }
      const hostConfiguration: HostConfiguration = {
        device,
        networkInterface,
        engineDevice,
        engineInterface,
        ...(ipv4 ? { ipv4 } : {}),
        ...(configurationError ? { configurationError } : {}),
      };
      this.hostsByDevice.set(device.id, hostConfiguration);
      if (!ipv4 || !networkInterface.enabled) continue;

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

  private forwardRouterPacket(
    ingress: HostConfiguration,
    packet: IPv4Packet,
  ): void {
    const ingressHost = this.hostsByEngineInterface.get(ingress.engineInterface.id);
    if (!ingressHost || !ingress.ipv4) return;
    this.engine.recordEvent(
      "ipv4-packet-received",
      `${ingress.device.name} reçoit un paquet IPv4 destiné à ${packet.destinationIp} avec un TTL de ${packet.ttl}.`,
      {
        layer: "IPv4",
        deviceId: ingress.device.id,
        interfaceId: ingress.networkInterface.id,
        sourceIp: packet.sourceIp,
        destinationIp: packet.destinationIp,
        ttl: String(packet.ttl),
      },
    );
    const remainingTtl = packet.ttl - 1;
    this.engine.recordEvent(
      "ipv4-ttl-decremented",
      `${ingress.device.name} décrémente le TTL de ${packet.ttl} à ${remainingTtl}.`,
      {
        layer: "IPv4",
        deviceId: ingress.device.id,
        interfaceId: ingress.networkInterface.id,
        sourceIp: packet.sourceIp,
        destinationIp: packet.destinationIp,
        ttlBefore: String(packet.ttl),
        ttlAfter: String(remainingTtl),
      },
    );
    if (remainingTtl <= 0) {
      this.engine.recordEvent(
        "ipv4-packet-dropped",
        `${ingress.device.name} abandonne le paquet IPv4 : le TTL a atteint ${remainingTtl}.`,
        {
          layer: "IPv4",
          deviceId: ingress.device.id,
          interfaceId: ingress.networkInterface.id,
          sourceIp: packet.sourceIp,
          destinationIp: packet.destinationIp,
          ttl: String(remainingTtl),
          reason: "ttl-expired",
        },
      );
      this.engine.recordEvent(
        "icmp-time-exceeded",
        `${ingress.device.name} génère ICMP Time Exceeded : le TTL original (${packet.ttl}) a expiré.`,
        {
          layer: "ICMP",
          deviceId: ingress.device.id,
          sourceIp: packet.sourceIp,
          destinationIp: packet.destinationIp,
          sequence: String(packet.payload.sequence),
          expiredTtl: String(packet.ttl),
        },
      );
      this.sendRouterControl(ingress, packet, {
        type: "time-exceeded",
        sequence: packet.payload.sequence,
        expiredTtl: packet.ttl,
      });
      return;
    }

    const networkSwitch = this.switches.get(ingress.device.id);
    if (
      ingress.device.kind === "layer3-switch"
      && networkSwitch?.runningConfiguration.ipRouting !== true
    ) {
      this.sendRouterControl(ingress, packet, {
        type: "destination-unreachable",
        sequence: packet.payload.sequence,
        reason: "Le routage IPv4 est désactivé sur le commutateur.",
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
      this.engine.recordEvent(
        "ipv4-packet-dropped",
        `${ingress.device.name} abandonne le paquet : l’interface de sortie n’est pas active.`,
        {
          layer: "IPv4",
          deviceId: ingress.device.id,
          egressInterfaceId: route.egress.networkInterface.id,
          destinationIp: packet.destinationIp,
          ttl: String(remainingTtl),
          reason: "egress-interface-down",
        },
      );
      return;
    }
    let destinationMac = egressHost.arpCache.get(route.nextHopIp);
    if (!destinationMac) {
      egressHost.sendArpRequest(route.nextHopIp);
      destinationMac = egressHost.arpCache.get(route.nextHopIp);
    }
    if (!destinationMac) {
      this.engine.recordEvent(
        "arp-resolution-failed",
        `${ingress.device.name} ne peut pas résoudre le prochain saut ${route.nextHopIp} sur ${route.egress.networkInterface.name}.`,
        {
          layer: "ARP",
          deviceId: ingress.device.id,
          interfaceId: route.egress.networkInterface.id,
          targetIp: route.nextHopIp,
        },
      );
      return;
    }
    this.engine.recordEvent(
      "ipv4-packet-forwarded",
      `${ingress.device.name} achemine un paquet de ${packet.sourceIp} vers ${packet.destinationIp} via ${route.egress.networkInterface.name}.`,
      {
        layer: "IPv4",
        deviceId: ingress.device.id,
        ingressInterfaceId: ingress.networkInterface.id,
        egressInterfaceId: route.egress.networkInterface.id,
        nextHopIp: route.nextHopIp,
        sourceIp: packet.sourceIp,
        destinationIp: packet.destinationIp,
        ttl: String(remainingTtl),
      },
    );
    egressHost.sendIPv4Packet(destinationMac, { ...packet, ttl: remainingTtl });
  }

  private sendRouterControl(
    ingress: HostConfiguration,
    originalPacket: IPv4Packet,
    message: Extract<IcmpMessage, { type: "time-exceeded" | "destination-unreachable" }>,
  ): void {
    const route = this.findRouterRoute(ingress.device.id, originalPacket.sourceIp);
    if (!route) {
      this.engine.recordEvent(
        "ipv4-packet-dropped",
        `${ingress.device.name} ne peut pas acheminer le message ICMP vers ${originalPacket.sourceIp}.`,
        {
          layer: "IPv4",
          deviceId: ingress.device.id,
          sourceIp: originalPacket.sourceIp,
          reason: "no-return-route",
        },
      );
      return;
    }
    const egressHost = this.hostsByEngineInterface.get(route.egress.engineInterface.id);
    const egressIpv4 = route.egress.ipv4;
    if (!egressHost || !egressIpv4) {
      this.engine.recordEvent(
        "ipv4-packet-dropped",
        `${ingress.device.name} ne peut pas émettre le message ICMP sur l’interface de retour.`,
        {
          layer: "IPv4",
          deviceId: ingress.device.id,
          egressInterfaceId: route.egress.networkInterface.id,
          sourceIp: originalPacket.sourceIp,
          reason: "egress-interface-down",
        },
      );
      return;
    }
    let destinationMac = egressHost.arpCache.get(route.nextHopIp);
    if (!destinationMac) {
      egressHost.sendArpRequest(route.nextHopIp);
      destinationMac = egressHost.arpCache.get(route.nextHopIp);
    }
    if (!destinationMac) {
      this.engine.recordEvent(
        "arp-resolution-failed",
        `${ingress.device.name} ne peut pas résoudre le prochain saut ${route.nextHopIp} pour son message ICMP.`,
        {
          layer: "ARP",
          deviceId: ingress.device.id,
          interfaceId: route.egress.networkInterface.id,
          targetIp: route.nextHopIp,
        },
      );
      return;
    }
    const response: IPv4Packet = {
      sourceIp: egressIpv4.address,
      destinationIp: originalPacket.sourceIp,
      ttl: egressHost.initialTtl,
      payload: message,
    };
    this.engine.recordEvent(
      "ipv4-packet-created",
      `${ingress.device.name} crée un message ICMP IPv4 avec un TTL initial de ${response.ttl}.`,
      {
        layer: "IPv4",
        host: ingress.device.name,
        sourceIp: response.sourceIp,
        destinationIp: response.destinationIp,
        initialTtl: String(response.ttl),
      },
    );
    egressHost.sendIPv4Packet(destinationMac, response);
  }

  private normalizeStaticRoutes(
    device: TopologyDeviceConfiguration,
    routes: readonly TopologyStaticRouteConfiguration[] = device.staticRoutes ?? [],
  ): readonly NormalizedStaticRoute[] {
    return routes.flatMap((route, index) => {
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
      } catch (error) {
        this.engine.recordEvent(
          "ipv4-configuration-error",
          `${device.name} : route statique ${index + 1} invalide : ${error instanceof Error ? error.message : "configuration inconnue"}`,
          { layer: "IPv4", deviceId: device.id, routeIndex: String(index) },
        );
        return [];
      }
    });
  }

  private findRouterRoute(routerDeviceId: string, destinationIp: string): RouterRoute | undefined {
    const interfaces = this.routerInterfaces.get(routerDeviceId) ?? [];
    const candidates: RouterRoute[] = [];
    interfaces.forEach((networkInterface) => {
      if (
        networkInterface.ipv4
        && networkInterface.networkInterface.enabled
        && isSameSubnet(
          networkInterface.ipv4.address,
          destinationIp,
          networkInterface.ipv4.subnetMask,
        )
      ) {
        candidates.push({
          egress: networkInterface,
          nextHopIp: destinationIp,
          prefixLength: getSubnetPrefixLength(networkInterface.ipv4.subnetMask),
        });
      }
    });
    const networkSwitch = this.switches.get(routerDeviceId);
    const staticRoutesEnabled = networkSwitch?.supportsLayer3
      ? networkSwitch.runningConfiguration.ipRouting === true
      : true;
    (staticRoutesEnabled ? this.staticRoutesByDevice.get(routerDeviceId) ?? [] : []).forEach((route) => {
      if (!isSameSubnet(destinationIp, route.destination, route.subnetMask)) return;
      const egress = interfaces.find((networkInterface) =>
        networkInterface.ipv4
        && networkInterface.networkInterface.enabled
        && isSameSubnet(
          networkInterface.ipv4.address,
          route.nextHop,
          networkInterface.ipv4.subnetMask,
        ));
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

  private refreshLayer3SwitchInterfaces(
    device: TopologyDeviceConfiguration,
    networkSwitch: EthernetSwitch,
  ): void {
    const previousIds = this.layer3HostInterfaceIds.get(device.id) ?? new Set<string>();
    previousIds.forEach((interfaceId) => {
      this.hostsByEngineInterface.delete(interfaceId);
      this.hostsByInterface.delete(interfaceId);
    });
    const currentIds = new Set<string>();
    const interfaces: HostConfiguration[] = [];
    const engineDevice = this.engineDevices.get(device.id);
    if (!engineDevice) return;

    for (const svi of networkSwitch.runningConfiguration.vlanInterfaces ?? []) {
      if (!svi.ipv4) continue;
      const virtualInterface = this.getVlanEngineInterface(device, engineDevice, svi.vlanId);
      const networkInterface: TopologyInterfaceConfiguration = {
        id: virtualInterface.id,
        name: `Vlan${svi.vlanId}`,
        macAddress: virtualInterface.macAddress,
        enabled: svi.enabled && networkSwitch.isVlanOperational(svi.vlanId),
        ipv4Address: svi.ipv4.address,
        subnetMask: svi.ipv4.subnetMask,
      };
      interfaces.push(this.createLayer3Host(
        device,
        engineDevice,
        virtualInterface,
        networkInterface,
        svi.ipv4,
        (_sourceInterfaceId, frame) => networkSwitch
          .forwardFromVlan(svi.vlanId, frame)
          .forEach((egress) => this.transmit(
            egress.portInterfaceId,
            egress.frame,
            new Set([device.id]),
          )),
      ));
      currentIds.add(virtualInterface.id);
    }

    for (const configuredInterface of device.interfaces) {
      const engineInterface = this.interfaces.get(configuredInterface.id);
      if (!engineInterface) continue;
      const port = networkSwitch.getPortConfiguration(engineInterface.id);
      if (port.switchport) continue;
      const ipv4 = networkSwitch.runningConfiguration.routedPorts?.[engineInterface.id];
      if (!ipv4) continue;
      const networkInterface: TopologyInterfaceConfiguration = {
        ...configuredInterface,
        enabled: networkSwitch.isPortOperational(engineInterface.id),
        ipv4Address: ipv4.address,
        subnetMask: ipv4.subnetMask,
      };
      interfaces.push(this.createLayer3Host(
        device,
        engineDevice,
        engineInterface,
        networkInterface,
        ipv4,
        (sourceInterfaceId, frame) => {
          networkSwitch.recordRoutedOutput(sourceInterfaceId);
          this.transmit(sourceInterfaceId, frame);
        },
      ));
      currentIds.add(engineInterface.id);
    }
    this.routerInterfaces.set(device.id, interfaces);
    this.layer3HostInterfaceIds.set(device.id, currentIds);
    this.staticRoutesByDevice.set(
      device.id,
      this.normalizeStaticRoutes(device, networkSwitch.runningConfiguration.staticRoutes ?? []),
    );
  }

  private createLayer3Host(
    device: TopologyDeviceConfiguration,
    engineDevice: NetworkDevice,
    engineInterface: NetworkInterface,
    networkInterface: TopologyInterfaceConfiguration,
    ipv4: IPv4Configuration,
    transmit: (sourceInterfaceId: string, frame: EthernetFrame) => void,
  ): HostConfiguration {
    const hostConfiguration: HostConfiguration = {
      device,
      networkInterface,
      engineDevice,
      engineInterface,
      ipv4,
    };
    const host = new SimulatedHost({
      device: engineDevice,
      networkInterface: engineInterface,
      macAddress: networkInterface.macAddress,
      ipv4,
      initialTtl: device.initialTtl,
      transmit,
      events: this.engine,
      onEchoReply: (packet) => this.receiveEchoReply(device.id, packet),
      onIcmpControl: (packet) => this.receiveIcmpControl(device.id, packet),
      onForwardPacket: (packet) => this.forwardRouterPacket(hostConfiguration, packet),
    });
    this.hostsByInterface.set(networkInterface.id, host);
    this.hostsByEngineInterface.set(engineInterface.id, host);
    return hostConfiguration;
  }

  private getVlanEngineInterface(
    device: TopologyDeviceConfiguration,
    engineDevice: NetworkDevice,
    vlanId: number,
  ): NetworkInterface {
    const key = `${device.id}:vlan:${vlanId}`;
    const existing = this.vlanInterfaces.get(key);
    if (existing) return existing;

    const usedMacAddresses = new Set(this.configuration.devices.flatMap((item) =>
      item.interfaces.map((networkInterface) => networkInterface.macAddress.toLowerCase())));
    this.vlanInterfaces.forEach((networkInterface) => usedMacAddresses.add(networkInterface.macAddress.toLowerCase()));
    const seed = [...key].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
    let macAddress = "";
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const suffix = (seed + attempt) & 0xffffff;
      const candidate = `02:ff:${((suffix >>> 16) & 255).toString(16).padStart(2, "0")}:${((suffix >>> 8) & 255).toString(16).padStart(2, "0")}:${(suffix & 255).toString(16).padStart(2, "0")}:${(vlanId & 255).toString(16).padStart(2, "0")}`;
      if (!usedMacAddresses.has(candidate)) {
        macAddress = candidate;
        break;
      }
    }
    if (!macAddress) throw new Error(`Impossible d’allouer une adresse MAC à l’interface Vlan${vlanId}.`);
    const networkInterface = this.engine.createInterface(engineDevice.id, `Vlan${vlanId}`, macAddress);
    this.vlanInterfaces.set(key, networkInterface);
    return networkInterface;
  }

  private receiveLayer3SwitchFrame(
    deviceId: string,
    ingressPortId: string,
    vlanId: number | null,
    frame: EthernetFrame,
  ): boolean {
    const networkSwitch = this.switches.get(deviceId);
    if (!networkSwitch) return false;
    if (vlanId === null) {
      this.hostsByEngineInterface.get(ingressPortId)?.receiveFrame(frame);
      return true;
    }
    const svi = (networkSwitch.runningConfiguration.vlanInterfaces ?? []).find((item) =>
      item.vlanId === vlanId && item.enabled && item.ipv4);
    if (!svi || !networkSwitch.isVlanOperational(vlanId)) return false;
    const sviInterface = this.vlanInterfaces.get(`${deviceId}:vlan:${vlanId}`);
    const host = sviInterface && this.hostsByEngineInterface.get(sviInterface.id);
    if (!host) return false;
    if (frame.destinationMac === host.macAddress) {
      host.receiveFrame(frame);
      return true;
    }
    if (
      frame.etherType === "ARP"
      && frame.payload.operation === "request"
      && frame.payload.targetIp === svi.ipv4!.address
    ) {
      host.receiveFrame(frame);
    }
    return false;
  }

  private getLayer3Host(deviceId: string, destinationIp?: string): HostConfiguration | undefined {
    const interfaces = this.routerInterfaces.get(deviceId) ?? [];
    if (destinationIp) {
      const route = this.findRouterRoute(deviceId, destinationIp);
      if (route) return route.egress;
    }
    return interfaces.find((item) =>
      item.device.kind === "layer3-switch" && item.networkInterface.enabled)
      ?? interfaces.find((item) => item.device.kind === "layer3-switch");
  }

  private getDeviceHosts(deviceId: string): SimulatedHost[] {
    const hostConfiguration = this.hostsByDevice.get(deviceId);
    const hosts = hostConfiguration
      ? [this.hostsByInterface.get(hostConfiguration.networkInterface.id)]
      : [];
    (this.routerInterfaces.get(deviceId) ?? []).forEach((item) =>
      hosts.push(this.hostsByEngineInterface.get(item.engineInterface.id)));
    return hosts.filter((host): host is SimulatedHost => host !== undefined);
  }

  private getLayer3RouteEntries(deviceId: string): readonly {
    readonly destination: string;
    readonly netmask: string;
    readonly gateway: string;
    readonly interfaceName: string;
    readonly metric: number;
  }[] {
    const networkSwitch = this.switches.get(deviceId);
    if (!networkSwitch?.runningConfiguration.ipRouting) return [];
    const interfaces = this.routerInterfaces.get(deviceId) ?? [];
    const routes: Array<{
      destination: string;
      netmask: string;
      gateway: string;
      interfaceName: string;
      metric: number;
    }> = [];
    interfaces.forEach((item) => {
      if (!item.ipv4 || !item.networkInterface.enabled) return;
      routes.push({
        destination: getNetworkAddress(item.ipv4.address, item.ipv4.subnetMask),
        netmask: item.ipv4.subnetMask,
        gateway: "On-link",
        interfaceName: item.networkInterface.name,
        metric: 0,
      });
    });
    (this.staticRoutesByDevice.get(deviceId) ?? []).forEach((route) => {
      const egress = interfaces.find((item) =>
        item.ipv4
        && item.networkInterface.enabled
        && isSameSubnet(item.ipv4.address, route.nextHop, item.ipv4.subnetMask));
      if (!egress) return;
      routes.push({
        destination: route.destination,
        netmask: route.subnetMask,
        gateway: route.nextHop,
        interfaceName: egress.networkInterface.name,
        metric: 1,
      });
    });
    return routes.sort((first, second) =>
      getSubnetPrefixLength(second.netmask) - getSubnetPrefixLength(first.netmask));
  }

  private transmit(
    sourceInterfaceId: string,
    frame: EthernetFrame,
    traversedSwitches: ReadonlySet<string> = new Set(),
  ): void {
    const connection = this.engine.topology.getConnectionForInterface(sourceInterfaceId);
    if (!connection) {
      this.engine.recordEvent(
        "ethernet-frame-dropped",
        `Trame abandonnée : aucune connexion active sur l’interface ${sourceInterfaceId}.`,
        { layer: "L2", sourceInterfaceId },
      );
      return;
    }

    const peerInterfaceId = connection.firstInterfaceId === sourceInterfaceId
      ? connection.secondInterfaceId
      : connection.firstInterfaceId;
    const peerInterface = this.engine.topology.getInterface(peerInterfaceId);
    const peerDevice = peerInterface && this.engine.topology.getDevice(peerInterface.deviceId);
    if (!peerInterface || !peerDevice) return;

    if (peerDevice.kind === "switch") {
      const switchDeviceId = [...this.engineDevices]
        .find(([, candidate]) => candidate.id === peerDevice.id)?.[0];
      const ethernetSwitch = switchDeviceId && this.switches.get(switchDeviceId);
      if (!ethernetSwitch) return;
      if (traversedSwitches.has(switchDeviceId)) {
        this.engine.recordEvent(
          "ethernet-frame-dropped",
          `Trame abandonnée : boucle détectée à travers ${peerDevice.name}.`,
          { layer: "L2", deviceId: peerDevice.id },
        );
        return;
      }
      const nextPath = new Set(traversedSwitches);
      nextPath.add(switchDeviceId);
      ethernetSwitch.receive(peerInterface.id, frame).forEach((egress) =>
        this.transmit(egress.portInterfaceId, egress.frame, nextPath));
      return;
    }

    const host = this.hostsByEngineInterface.get(peerInterface.id);
    if (host) {
      if (frame.vlanId !== undefined) {
        this.engine.recordEvent(
          "ethernet-frame-dropped",
          `Trame 802.1Q marquée VLAN ${frame.vlanId} abandonnée : ${peerDevice.name} ne traite pas les tags VLAN.`,
          {
            layer: "L2",
            deviceId: peerDevice.id,
            interfaceId: peerInterface.id,
            vlanId: String(frame.vlanId),
          },
        );
        return;
      }
      host.receiveFrame(frame);
    } else {
      this.engine.recordEvent(
        "ethernet-frame-dropped",
        `Trame abandonnée : ${peerDevice.name} ne possède pas d’hôte actif sur ${peerInterface.name}.`,
        { layer: "L2", deviceId: peerDevice.id, interfaceId: peerInterface.id },
      );
    }
  }

  private receiveEchoReply(sourceDeviceId: string, packet: IPv4Packet): void {
    const pending = this.pendingPings.get(sourceDeviceId);
    const source = this.getPingSourceConfiguration(sourceDeviceId, pending);
    if (
      !pending
      || !source?.ipv4
      || packet.payload.type !== "echo-reply"
      || packet.destinationIp !== source.ipv4.address
      || packet.sourceIp !== pending.destinationIp
      || packet.payload.sequence !== pending.sequence
    ) {
      return;
    }

    pending.success = true;
    pending.responseType = packet.payload.type;
    pending.responseIp = packet.sourceIp;
    pending.responseTtl = packet.ttl;
    this.engine.recordEvent(
      "icmp-ping-succeeded",
      `${source.device.name} reçoit l’Echo Reply ${pending.sequence} de ${packet.sourceIp}.`,
      {
        layer: "ICMP",
        sourceIp: source.ipv4.address,
        destinationIp: packet.sourceIp,
        sequence: String(pending.sequence),
      },
    );
  }

  private receiveIcmpControl(sourceDeviceId: string, packet: IPv4Packet): void {
    const pending = this.pendingPings.get(sourceDeviceId);
    const source = this.getPingSourceConfiguration(sourceDeviceId, pending);
    if (
      !pending
      || !source?.ipv4
      || (packet.payload.type !== "time-exceeded" && packet.payload.type !== "destination-unreachable")
      || packet.destinationIp !== source.ipv4.address
      || packet.payload.sequence !== pending.sequence
    ) {
      return;
    }
    pending.responseType = packet.payload.type;
    pending.responseIp = packet.sourceIp;
    pending.responseTtl = packet.ttl;
  }

  private failPing(
    startIndex: number,
    sourceIp: string,
    destinationIp: string,
    sequence: number,
    message: string,
    eventType: "arp-resolution-failed" | "icmp-destination-unreachable" | "interface-down" | "duplicate-ip-address" | "icmp-ping-failed" = "icmp-ping-failed",
  ): TopologyPingResult {
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

  private isSwitchDevice(device: TopologyDeviceConfiguration): boolean {
    return device.kind === "switch" || device.kind === "layer3-switch";
  }

  private getPingSourceConfiguration(
    deviceId: string,
    pending: PendingPing | undefined,
  ): HostConfiguration | undefined {
    if (!pending) return undefined;
    const hostConfiguration = this.hostsByDevice.get(deviceId);
    if (hostConfiguration?.networkInterface.id === pending.sourceInterfaceId) return hostConfiguration;
    return (this.routerInterfaces.get(deviceId) ?? []).find((item) =>
      item.networkInterface.id === pending.sourceInterfaceId);
  }
}

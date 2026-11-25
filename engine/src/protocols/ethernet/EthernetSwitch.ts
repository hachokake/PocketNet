import type { InterfaceId } from "../../domain/NetworkInterface.js";
import type { SimulationEventSink } from "../../domain/SimulationEvent.js";
import type { NetworkTopology } from "../../topology/NetworkTopology.js";
import {
  isMulticastMacAddress,
  normalizeMacAddress,
  type MacAddress,
} from "../arp/arp.js";
import {
  createDefaultSwitchConfiguration,
  defaultSwitchPortConfiguration,
  isVlanAllowed,
  normalizeSwitchConfiguration,
  type SwitchPersistentConfiguration,
  type SwitchPortConfiguration,
  type SwitchRunningConfiguration,
} from "./SwitchConfiguration.js";
import type { EthernetFrame } from "./ethernet.js";

export interface MacTableEntry {
  readonly macAddress: MacAddress;
  readonly portInterfaceId: InterfaceId;
  readonly vlanId: number;
  readonly type: "dynamic" | "static";
  readonly lastUpdated: number;
}

export interface SwitchInterfaceCounters {
  readonly inputPackets: number;
  readonly outputPackets: number;
  readonly inputErrors: number;
  readonly outputErrors: number;
}

export interface SwitchEgress {
  readonly portInterfaceId: InterfaceId;
  readonly frame: EthernetFrame;
}

interface StoredMacEntry extends MacTableEntry {}

interface MutableSwitchInterfaceCounters {
  inputPackets: number;
  outputPackets: number;
  inputErrors: number;
  outputErrors: number;
}

export class EthernetSwitch {
  private readonly macTable = new Map<string, StoredMacEntry>();
  private readonly interfaceCounters = new Map<InterfaceId, MutableSwitchInterfaceCounters>();
  private running: SwitchRunningConfiguration;
  private startup: SwitchRunningConfiguration | null;
  private readonly switchPortIds: ReadonlySet<InterfaceId>;
  private readonly switchModel: SwitchPersistentConfiguration["model"];

  constructor(
    readonly name: string,
    portInterfaceIds: readonly InterfaceId[],
    private readonly topology: NetworkTopology,
    private readonly events: SimulationEventSink,
    configuration?: unknown,
    private readonly now: () => number = Date.now,
    private readonly macAgingTimeMsOverride?: number,
  ) {
    this.switchPortIds = new Set(portInterfaceIds);
    for (const portInterfaceId of this.switchPortIds) {
      this.interfaceCounters.set(portInterfaceId, {
        inputPackets: 0,
        outputPackets: 0,
        inputErrors: 0,
        outputErrors: 0,
      });
    }
    const normalized = normalizeSwitchConfiguration(
      configuration,
      name,
      portInterfaceIds,
    );
    this.switchModel = normalized.model;
    this.running = normalized.running;
    this.startup = normalized.startup;
    this.installStaticMacEntries();
  }

  get persistentConfiguration(): SwitchPersistentConfiguration {
    return { model: this.model, running: this.running, startup: this.startup };
  }

  get model(): SwitchPersistentConfiguration["model"] {
    return this.switchModel;
  }

  get runningConfiguration(): SwitchRunningConfiguration {
    return this.running;
  }

  get startupConfiguration(): SwitchRunningConfiguration | null {
    return this.startup;
  }

  get portInterfaceIds(): readonly InterfaceId[] {
    return [...this.switchPortIds];
  }

  getPortName(portInterfaceId: InterfaceId): string {
    this.assertPort(portInterfaceId);
    return this.portName(portInterfaceId);
  }

  get macTableSnapshot(): readonly MacTableEntry[] {
    this.expireMacEntries();
    return [...this.macTable.values()].map((entry) => ({ ...entry }));
  }

  getPortConfiguration(portInterfaceId: InterfaceId): SwitchPortConfiguration {
    this.assertPort(portInterfaceId);
    return this.running.ports[portInterfaceId] ?? defaultSwitchPortConfiguration();
  }

  getPortMacAddress(portInterfaceId: InterfaceId): string | undefined {
    this.assertPort(portInterfaceId);
    return this.topology.getInterface(portInterfaceId)?.macAddress;
  }

  getPortCounters(portInterfaceId: InterfaceId): SwitchInterfaceCounters {
    this.assertPort(portInterfaceId);
    const counters = this.interfaceCounters.get(portInterfaceId);
    if (!counters) throw new Error(`Les compteurs du port ${portInterfaceId} sont introuvables.`);
    return { ...counters };
  }

  isPortOperational(portInterfaceId: InterfaceId): boolean {
    return this.getPortConfiguration(portInterfaceId).enabled
      && this.isPhysicallyActive(portInterfaceId);
  }

  setRunningConfiguration(configuration: SwitchRunningConfiguration): void {
    const normalized = normalizeSwitchConfiguration(
      { model: this.switchModel, running: configuration, startup: this.startup },
      this.running.hostname,
      [...this.switchPortIds],
    );
    this.running = normalized.running;
    for (const [key, entry] of this.macTable) {
      if (entry.type === "static") this.macTable.delete(key);
    }
    this.installStaticMacEntries();
  }

  saveStartupConfiguration(): void {
    this.startup = structuredClone(this.running);
  }

  reloadStartupConfiguration(): void {
    this.running = this.startup
      ? structuredClone(this.startup)
      : createDefaultSwitchConfiguration(this.name, [...this.switchPortIds], this.switchModel).running;
    this.macTable.clear();
    this.installStaticMacEntries();
  }

  addStaticMacAddress(macAddress: string, vlanId: number, portInterfaceId: InterfaceId): void {
    this.assertPort(portInterfaceId);
    const mac = normalizeMacAddress(macAddress);
    this.assertVlanExists(vlanId);
    if (isMulticastMacAddress(mac)) throw new Error("Une entrée MAC statique doit être une adresse unicast.");
    this.macTable.set(this.macKey(vlanId, mac), {
      macAddress: mac,
      portInterfaceId,
      vlanId,
      type: "static",
      lastUpdated: this.now(),
    });
  }

  clearDynamicMacAddresses(vlanId?: number, portInterfaceId?: InterfaceId): number {
    if (portInterfaceId !== undefined) this.assertPort(portInterfaceId);
    this.expireMacEntries();
    let removed = 0;
    for (const [key, entry] of this.macTable) {
      if (entry.type === "dynamic"
        && (vlanId === undefined || entry.vlanId === vlanId)
        && (portInterfaceId === undefined || entry.portInterfaceId === portInterfaceId)) {
        this.macTable.delete(key);
        removed += 1;
      }
    }
    this.events.recordEvent(
      "switch-mac-table-cleared",
      `${removed} entrée(s) MAC dynamique(s) supprimée(s)${vlanId === undefined ? "" : ` du VLAN ${vlanId}`}${portInterfaceId === undefined ? "" : ` sur ${this.portName(portInterfaceId)}`}.`,
      {
        layer: "L2",
        vlanId: vlanId === undefined ? "" : String(vlanId),
        portInterfaceId: portInterfaceId ?? "",
        count: String(removed),
      },
    );
    return removed;
  }

  removeVlanMacEntries(vlanId: number): void {
    for (const [key, entry] of this.macTable) {
      if (entry.vlanId === vlanId) this.macTable.delete(key);
    }
  }

  receive(ingressPortId: InterfaceId, frame: EthernetFrame): readonly SwitchEgress[] {
    this.assertPort(ingressPortId);
    this.incrementCounter(ingressPortId, "inputPackets");
    this.expireMacEntries();
    const ingressConfiguration = this.getPortConfiguration(ingressPortId);
    const sourceMac = normalizeMacAddress(frame.sourceMac);
    const destinationMac = normalizeMacAddress(frame.destinationMac);
    this.events.recordEvent(
      "ethernet-frame-received",
      `${this.running.hostname} reçoit une trame ${frame.etherType} sur ${this.portName(ingressPortId)}.`,
      {
        layer: "L2",
        sourceMac,
        destinationMac,
        ingressPortId,
        etherType: frame.etherType,
        vlanId: frame.vlanId === undefined ? "" : String(frame.vlanId),
      },
    );

    if (!ingressConfiguration.enabled || !this.isPhysicallyActive(ingressPortId)) {
      this.drop(frame, ingressPortId, "Le port d’entrée est désactivé ou sans liaison active.");
      return [];
    }
    const vlanId = this.ingressVlan(ingressConfiguration, frame);
    if (vlanId === null || !this.running.vlans.some((vlan) => vlan.id === vlanId)) {
      this.drop(frame, ingressPortId, "La trame est marquée avec un VLAN non autorisé ou inexistant.");
      return [];
    }
    if (!this.learnSource(sourceMac, ingressPortId, vlanId)) return [];

    const destinationEntry = this.findMacEntry(vlanId, destinationMac);
    if (destinationEntry?.portInterfaceId === ingressPortId) {
      this.drop(frame, ingressPortId, `La destination ${destinationMac} est connue sur le port d’entrée.`);
      return [];
    }

    if (!destinationEntry || isMulticastMacAddress(destinationMac)) {
      const egress = this.activePorts()
        .filter((portId) => portId !== ingressPortId)
        .map((portId) => this.prepareEgress(portId, vlanId, frame))
        .filter((entry): entry is SwitchEgress => entry !== null);
      this.events.recordEvent(
        "ethernet-frame-flooded",
        `Destination ${destinationMac} ${destinationEntry ? "de diffusion" : "inconnue"} : diffusion du VLAN ${vlanId} sur ${egress.length} port(s), sauf le port d’entrée.`,
        {
          layer: "L2",
          destinationMac,
          ingressPortId,
          vlanId: String(vlanId),
          egressPorts: egress.map((entry) => entry.portInterfaceId).join(","),
        },
      );
      return egress;
    }

    const forwarded = this.prepareEgress(destinationEntry.portInterfaceId, vlanId, frame);
    if (!forwarded) return [];
    this.events.recordEvent(
      "ethernet-frame-forwarded",
      `Destination ${destinationMac} connue dans le VLAN ${vlanId} : transfert vers ${this.portName(forwarded.portInterfaceId)}.`,
      {
        layer: "L2",
        destinationMac,
        ingressPortId,
        egressPortId: forwarded.portInterfaceId,
        vlanId: String(vlanId),
      },
    );
    return [forwarded];
  }

  private learnSource(
    macAddress: MacAddress,
    portInterfaceId: InterfaceId,
    vlanId: number,
  ): boolean {
    if (isMulticastMacAddress(macAddress)) {
      this.incrementCounter(portInterfaceId, "inputErrors");
      this.events.recordEvent(
        "ethernet-frame-dropped",
        `Adresse MAC source multicast invalide : ${macAddress} sur ${this.portName(portInterfaceId)}.`,
        { layer: "L2", sourceMac: macAddress, ingressPortId: portInterfaceId, vlanId: String(vlanId) },
      );
      return false;
    }

    const key = this.macKey(vlanId, macAddress);
    const previous = this.macTable.get(key);
    if (previous?.type === "static") {
      if (previous.portInterfaceId !== portInterfaceId) {
        this.incrementCounter(portInterfaceId, "inputErrors");
        this.events.recordEvent(
          "ethernet-frame-dropped",
          `L’adresse MAC ${macAddress} est statique sur ${this.portName(previous.portInterfaceId)} dans le VLAN ${vlanId}.`,
          { layer: "L2", macAddress, ingressPortId: portInterfaceId, vlanId: String(vlanId) },
        );
        return false;
      }
      return true;
    }
    this.macTable.set(key, {
      macAddress,
      portInterfaceId,
      vlanId,
      type: "dynamic",
      lastUpdated: this.now(),
    });
    if (previous?.portInterfaceId === portInterfaceId) return true;

    const moved = previous !== undefined;
    this.events.recordEvent(
      moved ? "switch-mac-moved" : "switch-mac-learned",
      moved
        ? `L’adresse ${macAddress} a été réapprise sur ${this.portName(portInterfaceId)} dans le VLAN ${vlanId}.`
        : `Adresse MAC ${macAddress} apprise sur ${this.portName(portInterfaceId)} dans le VLAN ${vlanId}.`,
      {
        layer: "L2",
        macAddress,
        portInterfaceId,
        previousPortInterfaceId: previous?.portInterfaceId ?? "",
        vlanId: String(vlanId),
      },
    );
    return true;
  }

  private ingressVlan(port: SwitchPortConfiguration, frame: EthernetFrame): number | null {
    if (port.mode === "access") {
      return frame.vlanId === undefined ? port.accessVlan : null;
    }
    const vlanId = frame.vlanId ?? port.nativeVlan;
    return isVlanAllowed(port.allowedVlans, vlanId) ? vlanId : null;
  }

  private prepareEgress(
    portInterfaceId: InterfaceId,
    vlanId: number,
    frame: EthernetFrame,
  ): SwitchEgress | null {
    const port = this.getPortConfiguration(portInterfaceId);
    if (!port.enabled || !this.isPhysicallyActive(portInterfaceId)) return null;
    let preparedFrame: EthernetFrame;
    if (port.mode === "access") {
      if (port.accessVlan !== vlanId) return null;
      preparedFrame = this.withVlan(frame, undefined);
    } else {
      if (!isVlanAllowed(port.allowedVlans, vlanId)) return null;
      preparedFrame = this.withVlan(frame, vlanId === port.nativeVlan ? undefined : vlanId);
    }
    this.incrementCounter(portInterfaceId, "outputPackets");
    return { portInterfaceId, frame: preparedFrame };
  }

  private withVlan(frame: EthernetFrame, vlanId: number | undefined): EthernetFrame {
    const { vlanId: _oldVlanId, ...untagged } = frame;
    return vlanId === undefined ? untagged : { ...untagged, vlanId };
  }

  private findMacEntry(vlanId: number, macAddress: MacAddress): StoredMacEntry | undefined {
    this.expireMacEntries();
    return this.macTable.get(this.macKey(vlanId, macAddress));
  }

  private expireMacEntries(): void {
    const agingTimeMs = this.macAgingTimeMsOverride
      ?? this.running.macAgingTimeSeconds * 1000;
    if (agingTimeMs === 0) return;
    const now = this.now();
    for (const [key, entry] of this.macTable) {
      if (entry.type === "dynamic" && now - entry.lastUpdated >= agingTimeMs) {
        this.macTable.delete(key);
      }
    }
  }

  private macKey(vlanId: number, macAddress: string): string {
    return `${vlanId}:${macAddress}`;
  }

  private installStaticMacEntries(): void {
    for (const entry of this.running.staticMacEntries) {
      const macAddress = normalizeMacAddress(entry.macAddress);
      this.macTable.set(this.macKey(entry.vlanId, macAddress), {
        macAddress,
        portInterfaceId: entry.portInterfaceId,
        vlanId: entry.vlanId,
        type: "static",
        lastUpdated: this.now(),
      });
    }
  }

  private assertPort(portInterfaceId: InterfaceId): void {
    if (!this.switchPortIds.has(portInterfaceId)) {
      throw new Error(`L’interface ${portInterfaceId} n’est pas un port du commutateur ${this.name}.`);
    }
  }

  private assertVlanExists(vlanId: number): void {
    if (!this.running.vlans.some((vlan) => vlan.id === vlanId)) {
      throw new Error(`Le VLAN ${vlanId} n’existe pas.`);
    }
  }

  private incrementCounter(
    portInterfaceId: InterfaceId,
    counter: keyof MutableSwitchInterfaceCounters,
  ): void {
    const counters = this.interfaceCounters.get(portInterfaceId);
    if (!counters) throw new Error(`Les compteurs du port ${portInterfaceId} sont introuvables.`);
    counters[counter] += 1;
  }

  private isPhysicallyActive(portInterfaceId: InterfaceId): boolean {
    return this.topology.getConnectionForInterface(portInterfaceId) !== undefined;
  }

  private portName(portInterfaceId: InterfaceId): string {
    return this.topology.getInterface(portInterfaceId)?.name ?? portInterfaceId;
  }

  private activePorts(): InterfaceId[] {
    return [...this.switchPortIds].filter((portId) =>
      this.getPortConfiguration(portId).enabled && this.isPhysicallyActive(portId));
  }

  private drop(frame: EthernetFrame, portInterfaceId: InterfaceId, reason: string): void {
    this.incrementCounter(portInterfaceId, "inputErrors");
    this.events.recordEvent(
      "ethernet-frame-dropped",
      `${reason} ${frame.sourceMac} → ${frame.destinationMac} sur ${this.portName(portInterfaceId)}.`,
      { layer: "L2", sourceMac: frame.sourceMac, destinationMac: frame.destinationMac, ingressPortId: portInterfaceId },
    );
  }
}

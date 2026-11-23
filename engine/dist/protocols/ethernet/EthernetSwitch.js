import { isMulticastMacAddress, normalizeMacAddress, } from "../arp/arp.js";
import { createDefaultSwitchConfiguration, defaultSwitchPortConfiguration, isVlanAllowed, normalizeSwitchConfiguration, } from "./SwitchConfiguration.js";
export class EthernetSwitch {
    name;
    topology;
    events;
    now;
    macAgingTimeMs;
    macTable = new Map();
    running;
    startup;
    switchPortIds;
    switchModel;
    constructor(name, portInterfaceIds, topology, events, configuration, now = Date.now, macAgingTimeMs = 300_000) {
        this.name = name;
        this.topology = topology;
        this.events = events;
        this.now = now;
        this.macAgingTimeMs = macAgingTimeMs;
        this.switchPortIds = new Set(portInterfaceIds);
        const normalized = normalizeSwitchConfiguration(configuration, name, portInterfaceIds);
        this.switchModel = normalized.model;
        this.running = normalized.running;
        this.startup = normalized.startup;
        this.installStaticMacEntries();
    }
    get persistentConfiguration() {
        return { model: this.model, running: this.running, startup: this.startup };
    }
    get model() {
        return this.switchModel;
    }
    get runningConfiguration() {
        return this.running;
    }
    get startupConfiguration() {
        return this.startup;
    }
    get portInterfaceIds() {
        return [...this.switchPortIds];
    }
    getPortName(portInterfaceId) {
        this.assertPort(portInterfaceId);
        return this.portName(portInterfaceId);
    }
    get macTableSnapshot() {
        this.expireMacEntries();
        return [...this.macTable.values()].map((entry) => ({ ...entry }));
    }
    getPortConfiguration(portInterfaceId) {
        this.assertPort(portInterfaceId);
        return this.running.ports[portInterfaceId] ?? defaultSwitchPortConfiguration();
    }
    isPortOperational(portInterfaceId) {
        return this.getPortConfiguration(portInterfaceId).enabled
            && this.isPhysicallyActive(portInterfaceId);
    }
    setRunningConfiguration(configuration) {
        const normalized = normalizeSwitchConfiguration({ model: this.switchModel, running: configuration, startup: this.startup }, this.running.hostname, [...this.switchPortIds]);
        this.running = normalized.running;
        for (const [key, entry] of this.macTable) {
            if (entry.type === "static")
                this.macTable.delete(key);
        }
        this.installStaticMacEntries();
    }
    saveStartupConfiguration() {
        this.startup = structuredClone(this.running);
    }
    reloadStartupConfiguration() {
        this.running = this.startup
            ? structuredClone(this.startup)
            : createDefaultSwitchConfiguration(this.name, [...this.switchPortIds], this.switchModel).running;
        this.macTable.clear();
        this.installStaticMacEntries();
    }
    addStaticMacAddress(macAddress, vlanId, portInterfaceId) {
        this.assertPort(portInterfaceId);
        const mac = normalizeMacAddress(macAddress);
        this.assertVlanExists(vlanId);
        if (isMulticastMacAddress(mac))
            throw new Error("Une entrée MAC statique doit être une adresse unicast.");
        this.macTable.set(this.macKey(vlanId, mac), {
            macAddress: mac,
            portInterfaceId,
            vlanId,
            type: "static",
            lastUpdated: this.now(),
        });
    }
    clearDynamicMacAddresses(vlanId) {
        this.expireMacEntries();
        let removed = 0;
        for (const [key, entry] of this.macTable) {
            if (entry.type === "dynamic" && (vlanId === undefined || entry.vlanId === vlanId)) {
                this.macTable.delete(key);
                removed += 1;
            }
        }
        this.events.recordEvent("switch-mac-table-cleared", `${removed} entrée(s) MAC dynamique(s) supprimée(s)${vlanId === undefined ? "" : ` du VLAN ${vlanId}`}.`, { layer: "L2", vlanId: vlanId === undefined ? "" : String(vlanId), count: String(removed) });
        return removed;
    }
    removeVlanMacEntries(vlanId) {
        for (const [key, entry] of this.macTable) {
            if (entry.vlanId === vlanId)
                this.macTable.delete(key);
        }
    }
    receive(ingressPortId, frame) {
        this.assertPort(ingressPortId);
        this.expireMacEntries();
        const ingressConfiguration = this.getPortConfiguration(ingressPortId);
        const sourceMac = normalizeMacAddress(frame.sourceMac);
        const destinationMac = normalizeMacAddress(frame.destinationMac);
        this.events.recordEvent("ethernet-frame-received", `${this.running.hostname} reçoit une trame ${frame.etherType} sur ${this.portName(ingressPortId)}.`, {
            layer: "L2",
            sourceMac,
            destinationMac,
            ingressPortId,
            etherType: frame.etherType,
            vlanId: frame.vlanId === undefined ? "" : String(frame.vlanId),
        });
        if (!ingressConfiguration.enabled || !this.isPhysicallyActive(ingressPortId)) {
            this.drop(frame, ingressPortId, "Le port d’entrée est désactivé ou sans liaison active.");
            return [];
        }
        const vlanId = this.ingressVlan(ingressConfiguration, frame);
        if (vlanId === null || !this.running.vlans.some((vlan) => vlan.id === vlanId)) {
            this.drop(frame, ingressPortId, "La trame est marquée avec un VLAN non autorisé ou inexistant.");
            return [];
        }
        if (!this.learnSource(sourceMac, ingressPortId, vlanId))
            return [];
        const destinationEntry = this.findMacEntry(vlanId, destinationMac);
        if (destinationEntry?.portInterfaceId === ingressPortId) {
            this.drop(frame, ingressPortId, `La destination ${destinationMac} est connue sur le port d’entrée.`);
            return [];
        }
        if (!destinationEntry || isMulticastMacAddress(destinationMac)) {
            const egress = this.activePorts()
                .filter((portId) => portId !== ingressPortId)
                .map((portId) => this.prepareEgress(portId, vlanId, frame))
                .filter((entry) => entry !== null);
            this.events.recordEvent("ethernet-frame-flooded", `Destination ${destinationMac} ${destinationEntry ? "de diffusion" : "inconnue"} : diffusion du VLAN ${vlanId} sur ${egress.length} port(s), sauf le port d’entrée.`, {
                layer: "L2",
                destinationMac,
                ingressPortId,
                vlanId: String(vlanId),
                egressPorts: egress.map((entry) => entry.portInterfaceId).join(","),
            });
            return egress;
        }
        const forwarded = this.prepareEgress(destinationEntry.portInterfaceId, vlanId, frame);
        if (!forwarded)
            return [];
        this.events.recordEvent("ethernet-frame-forwarded", `Destination ${destinationMac} connue dans le VLAN ${vlanId} : transfert vers ${this.portName(forwarded.portInterfaceId)}.`, {
            layer: "L2",
            destinationMac,
            ingressPortId,
            egressPortId: forwarded.portInterfaceId,
            vlanId: String(vlanId),
        });
        return [forwarded];
    }
    learnSource(macAddress, portInterfaceId, vlanId) {
        if (isMulticastMacAddress(macAddress)) {
            this.events.recordEvent("ethernet-frame-dropped", `Adresse MAC source multicast invalide : ${macAddress} sur ${this.portName(portInterfaceId)}.`, { layer: "L2", sourceMac: macAddress, ingressPortId: portInterfaceId, vlanId: String(vlanId) });
            return false;
        }
        const key = this.macKey(vlanId, macAddress);
        const previous = this.macTable.get(key);
        if (previous?.type === "static") {
            if (previous.portInterfaceId !== portInterfaceId) {
                this.events.recordEvent("ethernet-frame-dropped", `L’adresse MAC ${macAddress} est statique sur ${this.portName(previous.portInterfaceId)} dans le VLAN ${vlanId}.`, { layer: "L2", macAddress, ingressPortId: portInterfaceId, vlanId: String(vlanId) });
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
        if (previous?.portInterfaceId === portInterfaceId)
            return true;
        const moved = previous !== undefined;
        this.events.recordEvent(moved ? "switch-mac-moved" : "switch-mac-learned", moved
            ? `L’adresse ${macAddress} a été réapprise sur ${this.portName(portInterfaceId)} dans le VLAN ${vlanId}.`
            : `Adresse MAC ${macAddress} apprise sur ${this.portName(portInterfaceId)} dans le VLAN ${vlanId}.`, {
            layer: "L2",
            macAddress,
            portInterfaceId,
            previousPortInterfaceId: previous?.portInterfaceId ?? "",
            vlanId: String(vlanId),
        });
        return true;
    }
    ingressVlan(port, frame) {
        if (port.mode === "access") {
            return frame.vlanId === undefined ? port.accessVlan : null;
        }
        const vlanId = frame.vlanId ?? port.nativeVlan;
        return isVlanAllowed(port.allowedVlans, vlanId) ? vlanId : null;
    }
    prepareEgress(portInterfaceId, vlanId, frame) {
        const port = this.getPortConfiguration(portInterfaceId);
        if (!port.enabled || !this.isPhysicallyActive(portInterfaceId))
            return null;
        let preparedFrame;
        if (port.mode === "access") {
            if (port.accessVlan !== vlanId)
                return null;
            preparedFrame = this.withVlan(frame, undefined);
        }
        else {
            if (!isVlanAllowed(port.allowedVlans, vlanId))
                return null;
            preparedFrame = this.withVlan(frame, vlanId === port.nativeVlan ? undefined : vlanId);
        }
        return { portInterfaceId, frame: preparedFrame };
    }
    withVlan(frame, vlanId) {
        const { vlanId: _oldVlanId, ...untagged } = frame;
        return vlanId === undefined ? untagged : { ...untagged, vlanId };
    }
    findMacEntry(vlanId, macAddress) {
        this.expireMacEntries();
        return this.macTable.get(this.macKey(vlanId, macAddress));
    }
    expireMacEntries() {
        const now = this.now();
        for (const [key, entry] of this.macTable) {
            if (entry.type === "dynamic" && now - entry.lastUpdated >= this.macAgingTimeMs) {
                this.macTable.delete(key);
            }
        }
    }
    macKey(vlanId, macAddress) {
        return `${vlanId}:${macAddress}`;
    }
    installStaticMacEntries() {
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
    assertPort(portInterfaceId) {
        if (!this.switchPortIds.has(portInterfaceId)) {
            throw new Error(`L’interface ${portInterfaceId} n’est pas un port du commutateur ${this.name}.`);
        }
    }
    assertVlanExists(vlanId) {
        if (!this.running.vlans.some((vlan) => vlan.id === vlanId)) {
            throw new Error(`Le VLAN ${vlanId} n’existe pas.`);
        }
    }
    isPhysicallyActive(portInterfaceId) {
        return this.topology.getConnectionForInterface(portInterfaceId) !== undefined;
    }
    portName(portInterfaceId) {
        return this.topology.getInterface(portInterfaceId)?.name ?? portInterfaceId;
    }
    activePorts() {
        return [...this.switchPortIds].filter((portId) => this.getPortConfiguration(portId).enabled && this.isPhysicallyActive(portId));
    }
    drop(frame, portInterfaceId, reason) {
        this.events.recordEvent("ethernet-frame-dropped", `${reason} ${frame.sourceMac} → ${frame.destinationMac} sur ${this.portName(portInterfaceId)}.`, { layer: "L2", sourceMac: frame.sourceMac, destinationMac: frame.destinationMac, ingressPortId: portInterfaceId });
    }
}

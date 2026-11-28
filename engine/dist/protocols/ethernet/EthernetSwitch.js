import { isMulticastMacAddress, normalizeMacAddress, } from "../arp/arp.js";
import { CATALYST_3560_MODEL, createDefaultSwitchConfiguration, defaultSwitchPortConfiguration, isVlanAllowed, normalizeSwitchConfiguration, } from "./SwitchConfiguration.js";
export class EthernetSwitch {
    name;
    topology;
    events;
    now;
    macAgingTimeMsOverride;
    macTable = new Map();
    interfaceCounters = new Map();
    running;
    startup;
    switchPortIds;
    switchModel;
    layer3FrameHandler;
    configurationChangeHandler;
    constructor(name, portInterfaceIds, topology, events, configuration, now = Date.now, macAgingTimeMsOverride) {
        this.name = name;
        this.topology = topology;
        this.events = events;
        this.now = now;
        this.macAgingTimeMsOverride = macAgingTimeMsOverride;
        this.switchPortIds = new Set(portInterfaceIds);
        for (const portInterfaceId of this.switchPortIds) {
            this.interfaceCounters.set(portInterfaceId, {
                inputPackets: 0,
                outputPackets: 0,
                inputErrors: 0,
                outputErrors: 0,
            });
        }
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
    getPortMacAddress(portInterfaceId) {
        this.assertPort(portInterfaceId);
        return this.topology.getInterface(portInterfaceId)?.macAddress;
    }
    getPortCounters(portInterfaceId) {
        this.assertPort(portInterfaceId);
        const counters = this.interfaceCounters.get(portInterfaceId);
        if (!counters)
            throw new Error(`Les compteurs du port ${portInterfaceId} sont introuvables.`);
        return { ...counters };
    }
    isPortOperational(portInterfaceId) {
        return this.getPortConfiguration(portInterfaceId).enabled
            && this.isPhysicallyActive(portInterfaceId);
    }
    get supportsLayer3() {
        return this.switchModel === CATALYST_3560_MODEL;
    }
    setLayer3FrameHandler(handler) {
        this.layer3FrameHandler = handler;
    }
    setConfigurationChangeHandler(handler) {
        this.configurationChangeHandler = handler;
        handler();
    }
    isVlanOperational(vlanId) {
        if (!this.running.vlans.some((vlan) => vlan.id === vlanId))
            return false;
        return this.activePorts().some((portId) => {
            const port = this.getPortConfiguration(portId);
            return port.mode === "access"
                ? port.accessVlan === vlanId
                : isVlanAllowed(port.allowedVlans, vlanId);
        });
    }
    setRunningConfiguration(configuration) {
        const normalized = normalizeSwitchConfiguration({ model: this.switchModel, running: configuration, startup: this.startup }, this.running.hostname, [...this.switchPortIds]);
        this.running = normalized.running;
        for (const [key, entry] of this.macTable) {
            if (entry.type === "static")
                this.macTable.delete(key);
        }
        this.installStaticMacEntries();
        this.configurationChangeHandler?.();
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
        this.configurationChangeHandler?.();
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
    clearDynamicMacAddresses(vlanId, portInterfaceId) {
        if (portInterfaceId !== undefined)
            this.assertPort(portInterfaceId);
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
        this.events.recordEvent("switch-mac-table-cleared", `${removed} entrée(s) MAC dynamique(s) supprimée(s)${vlanId === undefined ? "" : ` du VLAN ${vlanId}`}${portInterfaceId === undefined ? "" : ` sur ${this.portName(portInterfaceId)}`}.`, {
            layer: "L2",
            vlanId: vlanId === undefined ? "" : String(vlanId),
            portInterfaceId: portInterfaceId ?? "",
            count: String(removed),
        });
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
        this.incrementCounter(ingressPortId, "inputPackets");
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
        if (!ingressConfiguration.switchport) {
            if (!this.supportsLayer3 || frame.vlanId !== undefined || !this.layer3FrameHandler) {
                this.drop(frame, ingressPortId, "Le port routé ne peut pas traiter cette trame.");
            }
            else {
                this.layer3FrameHandler(ingressPortId, null, frame);
            }
            return [];
        }
        const vlanId = this.ingressVlan(ingressConfiguration, frame);
        if (vlanId === null || !this.running.vlans.some((vlan) => vlan.id === vlanId)) {
            this.drop(frame, ingressPortId, "La trame est marquée avec un VLAN non autorisé ou inexistant.");
            return [];
        }
        if (!this.learnSource(sourceMac, ingressPortId, vlanId))
            return [];
        if (this.layer3FrameHandler?.(ingressPortId, vlanId, frame))
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
    forwardFromVlan(vlanId, frame) {
        if (!this.supportsLayer3)
            throw new Error("Le routage depuis un VLAN nécessite un Catalyst 3560.");
        this.assertVlanExists(vlanId);
        const destinationMac = normalizeMacAddress(frame.destinationMac);
        const destination = this.findMacEntry(vlanId, destinationMac);
        if (destination) {
            const egress = this.prepareEgress(destination.portInterfaceId, vlanId, frame);
            return egress ? [egress] : [];
        }
        return this.activePorts()
            .map((portId) => this.prepareEgress(portId, vlanId, frame))
            .filter((entry) => entry !== null);
    }
    recordRoutedOutput(portInterfaceId) {
        this.assertPort(portInterfaceId);
        const port = this.getPortConfiguration(portInterfaceId);
        if (!this.supportsLayer3 || port.switchport || !this.isPortOperational(portInterfaceId)) {
            throw new Error(`Le port ${this.portName(portInterfaceId)} n’est pas opérationnel en mode routé.`);
        }
        this.incrementCounter(portInterfaceId, "outputPackets");
    }
    learnSource(macAddress, portInterfaceId, vlanId) {
        if (isMulticastMacAddress(macAddress)) {
            this.incrementCounter(portInterfaceId, "inputErrors");
            this.events.recordEvent("ethernet-frame-dropped", `Adresse MAC source multicast invalide : ${macAddress} sur ${this.portName(portInterfaceId)}.`, { layer: "L2", sourceMac: macAddress, ingressPortId: portInterfaceId, vlanId: String(vlanId) });
            return false;
        }
        const key = this.macKey(vlanId, macAddress);
        const previous = this.macTable.get(key);
        if (previous?.type === "static") {
            if (previous.portInterfaceId !== portInterfaceId) {
                this.incrementCounter(portInterfaceId, "inputErrors");
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
        if (!port.switchport || !port.enabled || !this.isPhysicallyActive(portInterfaceId))
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
        this.incrementCounter(portInterfaceId, "outputPackets");
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
        const agingTimeMs = this.macAgingTimeMsOverride
            ?? this.running.macAgingTimeSeconds * 1000;
        if (agingTimeMs === 0)
            return;
        const now = this.now();
        for (const [key, entry] of this.macTable) {
            if (entry.type === "dynamic" && now - entry.lastUpdated >= agingTimeMs) {
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
    incrementCounter(portInterfaceId, counter) {
        const counters = this.interfaceCounters.get(portInterfaceId);
        if (!counters)
            throw new Error(`Les compteurs du port ${portInterfaceId} sont introuvables.`);
        counters[counter] += 1;
    }
    isPhysicallyActive(portInterfaceId) {
        return this.topology.getConnectionForInterface(portInterfaceId) !== undefined;
    }
    portName(portInterfaceId) {
        return this.topology.getInterface(portInterfaceId)?.name ?? portInterfaceId;
    }
    activePorts() {
        return [...this.switchPortIds].filter((portId) => this.getPortConfiguration(portId).switchport
            && this.getPortConfiguration(portId).enabled
            && this.isPhysicallyActive(portId));
    }
    drop(frame, portInterfaceId, reason) {
        this.incrementCounter(portInterfaceId, "inputErrors");
        this.events.recordEvent("ethernet-frame-dropped", `${reason} ${frame.sourceMac} → ${frame.destinationMac} sur ${this.portName(portInterfaceId)}.`, { layer: "L2", sourceMac: frame.sourceMac, destinationMac: frame.destinationMac, ingressPortId: portInterfaceId });
    }
}

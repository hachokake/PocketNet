import { Packet } from "../domain/Packet.js";
import { SimulationError } from "../domain/SimulationError.js";
import { NetworkTopology } from "../topology/NetworkTopology.js";
export class SimulationEngine {
    topology;
    idFactory;
    clock;
    eventLog = [];
    packetLog = [];
    currentStatus = "idle";
    constructor(options = {}) {
        this.idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
        this.clock = options.clock ?? (() => new Date());
        this.topology = new NetworkTopology(this.idFactory);
    }
    get status() {
        return this.currentStatus;
    }
    get events() {
        return this.eventLog.map((event) => ({
            ...event,
            details: { ...event.details },
        }));
    }
    get packets() {
        return [...this.packetLog];
    }
    createDevice(name, kind) {
        const device = this.topology.createDevice(name, kind);
        this.recordEvent("device-created", `Équipement « ${device.name} » créé.`, {
            deviceId: device.id,
            kind: device.kind,
        });
        return device;
    }
    createInterface(deviceId, name, macAddress) {
        const networkInterface = this.topology.createInterface(deviceId, name, macAddress);
        this.recordEvent("interface-created", `Interface « ${networkInterface.name} » créée.`, {
            deviceId,
            interfaceId: networkInterface.id,
            macAddress: networkInterface.macAddress,
        });
        return networkInterface;
    }
    connectInterfaces(firstInterfaceId, secondInterfaceId) {
        try {
            const connection = this.topology.connectInterfaces(firstInterfaceId, secondInterfaceId);
            this.recordEvent("connection-created", "Connexion créée entre deux interfaces.", {
                connectionId: connection.id,
                firstInterfaceId,
                secondInterfaceId,
            });
            return connection;
        }
        catch (error) {
            if (error instanceof SimulationError) {
                this.recordEvent("connection-error", error.message, {
                    code: error.code,
                    firstInterfaceId,
                    secondInterfaceId,
                });
            }
            throw error;
        }
    }
    createPacket(input) {
        const source = this.topology.getInterface(input.sourceInterfaceId);
        const destination = this.topology.getInterface(input.destinationInterfaceId);
        if (!source || !destination) {
            throw new SimulationError("invalid-packet", "Le paquet doit référencer des interfaces présentes dans la topologie.");
        }
        const packet = new Packet({
            id: this.idFactory(),
            sourceInterfaceId: source.id,
            destinationInterfaceId: destination.id,
            payload: input.payload,
            createdAt: this.clock().toISOString(),
        });
        this.packetLog.push(packet);
        this.recordEvent("packet-created", "Paquet enregistré comme structure de données ; aucun protocole ni transfert n’a été exécuté.", { packetId: packet.id });
        return packet;
    }
    start() {
        this.requireStatus(["idle", "stopped"], "Le moteur ne peut démarrer que depuis l’état inactif ou arrêté.");
        this.currentStatus = "running";
        this.recordEvent("simulation-started", "Cycle de simulation démarré ; aucun protocole réseau n’est encore exécuté.");
    }
    pause() {
        this.requireStatus(["running"], "Seul un moteur en cours d’exécution peut être mis en pause.");
        this.currentStatus = "paused";
        this.recordEvent("simulation-paused", "Cycle de simulation mis en pause.");
    }
    resume() {
        this.requireStatus(["paused"], "Seul un moteur en pause peut reprendre son exécution.");
        this.currentStatus = "running";
        this.recordEvent("simulation-resumed", "Cycle de simulation repris ; aucun protocole réseau n’est encore exécuté.");
    }
    stop() {
        this.requireStatus(["running", "paused"], "Seul un moteur actif peut être arrêté.");
        this.currentStatus = "stopped";
        this.recordEvent("simulation-stopped", "Cycle de simulation arrêté ; aucun protocole réseau n’a été exécuté.");
    }
    requireStatus(allowedStatuses, message) {
        if (!allowedStatuses.includes(this.currentStatus)) {
            throw new SimulationError("invalid-simulation-state", message);
        }
    }
    recordEvent(type, message, details = {}) {
        this.eventLog.push({
            id: this.idFactory(),
            type,
            timestamp: this.clock().toISOString(),
            message,
            details: { ...details },
        });
    }
}

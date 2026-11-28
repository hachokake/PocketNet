import { getNetworkAddress, normalizeIPv4Address, validateIPv4Configuration, } from "../ipv4/address.js";
export const CATALYST_2960_MODEL = "catalyst-2960";
export const CATALYST_3560_MODEL = "catalyst-3560";
const CATALYST_2960_DEFAULT_VLANS = [
    { id: 1, name: "default", status: "active" },
    { id: 1002, name: "fddi-default", status: "active" },
    { id: 1003, name: "token-ring-default", status: "active" },
    { id: 1004, name: "fddinet-default", status: "active" },
    { id: 1005, name: "trnet-default", status: "active" },
];
const RESERVED_VLAN_IDS = new Set([1002, 1003, 1004, 1005]);
function defaultVlansForModel(model) {
    switch (model) {
        case CATALYST_2960_MODEL:
        case CATALYST_3560_MODEL:
            return CATALYST_2960_DEFAULT_VLANS;
    }
}
export function isReservedVlanId(vlanId) {
    return RESERVED_VLAN_IDS.has(vlanId);
}
export function defaultSwitchPortConfiguration() {
    return {
        enabled: true,
        switchport: true,
        mode: "access",
        accessVlan: 1,
        nativeVlan: 1,
        allowedVlans: "all",
        description: "",
        speedMbps: "auto",
        duplex: "auto",
    };
}
export function createDefaultSwitchConfiguration(hostname, portIds, model = CATALYST_2960_MODEL) {
    const running = {
        hostname,
        vlans: defaultVlansForModel(model).map((vlan) => ({ ...vlan })),
        ports: Object.fromEntries(portIds.map((id) => [id, defaultSwitchPortConfiguration()])),
        staticMacEntries: [],
        macAgingTimeSeconds: 300,
        consoleLine: { loginRequired: false, password: "" },
        ...(model === CATALYST_3560_MODEL
            ? { ipRouting: false, vlanInterfaces: [], routedPorts: {}, staticRoutes: [] }
            : {}),
    };
    return {
        model,
        running,
        startup: null,
    };
}
function isVlanId(value) {
    return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 4094;
}
function normalizeRunningConfiguration(value, hostname, portIds, model) {
    if (value === null || typeof value !== "object") {
        throw new Error("La configuration du commutateur doit être un objet.");
    }
    const candidate = value;
    if (typeof candidate.hostname !== "string" || !candidate.hostname.trim()) {
        throw new Error("Le nom d’hôte du commutateur est invalide.");
    }
    if (!Array.isArray(candidate.vlans)
        || !candidate.ports
        || typeof candidate.ports !== "object") {
        throw new Error("La base VLAN ou la configuration des ports est invalide.");
    }
    const vlanIds = new Set();
    const vlans = candidate.vlans.map((vlan) => {
        if (!vlan
            || !isVlanId(vlan.id)
            || typeof vlan.name !== "string"
            || !vlan.name.trim()
            || (vlan.status !== undefined && vlan.status !== "active")
            || vlanIds.has(vlan.id)) {
            throw new Error("La base VLAN contient une entrée invalide ou dupliquée.");
        }
        vlanIds.add(vlan.id);
        return { id: vlan.id, name: vlan.name.trim(), status: "active" };
    });
    for (const vlan of defaultVlansForModel(model)) {
        if (!vlanIds.has(vlan.id)) {
            vlans.push({ ...vlan });
            vlanIds.add(vlan.id);
        }
    }
    const ports = {};
    for (const id of portIds) {
        const port = candidate.ports[id] ?? defaultSwitchPortConfiguration();
        if (typeof port.enabled !== "boolean"
            || (port.switchport !== undefined && typeof port.switchport !== "boolean")
            || (port.mode !== "access" && port.mode !== "trunk")
            || !isVlanId(port.accessVlan)
            || !isVlanId(port.nativeVlan)
            || (port.allowedVlans !== "all"
                && (!Array.isArray(port.allowedVlans)
                    || port.allowedVlans.some((vlanId) => !isVlanId(vlanId))))
            || typeof port.description !== "string"
            || ![10, 100, 1000, "auto"].includes(port.speedMbps)
            || !["half", "full", "auto"].includes(port.duplex)) {
            throw new Error(`La configuration du port ${id} est invalide.`);
        }
        if (port.mode === "access" && !vlanIds.has(port.accessVlan)
            || port.mode === "trunk" && !vlanIds.has(port.nativeVlan)) {
            throw new Error(`Le port ${id} référence un VLAN inexistant.`);
        }
        ports[id] = {
            enabled: port.enabled,
            switchport: port.switchport ?? true,
            mode: port.mode,
            accessVlan: port.accessVlan,
            nativeVlan: port.nativeVlan,
            allowedVlans: port.allowedVlans === "all" ? "all" : [...new Set(port.allowedVlans)],
            description: port.description,
            speedMbps: port.speedMbps,
            duplex: port.duplex,
        };
    }
    const staticMacEntries = (candidate.staticMacEntries ?? []).map((entry) => {
        if (!entry
            || typeof entry.macAddress !== "string"
            || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(entry.macAddress)
            || (Number.parseInt(entry.macAddress.slice(0, 2), 16) & 1) !== 0
            || !isVlanId(entry.vlanId)
            || !vlanIds.has(entry.vlanId)
            || !portIds.includes(entry.portInterfaceId)
            || ports[entry.portInterfaceId]?.switchport === false) {
            throw new Error("Une entrée MAC statique est invalide.");
        }
        return {
            macAddress: entry.macAddress.toLowerCase(),
            vlanId: entry.vlanId,
            portInterfaceId: entry.portInterfaceId,
        };
    });
    const staticEntryKeys = staticMacEntries.map((entry) => `${entry.vlanId}:${entry.macAddress}`);
    if (new Set(staticEntryKeys).size !== staticEntryKeys.length) {
        throw new Error("La configuration contient des entrées MAC statiques dupliquées.");
    }
    const macAgingTimeSeconds = candidate.macAgingTimeSeconds === undefined
        ? 300
        : candidate.macAgingTimeSeconds;
    if (!Number.isInteger(macAgingTimeSeconds)
        || (macAgingTimeSeconds !== 0 && (macAgingTimeSeconds < 10 || macAgingTimeSeconds > 1_000_000))) {
        throw new Error("Le délai de vieillissement MAC doit être 0 ou compris entre 10 et 1000000 secondes.");
    }
    const consoleLine = candidate.consoleLine ?? { loginRequired: false, password: "" };
    if (typeof consoleLine.loginRequired !== "boolean"
        || typeof consoleLine.password !== "string") {
        throw new Error("La configuration de la ligne console est invalide.");
    }
    const layer3Configuration = model === CATALYST_3560_MODEL
        ? normalizeLayer3Configuration(candidate, vlanIds, portIds, ports)
        : undefined;
    if (model === CATALYST_2960_MODEL
        && (candidate.ipRouting !== undefined
            || candidate.vlanInterfaces !== undefined
            || candidate.routedPorts !== undefined
            || candidate.staticRoutes !== undefined
            || Object.values(ports).some((port) => !port.switchport))) {
        throw new Error("Les fonctions Layer 3 nécessitent un Catalyst 3560.");
    }
    return {
        hostname: candidate.hostname.trim(),
        vlans,
        ports,
        staticMacEntries,
        macAgingTimeSeconds,
        consoleLine: { ...consoleLine },
        ...(layer3Configuration ?? {}),
    };
}
function normalizeLayer3Configuration(candidate, vlanIds, portIds, ports) {
    const ipRouting = candidate.ipRouting ?? false;
    if (typeof ipRouting !== "boolean") {
        throw new Error("L’état du routage IPv4 est invalide.");
    }
    const vlanInterfaces = (candidate.vlanInterfaces ?? []).map((interfaceConfiguration) => {
        if (!interfaceConfiguration
            || !isVlanId(interfaceConfiguration.vlanId)
            || !vlanIds.has(interfaceConfiguration.vlanId)
            || typeof interfaceConfiguration.enabled !== "boolean"
            || (interfaceConfiguration.description !== undefined
                && typeof interfaceConfiguration.description !== "string")) {
            throw new Error("Une interface VLAN est invalide ou référence un VLAN inexistant.");
        }
        return {
            vlanId: interfaceConfiguration.vlanId,
            enabled: interfaceConfiguration.enabled,
            description: interfaceConfiguration.description ?? "",
            ipv4: interfaceConfiguration.ipv4
                ? validateIPv4Configuration(interfaceConfiguration.ipv4)
                : null,
        };
    });
    if (new Set(vlanInterfaces.map((item) => item.vlanId)).size !== vlanInterfaces.length) {
        throw new Error("Les interfaces VLAN doivent avoir des identifiants uniques.");
    }
    const routedPorts = {};
    for (const [portId, configuration] of Object.entries(candidate.routedPorts ?? {})) {
        if (!portIds.includes(portId) || ports[portId]?.switchport !== false) {
            throw new Error(`L’interface routée ${portId} n’est pas un port Layer 3.`);
        }
        routedPorts[portId] = validateIPv4Configuration(configuration);
    }
    const addressedInterfaces = [
        ...vlanInterfaces.flatMap((item) => item.ipv4 ? [item.ipv4.address] : []),
        ...Object.values(routedPorts).map((item) => item.address),
    ];
    if (new Set(addressedInterfaces).size !== addressedInterfaces.length) {
        throw new Error("Une adresse IPv4 est configurée sur plusieurs interfaces du commutateur.");
    }
    const staticRoutes = (candidate.staticRoutes ?? []).map((route) => {
        if (!route)
            throw new Error("Une route statique est invalide.");
        const configuration = validateIPv4Configuration({
            address: route.destination,
            subnetMask: route.subnetMask,
        });
        return {
            destination: getNetworkAddress(configuration.address, configuration.subnetMask),
            subnetMask: configuration.subnetMask,
            nextHop: normalizeIPv4Address(route.nextHop),
        };
    });
    const routeKeys = staticRoutes.map((route) => `${route.destination}/${route.subnetMask}`);
    if (new Set(routeKeys).size !== routeKeys.length) {
        throw new Error("La configuration contient des routes statiques dupliquées.");
    }
    return { ipRouting, vlanInterfaces, routedPorts, staticRoutes };
}
export function normalizeSwitchConfiguration(value, hostname, portIds) {
    if (value === undefined || value === null) {
        return createDefaultSwitchConfiguration(hostname, portIds);
    }
    if (typeof value !== "object")
        throw new Error("La configuration persistante du commutateur est invalide.");
    const candidate = value;
    const model = candidate.model ?? CATALYST_2960_MODEL;
    if (model !== CATALYST_2960_MODEL && model !== CATALYST_3560_MODEL) {
        throw new Error(`Le modèle de commutateur ${String(model)} n’est pas pris en charge.`);
    }
    return {
        model,
        running: normalizeRunningConfiguration(candidate.running, hostname, portIds, model),
        startup: candidate.startup === null || candidate.startup === undefined
            ? null
            : normalizeRunningConfiguration(candidate.startup, hostname, portIds, model),
    };
}
export function isVlanAllowed(allowedVlans, vlanId) {
    return allowedVlans === "all" || allowedVlans.includes(vlanId);
}

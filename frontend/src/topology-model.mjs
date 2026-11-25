export const CANVAS_WIDTH = 1800;
export const CANVAS_HEIGHT = 1100;
export const DEVICE_WIDTH = 184;
export const DEVICE_HEIGHT = 160;

const DEVICE_KINDS = ["pc", "laptop", "switch", "router", "server", "access-point"];
const DEFAULT_MASK = "255.255.255.0";
const CATALYST_2960_MODEL = "catalyst-2960";
const CATALYST_2960_DEFAULT_VLANS = [
  { id: 1, name: "default", status: "active" },
  { id: 1002, name: "fddi-default", status: "active" },
  { id: 1003, name: "token-ring-default", status: "active" },
  { id: 1004, name: "fddinet-default", status: "active" },
  { id: 1005, name: "trnet-default", status: "active" },
];

function defaultVlansForModel(model) {
  if (model !== CATALYST_2960_MODEL) {
    throw new Error(`Le modèle de commutateur ${String(model)} n’est pas pris en charge.`);
  }
  return CATALYST_2960_DEFAULT_VLANS;
}

function defaultSwitchPortConfiguration() {
  return {
    enabled: true,
    mode: "access",
    accessVlan: 1,
    nativeVlan: 1,
    allowedVlans: "all",
    description: "",
    speedMbps: "auto",
    duplex: "auto",
  };
}

export function createDefaultSwitchConfiguration(hostname, interfaces, model = CATALYST_2960_MODEL) {
  return {
    model,
    running: {
      hostname,
      vlans: defaultVlansForModel(model).map((vlan) => ({ ...vlan })),
      ports: Object.fromEntries(interfaces.map((networkInterface) => [
        networkInterface.id,
        defaultSwitchPortConfiguration(),
      ])),
      staticMacEntries: [],
      macAgingTimeSeconds: 300,
      consoleLine: { loginRequired: false, password: "" },
    },
    startup: null,
  };
}

function normalizeSwitchRunningConfiguration(value, fallback, hostname, interfaces, model) {
  if (value === undefined || value === null) return fallback.running;
  if (
    typeof value !== "object"
    || typeof value.hostname !== "string"
    || !value.hostname.trim()
    || !Array.isArray(value.vlans)
    || !Array.isArray(value.staticMacEntries ?? [])
    || !value.ports
    || typeof value.ports !== "object"
  ) {
    throw new Error("La configuration enregistrée du commutateur est invalide.");
  }
  const vlans = value.vlans.map((vlan) => {
    if (
      !vlan
      || !Number.isInteger(vlan.id)
      || vlan.id < 1
      || vlan.id > 4094
      || typeof vlan.name !== "string"
      || !vlan.name.trim()
      || (vlan.status !== undefined && vlan.status !== "active")
    ) {
      throw new Error("La base VLAN enregistrée contient une entrée invalide.");
    }
    return { id: vlan.id, name: vlan.name.trim(), status: "active" };
  });
  if (new Set(vlans.map((vlan) => vlan.id)).size !== vlans.length) {
    throw new Error("La base VLAN doit contenir des identifiants uniques.");
  }
  const vlanIds = new Set(vlans.map((vlan) => vlan.id));
  defaultVlansForModel(model).forEach((vlan) => {
    if (!vlanIds.has(vlan.id)) {
      vlans.push({ ...vlan });
      vlanIds.add(vlan.id);
    }
  });
  const ports = Object.fromEntries(interfaces.map((networkInterface) => {
    const port = value.ports[networkInterface.id] || defaultSwitchPortConfiguration();
    if (
      typeof port.enabled !== "boolean"
      || !["access", "trunk"].includes(port.mode)
      || !Number.isInteger(port.accessVlan)
      || !Number.isInteger(port.nativeVlan)
      || !["all"].includes(port.allowedVlans)
        && (!Array.isArray(port.allowedVlans)
          || port.allowedVlans.some((vlanId) => !Number.isInteger(vlanId) || !vlanIds.has(vlanId)))
      || typeof port.description !== "string"
      || ![10, 100, 1000, "auto"].includes(port.speedMbps)
      || !["half", "full", "auto"].includes(port.duplex)
    ) {
      throw new Error(`La configuration enregistrée du port ${networkInterface.name} est invalide.`);
    }
    if (
      !vlanIds.has(port.accessVlan)
      || !vlanIds.has(port.nativeVlan)
    ) {
      throw new Error(`Le port ${networkInterface.name} référence un VLAN inexistant.`);
    }
    return [networkInterface.id, {
      ...port,
      allowedVlans: port.allowedVlans === "all" ? "all" : [...new Set(port.allowedVlans)],
    }];
  }));
  const consoleLine = value.consoleLine ?? { loginRequired: false, password: "" };
  if (
    typeof consoleLine.loginRequired !== "boolean"
    || typeof consoleLine.password !== "string"
  ) {
    throw new Error("La configuration enregistrée de la console est invalide.");
  }
  const staticMacEntries = value.staticMacEntries ?? [];
  if (!Array.isArray(staticMacEntries)) {
    throw new Error("La table MAC statique enregistrée est invalide.");
  }
  const normalizedStaticMacEntries = staticMacEntries.map((entry) => {
    if (
      !entry
      || typeof entry.macAddress !== "string"
      || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(entry.macAddress)
      || (Number.parseInt(entry.macAddress.slice(0, 2), 16) & 1) !== 0
      || !Number.isInteger(entry.vlanId)
      || !vlanIds.has(entry.vlanId)
      || !interfaces.some((networkInterface) => networkInterface.id === entry.portInterfaceId)
    ) {
      throw new Error("Une entrée MAC statique enregistrée est invalide.");
    }
    return { ...entry, macAddress: entry.macAddress.toLowerCase() };
  });
  if (new Set(normalizedStaticMacEntries.map((entry) => `${entry.vlanId}:${entry.macAddress}`)).size
    !== normalizedStaticMacEntries.length) {
    throw new Error("La configuration contient des entrées MAC statiques dupliquées.");
  }
  const macAgingTimeSeconds = value.macAgingTimeSeconds === undefined
    ? 300
    : value.macAgingTimeSeconds;
  if (
    !Number.isInteger(macAgingTimeSeconds)
    || (macAgingTimeSeconds !== 0 && (macAgingTimeSeconds < 10 || macAgingTimeSeconds > 1_000_000))
  ) {
    throw new Error("Le délai de vieillissement MAC doit être 0 ou compris entre 10 et 1000000 secondes.");
  }
  return {
    hostname: value.hostname.trim(),
    vlans,
    ports,
    staticMacEntries: normalizedStaticMacEntries,
    macAgingTimeSeconds,
    consoleLine: { ...consoleLine },
  };
}

export function normalizeSwitchConfiguration(value, hostname, interfaces) {
  if (value === undefined || value === null) {
    return createDefaultSwitchConfiguration(hostname, interfaces);
  }
  if (typeof value !== "object") throw new Error("La configuration persistante du commutateur est invalide.");
  const model = value.model ?? CATALYST_2960_MODEL;
  const fallback = createDefaultSwitchConfiguration(hostname, interfaces, model);
  const running = normalizeSwitchRunningConfiguration(value.running, fallback, hostname, interfaces, model);
  const startup = value.startup === undefined || value.startup === null
    ? null
    : normalizeSwitchRunningConfiguration(value.startup, fallback, hostname, interfaces, model);
  return { model, running, startup };
}

export function normalizeMacAddress(address) {
  const normalized = String(address).trim().toLowerCase();
  if (!/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(normalized)) {
    throw new Error(`Adresse MAC invalide : ${address}.`);
  }
  return normalized;
}

export function generateLocalMacAddress(usedAddresses = new Set(), randomValues = (bytes) => {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Un générateur cryptographique est requis pour créer une adresse MAC.");
  }
  globalThis.crypto.getRandomValues(bytes);
}) {
  for (let attempt = 0; attempt < 1024; attempt += 1) {
    const bytes = new Uint8Array(6);
    randomValues(bytes);
    bytes[0] = (bytes[0] & 0xfc) | 0x02;
    const address = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(":");
    if (!usedAddresses.has(address)) {
      usedAddresses.add(address);
      return address;
    }
  }
  throw new Error("Impossible de générer une adresse MAC unique.");
}

export function createEmptyTopology() {
  return { version: 1, devices: [], connections: [] };
}

export function normalizeTopology(value, macFactory = generateLocalMacAddress) {
  if (value === undefined || value === null) return createEmptyTopology();
  if (
    typeof value !== "object"
    || value.version !== 1
    || !Array.isArray(value.devices)
    || !Array.isArray(value.connections)
  ) {
    throw new Error("La topologie enregistrée n’est pas valide.");
  }

  const usedMacAddresses = new Set();
  const devices = value.devices.map((device) => {
    if (
      !device
      || typeof device.id !== "string"
      || !device.id.trim()
      || !DEVICE_KINDS.includes(device.kind)
      || typeof device.name !== "string"
      || !device.name.trim()
      || !Number.isFinite(device.x)
      || !Number.isFinite(device.y)
      || !Array.isArray(device.interfaces)
      || !Number.isInteger(device.portCount)
      || device.interfaces.length !== device.portCount
    ) {
      throw new Error("Un équipement enregistré est invalide.");
    }

    const normalizedInterfaces = device.interfaces.map((networkInterface) => {
      if (
        !networkInterface
        || typeof networkInterface.id !== "string"
        || !networkInterface.id.trim()
        || typeof networkInterface.name !== "string"
        || !networkInterface.name.trim()
        || typeof networkInterface.enabled !== "boolean"
      ) {
        throw new Error("Une interface réseau enregistrée est invalide.");
      }
      if (networkInterface.macAddress !== undefined && typeof networkInterface.macAddress !== "string") {
        throw new Error("Une adresse MAC enregistrée est invalide.");
      }
      let macAddress = "";
      if (typeof networkInterface.macAddress === "string" && networkInterface.macAddress.trim()) {
        macAddress = normalizeMacAddress(networkInterface.macAddress);
      }
      if (!macAddress || usedMacAddresses.has(macAddress)) {
        macAddress = macFactory(usedMacAddresses);
      } else {
        usedMacAddresses.add(macAddress);
      }
      const legacySwitchPort = device.kind === "switch"
        ? /^port([1-9]\d*)$/.exec(networkInterface.name)
        : null;
      return {
        ...networkInterface,
        ...(legacySwitchPort ? { name: `Fa0/${legacySwitchPort[1]}` } : {}),
        macAddress,
      };
    });
    const switchConfig = device.kind === "switch"
      ? normalizeSwitchConfiguration(device.switchConfig, device.name, normalizedInterfaces)
      : undefined;
    if (device.kind === "switch" && !device.switchConfig) {
      switchConfig.running = {
        ...switchConfig.running,
        ports: Object.fromEntries(normalizedInterfaces.map((networkInterface) => [
          networkInterface.id,
          {
            ...switchConfig.running.ports[networkInterface.id],
            enabled: networkInterface.enabled,
          },
        ])),
      };
    }

    return {
      ...device,
      ...(device.kind === "switch"
        ? { switchConfig }
        : {}),
      ...(device.kind === "pc" || device.kind === "laptop"
        ? {
            defaultGateway: typeof device.defaultGateway === "string" ? device.defaultGateway : "",
            dnsServer: typeof device.dnsServer === "string" ? device.dnsServer : "",
            dhcpEnabled: device.dhcpEnabled === true,
            icmpEnabled: device.icmpEnabled !== false,
          }
        : {}),
      interfaces: device.kind === "switch"
        ? normalizedInterfaces.map((networkInterface) => ({ ...networkInterface, enabled: true }))
        : normalizedInterfaces,
    };
  });

  const deviceIds = new Set(devices.map((device) => device.id));
  if (deviceIds.size !== devices.length) {
    throw new Error("La topologie contient des équipements dupliqués.");
  }

  const interfaces = new Map(
    devices.flatMap((device) =>
      device.interfaces.map((networkInterface) => [networkInterface.id, device.id]),
    ),
  );
  if (interfaces.size !== devices.reduce((count, device) => count + device.interfaces.length, 0)) {
    throw new Error("La topologie contient des interfaces dupliquées.");
  }
  const usedInterfaces = new Set();
  const connectionIds = new Set();
  const connections = value.connections.map((connection) => {
    if (
      !connection
      || typeof connection.id !== "string"
      || typeof connection.firstDeviceId !== "string"
      || typeof connection.secondDeviceId !== "string"
      || typeof connection.firstInterfaceId !== "string"
      || typeof connection.secondInterfaceId !== "string"
      || (connection.type !== undefined && connection.type !== "ethernet")
      || !deviceIds.has(connection.firstDeviceId)
      || !deviceIds.has(connection.secondDeviceId)
      || connection.firstDeviceId === connection.secondDeviceId
      || interfaces.get(connection.firstInterfaceId) !== connection.firstDeviceId
      || interfaces.get(connection.secondInterfaceId) !== connection.secondDeviceId
      || usedInterfaces.has(connection.firstInterfaceId)
      || usedInterfaces.has(connection.secondInterfaceId)
      || connectionIds.has(connection.id)
    ) {
      throw new Error("Une connexion enregistrée est invalide.");
    }

    usedInterfaces.add(connection.firstInterfaceId);
    usedInterfaces.add(connection.secondInterfaceId);
    connectionIds.add(connection.id);
    return { ...connection, type: connection.type || "ethernet" };
  });

  return { version: 1, devices, connections };
}

function createInterfaces(id, kind, portCount, usedMacAddresses, macFactory) {
  const count = ["pc", "laptop", "access-point"].includes(kind) ? 1 : portCount;
  return Array.from({ length: count }, (_, index) => {
    const name = kind === "router"
      ? `g0/${index}`
      : kind === "switch"
        ? `Fa0/${index + 1}`
        : `eth${index}`;
    return {
      id: `${id}-if-${index}`,
      name,
      enabled: true,
      macAddress: macFactory(usedMacAddresses),
      ...(kind === "pc" || kind === "router"
        ? {
            ipv4Address: kind === "pc" ? "" : `192.168.${index + 1}.1`,
            subnetMask: DEFAULT_MASK,
          }
        : {}),
    };
  });
}

export function addDevice(
  topology,
  kind,
  x,
  y,
  idFactory = () => crypto.randomUUID(),
  macFactory = generateLocalMacAddress,
) {
  if (!DEVICE_KINDS.includes(kind)) throw new Error("Type d’équipement inconnu.");
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Position d’équipement invalide.");

  const id = idFactory();
  if (topology.devices.some((device) => device.id === id)) throw new Error("Identifiant d’équipement déjà utilisé.");
  const labels = {
    pc: "PC",
    laptop: "Laptop",
    switch: "Switch",
    router: "Routeur",
    server: "Serveur",
    "access-point": "AP",
  };
  const label = labels[kind];
  const usedMacAddresses = new Set(topology.devices.flatMap((device) =>
    device.interfaces.map((networkInterface) => networkInterface.macAddress).filter(Boolean)));
  let number = 1;
  while (topology.devices.some((device) => device.kind === kind && device.name === `${label}${number}`)) {
    number += 1;
  }
  const portCount = kind === "switch" ? 8 : ["router", "server"].includes(kind) ? 4 : 1;
  const interfaces = createInterfaces(id, kind, portCount, usedMacAddresses, macFactory);
  const device = {
    id,
    kind,
    name: `${label}${number}`,
    x: Math.max(0, Math.min(CANVAS_WIDTH - DEVICE_WIDTH, x)),
    y: Math.max(0, Math.min(CANVAS_HEIGHT - DEVICE_HEIGHT, y)),
    portCount,
    ...(kind === "pc" || kind === "laptop"
      ? { defaultGateway: "", dnsServer: "", dhcpEnabled: false, icmpEnabled: true }
      : {}),
    ...(kind === "switch"
      ? { switchConfig: createDefaultSwitchConfiguration(`${label}${number}`, interfaces) }
      : {}),
    interfaces,
  };
  return { ...topology, devices: [...topology.devices, device] };
}

export function moveDevice(topology, deviceId, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Position d’équipement invalide.");
  return {
    ...topology,
    devices: topology.devices.map((device) => device.id === deviceId
      ? {
          ...device,
          x: Math.max(0, Math.min(CANVAS_WIDTH - DEVICE_WIDTH, x)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT - DEVICE_HEIGHT, y)),
        }
      : device),
  };
}

export function removeDevice(topology, deviceId) {
  return {
    ...topology,
    devices: topology.devices.filter((device) => device.id !== deviceId),
    connections: topology.connections.filter((connection) =>
      connection.firstDeviceId !== deviceId && connection.secondDeviceId !== deviceId),
  };
}

export function addConnection(
  topology,
  firstDeviceId,
  firstInterfaceId,
  secondDeviceId,
  secondInterfaceId,
  idFactory = () => crypto.randomUUID(),
) {
  if (firstDeviceId === secondDeviceId) throw new Error("Un équipement ne peut pas être connecté à lui-même.");
  const firstDevice = topology.devices.find((device) => device.id === firstDeviceId);
  const secondDevice = topology.devices.find((device) => device.id === secondDeviceId);
  if (!firstDevice || !secondDevice) throw new Error("Sélectionnez deux équipements existants.");

  const firstInterface = firstDevice.interfaces.find((item) => item.id === firstInterfaceId);
  const secondInterface = secondDevice.interfaces.find((item) => item.id === secondInterfaceId);
  const usedInterfaces = new Set(topology.connections.flatMap((connection) => [
    connection.firstInterfaceId,
    connection.secondInterfaceId,
  ]));
  if (
    !firstInterface
    || !secondInterface
    || !firstInterface.enabled
    || !secondInterface.enabled
    || usedInterfaces.has(firstInterfaceId)
    || usedInterfaces.has(secondInterfaceId)
  ) {
    throw new Error("Sélectionnez deux ports Ethernet actifs et libres.");
  }
  const connection = {
    id: idFactory(),
    firstDeviceId,
    secondDeviceId,
    firstInterfaceId,
    secondInterfaceId,
    type: "ethernet",
  };
  return { ...topology, connections: [...topology.connections, connection] };
}

export function removeConnection(topology, connectionId) {
  return {
    ...topology,
    connections: topology.connections.filter((connection) => connection.id !== connectionId),
  };
}

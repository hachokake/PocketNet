import assert from "node:assert/strict";
import test from "node:test";
import {
  addConnection,
  addDevice,
  createEmptyTopology,
  moveDevice,
  normalizeTopology,
  removeConnection,
  removeDevice,
} from "../src/topology-model.mjs";

function createLab() {
  let nextId = 0;
  const idFactory = () => `id-${++nextId}`;
  let topology = createEmptyTopology();
  topology = addDevice(topology, "pc", 100, 100, idFactory);
  topology = addDevice(topology, "switch", 400, 100, idFactory);
  topology = addDevice(topology, "router", 700, 100, idFactory);
  return topology;
}

test("opens legacy labs without topology as an empty editor model", () => {
  assert.deepEqual(normalizeTopology(undefined), createEmptyTopology());
});

test("adds typed equipment with independent interfaces and bounded positions", () => {
  const topology = createLab();
  assert.deepEqual(topology.devices.map(({ name, interfaces }) => [name, interfaces.length]), [
    ["PC1", 1],
    ["Switch1", 8],
    ["Routeur1", 4],
  ]);
  assert.deepEqual(topology.devices[2].interfaces.map((item) => item.ipv4Address), [
    "192.168.1.1",
    "192.168.2.1",
    "192.168.3.1",
    "192.168.4.1",
  ]);
  const macAddresses = topology.devices.flatMap((device) =>
    device.interfaces.map((networkInterface) => networkInterface.macAddress));
  assert.equal(new Set(macAddresses).size, macAddresses.length);
  assert.ok(macAddresses.every((address) => /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(address)));
  assert.ok(macAddresses.every((address) => (Number.parseInt(address.slice(0, 2), 16) & 3) === 2));
  assert.equal(addDevice(topology, "pc", -5, 5000, () => "bounded").devices.at(-1).x, 0);

  const afterRemoval = removeDevice(topology, "id-1");
  const replacement = addDevice(afterRemoval, "pc", 100, 100, () => "replacement").devices.at(-1);
  assert.equal(replacement.name, "PC1");
  const activeMacs = [...afterRemoval.devices, replacement]
    .flatMap((device) => device.interfaces.map((networkInterface) => networkInterface.macAddress));
  assert.equal(new Set(activeMacs).size, activeMacs.length);
});

test("persists generated MAC addresses through topology normalization", () => {
  const topology = createLab();
  const firstMacAddresses = topology.devices.flatMap((device) =>
    device.interfaces.map((networkInterface) => networkInterface.macAddress));
  const restored = normalizeTopology(JSON.parse(JSON.stringify(topology)));
  assert.deepEqual(
    restored.devices.flatMap((device) => device.interfaces.map((networkInterface) => networkInterface.macAddress)),
    firstMacAddresses,
  );

  const legacy = structuredClone(topology);
  delete legacy.devices[0].interfaces[0].macAddress;
  const migrated = normalizeTopology(legacy);
  const migratedMac = migrated.devices[0].interfaces[0].macAddress;
  assert.notEqual(migratedMac, undefined);
  assert.equal(normalizeTopology(migrated).devices[0].interfaces[0].macAddress, migratedMac);
});

test("creates and restores switch configuration with backwards-compatible defaults", () => {
  const topology = createLab();
  const device = topology.devices.find((item) => item.kind === "switch");
  assert.equal(device.switchConfig.model, "catalyst-2960");
  assert.deepEqual(device.switchConfig.running.vlans.map(({ id, name, status }) => [id, name, status]), [
    [1, "default", "active"],
    [1002, "fddi-default", "active"],
    [1003, "token-ring-default", "active"],
    [1004, "fddinet-default", "active"],
    [1005, "trnet-default", "active"],
  ]);
  assert.ok(device.interfaces.every((item, index) => item.name === `Fa0/${index + 1}`));
  assert.equal(Object.keys(device.switchConfig.running.ports).length, device.interfaces.length);

  const saved = structuredClone(topology);
  saved.devices.find((item) => item.kind === "switch").switchConfig.running.vlans.push({
    id: 20,
    name: "Students",
    status: "active",
  });
  saved.devices.find((item) => item.kind === "switch").switchConfig.running.ports[device.interfaces[0].id] = {
    ...device.switchConfig.running.ports[device.interfaces[0].id],
    accessVlan: 20,
  };
  saved.devices.find((item) => item.kind === "switch").switchConfig.startup =
    structuredClone(saved.devices.find((item) => item.kind === "switch").switchConfig.running);

  const restored = normalizeTopology(JSON.parse(JSON.stringify(saved)));
  const restoredConfig = restored.devices.find((item) => item.kind === "switch").switchConfig;
  assert.deepEqual(restoredConfig, saved.devices.find((item) => item.kind === "switch").switchConfig);

  const legacy = structuredClone(topology);
  delete legacy.devices.find((item) => item.kind === "switch").switchConfig;
  assert.deepEqual(
    normalizeTopology(legacy).devices.find((item) => item.kind === "switch").switchConfig,
    device.switchConfig,
  );

  const legacyAgingConfig = structuredClone(topology);
  const legacySwitch = legacyAgingConfig.devices.find((item) => item.kind === "switch");
  delete legacySwitch.switchConfig.running.macAgingTimeSeconds;
  const migratedAging = normalizeTopology(legacyAgingConfig)
    .devices.find((item) => item.kind === "switch").switchConfig;
  assert.equal(migratedAging.running.macAgingTimeSeconds, 300);
});

test("creates a persistent Layer 3 switch model and rejects Layer 3 state on a 2960", () => {
  let topology = createEmptyTopology();
  topology = addDevice(topology, "layer3-switch", 200, 200, () => "core");
  const layer3Switch = topology.devices[0];
  assert.equal(layer3Switch.switchConfig.model, "catalyst-3560");
  assert.equal(layer3Switch.switchConfig.running.ipRouting, false);
  assert.deepEqual(layer3Switch.switchConfig.running.vlanInterfaces, []);

  const configured = structuredClone(topology);
  configured.devices[0].switchConfig.running.vlans.push({
    id: 20,
    name: "Users",
    status: "active",
  });
  configured.devices[0].switchConfig.running.vlanInterfaces = [{
    vlanId: 20,
    enabled: true,
    description: "User gateway",
    ipv4: { address: "192.168.20.1", subnetMask: "255.255.255.0" },
  }];
  configured.devices[0].switchConfig.running.ipRouting = true;
  const restored = normalizeTopology(JSON.parse(JSON.stringify(configured)));
  assert.deepEqual(restored.devices[0].switchConfig, configured.devices[0].switchConfig);

  const invalid2960 = structuredClone(topology);
  invalid2960.devices[0].kind = "switch";
  invalid2960.devices[0].switchConfig = {
    ...invalid2960.devices[0].switchConfig,
    model: "catalyst-2960",
  };
  assert.throws(
    () => normalizeTopology(invalid2960),
    /Layer 3 nécessitent un Catalyst 3560/,
  );
});

test("migrates legacy switch VLANs and interface names without losing custom settings", () => {
  const topology = createLab();
  const legacy = structuredClone(topology);
  const device = legacy.devices.find((item) => item.kind === "switch");
  device.interfaces[0].name = "port1";
  delete device.switchConfig.model;
  device.switchConfig.running.vlans = [
    { id: 1, name: "default" },
    { id: 10, name: "ADMINISTRATION" },
  ];
  device.switchConfig.running.ports[device.interfaces[0].id] = {
    ...device.switchConfig.running.ports[device.interfaces[0].id],
    accessVlan: 10,
    enabled: false,
  };
  device.switchConfig.startup = structuredClone(device.switchConfig.running);

  const restored = normalizeTopology(legacy);
  const restoredSwitch = restored.devices.find((item) => item.kind === "switch");
  assert.equal(restoredSwitch.switchConfig.model, "catalyst-2960");
  assert.equal(restoredSwitch.interfaces[0].name, "Fa0/1");
  assert.deepEqual(restoredSwitch.switchConfig.running.vlans.map(({ id }) => id), [
    1, 10, 1002, 1003, 1004, 1005,
  ]);
  assert.equal(restoredSwitch.switchConfig.running.vlans.find(({ id }) => id === 10).name, "ADMINISTRATION");
  assert.equal(restoredSwitch.switchConfig.running.ports[restoredSwitch.interfaces[0].id].accessVlan, 10);
  assert.equal(restoredSwitch.switchConfig.running.ports[restoredSwitch.interfaces[0].id].enabled, false);
  assert.deepEqual(restoredSwitch.switchConfig.startup.vlans, restoredSwitch.switchConfig.running.vlans);

  const reopened = normalizeTopology(JSON.parse(JSON.stringify(restored)));
  assert.deepEqual(
    reopened.devices.find((item) => item.kind === "switch").switchConfig.running.vlans,
    restoredSwitch.switchConfig.running.vlans,
  );
  assert.throws(() => normalizeTopology({
    ...topology,
    devices: topology.devices.map((item) => item.kind === "switch"
      ? { ...item, switchConfig: { ...item.switchConfig, model: "unsupported-switch" } }
      : item),
  }), /n’est pas pris en charge/);
});

test("supports every illustrated equipment kind with individually identified ports", () => {
  const kinds = ["pc", "laptop", "switch", "layer3-switch", "router", "server", "access-point"];
  let topology = createEmptyTopology();
  kinds.forEach((kind, index) => {
    topology = addDevice(topology, kind, 100 + index * 200, 100, () => `equipment-${index}`);
  });

  assert.deepEqual(topology.devices.map((device) => device.kind), kinds);
  assert.ok(topology.devices.every((device) => device.interfaces.length > 0));
  assert.equal(
    new Set(topology.devices.flatMap((device) => device.interfaces.map((networkInterface) => networkInterface.id))).size,
    topology.devices.reduce((count, device) => count + device.interfaces.length, 0),
  );
});

test("connects only free interfaces and validates restored topology", () => {
  let topology = createLab();
  topology = addConnection(topology, "id-1", "id-1-if-0", "id-2", "id-2-if-0", () => "cable-1");
  assert.equal(normalizeTopology(topology).connections[0].firstInterfaceId, "id-1-if-0");
  assert.equal(topology.connections[0].type, "ethernet");
  assert.throws(
    () => addConnection(topology, "id-1", "id-1-if-0", "id-3", "id-3-if-0", () => "cable-2"),
    /ports Ethernet actifs et libres/,
  );
  topology = addConnection(topology, "id-2", "id-2-if-1", "id-3", "id-3-if-0", () => "cable-2");
  topology = addConnection(topology, "id-2", "id-2-if-2", "id-3", "id-3-if-1", () => "cable-3");
  assert.equal(topology.connections.length, 3);

  const invalid = { ...topology, connections: [{ ...topology.connections[0], secondDeviceId: "absent" }] };
  assert.throws(() => normalizeTopology(invalid), /connexion enregistrée est invalide/);
});

test("rejects self-links and disabled interfaces", () => {
  const topology = createLab();
  assert.throws(
    () => addConnection(topology, "id-1", "id-1-if-0", "id-1", "id-1-if-0"),
    /lui-même/,
  );
  const disabledHost = {
    ...topology,
    devices: topology.devices.map((device) => device.id === "id-1"
      ? {
          ...device,
          interfaces: device.interfaces.map((networkInterface) => ({
            ...networkInterface,
            enabled: false,
          })),
        }
      : device),
  };
  assert.throws(
    () => addConnection(disabledHost, "id-1", "id-1-if-0", "id-2", "id-2-if-0"),
    /ports Ethernet actifs et libres/,
  );
});

test("moves equipment, removes cables, and cascades cable removal with equipment", () => {
  let topology = createLab();
  topology = addConnection(topology, "id-1", "id-1-if-0", "id-2", "id-2-if-0", () => "cable-1");
  topology = moveDevice(topology, "id-1", 220, 240);
  assert.deepEqual([topology.devices[0].x, topology.devices[0].y], [220, 240]);
  topology = removeConnection(topology, "cable-1");
  assert.equal(topology.connections.length, 0);

  topology = addConnection(topology, "id-1", "id-1-if-0", "id-2", "id-2-if-0", () => "cable-3");
  topology = removeDevice(topology, "id-1");
  assert.equal(topology.devices.some((device) => device.id === "id-1"), false);
  assert.equal(topology.connections.length, 0);
});

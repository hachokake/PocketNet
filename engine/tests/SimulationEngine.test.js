import assert from "node:assert/strict";
import test from "node:test";

import {
  NetworkTopology,
  SimulationEngine,
  SimulationError,
} from "../dist/index.js";

function createIdFactory() {
  let nextId = 0;
  return () => `id-${++nextId}`;
}

function createEngine() {
  return new SimulationEngine({
    idFactory: createIdFactory(),
    clock: () => new Date("2026-01-02T03:04:05.000Z"),
  });
}

function createDevicesWithInterfaces(engine) {
  const router = engine.createDevice("Routeur", "router");
  const host = engine.createDevice("Poste", "host");
  const routerInterface = engine.createInterface(router.id, "eth0");
  const hostInterface = engine.createInterface(host.id, "eth0");
  return { router, host, routerInterface, hostInterface };
}

test("creates devices and interfaces in a topology", () => {
  const engine = createEngine();
  const { router, host, routerInterface } = createDevicesWithInterfaces(engine);

  assert.equal(engine.topology.devices.length, 2);
  assert.equal(engine.topology.getDevice(router.id), router);
  assert.equal(engine.topology.getDevice(host.id), host);
  assert.equal(router.interfaces[0], routerInterface);
  assert.equal(routerInterface.deviceId, router.id);
  assert.deepEqual(engine.events.map((event) => event.type), [
    "device-created",
    "device-created",
    "interface-created",
    "interface-created",
  ]);
  const macAddresses = engine.topology.interfaces.map((networkInterface) => networkInterface.macAddress);
  assert.equal(new Set(macAddresses).size, macAddresses.length);
  assert.ok(macAddresses.every((address) => (Number.parseInt(address.slice(0, 2), 16) & 3) === 2));
  assert.ok(macAddresses.every((address) => /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(address)));
});

test("rejects empty names, duplicate interfaces, and unknown devices", () => {
  const topology = new NetworkTopology(createIdFactory());

  assert.throws(
    () => topology.createDevice("  ", "host"),
    { code: "invalid-device-name" },
  );
  assert.throws(
    () => topology.createInterface("missing", "eth0"),
    { code: "unknown-device" },
  );

  const device = topology.createDevice("Poste", "host");
  topology.createInterface(device.id, "eth0");
  assert.throws(
    () => topology.createInterface(device.id, "eth0"),
    { code: "duplicate-interface-name" },
  );
});

test("rejects MAC addresses already assigned to another interface", () => {
  const engine = createEngine();
  const { host, routerInterface } = createDevicesWithInterfaces(engine);

  assert.throws(
    () => engine.createInterface(host.id, "eth1", routerInterface.macAddress),
    { code: "duplicate-interface-mac-address" },
  );
});

test("connects two free interfaces and identifies the connection", () => {
  const engine = createEngine();
  const { routerInterface, hostInterface } = createDevicesWithInterfaces(engine);

  const connection = engine.connectInterfaces(routerInterface.id, hostInterface.id);

  assert.equal(engine.topology.connections.length, 1);
  assert.equal(engine.topology.getConnection(connection.id), connection);
  assert.equal(engine.topology.getConnectionForInterface(routerInterface.id), connection);
  assert.equal(engine.topology.isConnected(routerInterface.id, hostInterface.id), true);
  assert.equal(engine.events.at(-1).type, "connection-created");
});

test("records and reports occupied, missing, same-interface, and same-device errors", () => {
  const engine = createEngine();
  const { router, routerInterface, hostInterface } = createDevicesWithInterfaces(engine);
  const secondHost = engine.createDevice("Serveur", "server");
  const secondHostInterface = engine.createInterface(secondHost.id, "eth0");
  engine.connectInterfaces(routerInterface.id, hostInterface.id);

  assert.throws(
    () => engine.connectInterfaces(routerInterface.id, secondHostInterface.id),
    (error) => error instanceof SimulationError && error.code === "interface-already-connected",
  );
  assert.throws(
    () => engine.connectInterfaces("missing", secondHostInterface.id),
    (error) => error instanceof SimulationError && error.code === "unknown-interface",
  );
  assert.throws(
    () => engine.connectInterfaces(secondHostInterface.id, secondHostInterface.id),
    (error) => error instanceof SimulationError && error.code === "same-interface",
  );

  const secondRouterInterface = engine.createInterface(router.id, "eth1");
  assert.throws(
    () => engine.connectInterfaces(routerInterface.id, secondRouterInterface.id),
    (error) => error instanceof SimulationError && error.code === "same-device",
  );

  const errors = engine.events.filter((event) => event.type === "connection-error");
  assert.equal(errors.length, 4);
  assert.equal(errors[0].details.code, "interface-already-connected");
  assert.match(errors[0].message, /déjà connectée/);
});

test("disconnects a cable and frees both interfaces", () => {
  const engine = createEngine();
  const { routerInterface, hostInterface } = createDevicesWithInterfaces(engine);
  const connection = engine.topology.connectInterfaces(routerInterface.id, hostInterface.id);

  assert.equal(engine.topology.disconnect(connection.id), true);
  assert.equal(engine.topology.isConnected(routerInterface.id, hostInterface.id), false);
  assert.equal(engine.topology.disconnect(connection.id), false);
  assert.doesNotThrow(() => engine.topology.connectInterfaces(routerInterface.id, hostInterface.id));
});

test("records opaque packet data without transmitting or processing a protocol", () => {
  const engine = createEngine();
  const { routerInterface, hostInterface } = createDevicesWithInterfaces(engine);
  const payload = new Uint8Array([0x50, 0x4e]);

  const packet = engine.createPacket({
    sourceInterfaceId: routerInterface.id,
    destinationInterfaceId: hostInterface.id,
    payload,
  });
  payload[0] = 0;

  assert.deepEqual([...packet.payload], [0x50, 0x4e]);
  assert.equal(packet.createdAt, "2026-01-02T03:04:05.000Z");
  assert.equal(engine.packets[0], packet);
  assert.match(engine.events.at(-1).message, /aucun protocole ni transfert/);
  assert.throws(
    () => engine.createPacket({
      sourceInterfaceId: "missing",
      destinationInterfaceId: hostInterface.id,
      payload,
    }),
    (error) => error instanceof SimulationError && error.code === "invalid-packet",
  );
});

test("controls the simulation lifecycle and rejects invalid state transitions", () => {
  const engine = createEngine();

  assert.equal(engine.status, "idle");
  assert.throws(() => engine.pause(), { code: "invalid-simulation-state" });
  engine.start();
  assert.equal(engine.status, "running");
  engine.pause();
  assert.equal(engine.status, "paused");
  engine.resume();
  assert.equal(engine.status, "running");
  engine.stop();
  assert.equal(engine.status, "stopped");
  assert.deepEqual(
    engine.events
      .filter((event) => event.type.startsWith("simulation-"))
      .map((event) => event.type),
    ["simulation-started", "simulation-paused", "simulation-resumed", "simulation-stopped"],
  );
  assert.match(engine.events[0].message, /aucun protocole réseau/);
});

test("returns snapshots so collection edits do not change engine state", () => {
  const engine = createEngine();
  const { router } = createDevicesWithInterfaces(engine);
  const devices = engine.topology.devices;
  const events = engine.events;

  devices.pop();
  events.pop();
  events[0].details.deviceId = "changed";
  assert.equal(engine.topology.devices.length, 2);
  assert.equal(engine.events.length, 4);
  assert.notEqual(engine.events[0].details.deviceId, "changed");
});

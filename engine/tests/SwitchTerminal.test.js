import assert from "node:assert/strict";
import test from "node:test";

import {
  ComputerTerminal,
  EthernetSwitch,
  SwitchTerminal,
  TopologySimulation,
} from "../dist/index.js";

function createTopology(twoSwitches = false) {
  const pc1 = {
    id: "pc1",
    name: "PC1",
    kind: "pc",
    icmpEnabled: true,
    interfaces: [{
      id: "pc1-eth0",
      name: "eth0",
      macAddress: "02:00:00:00:01:01",
      enabled: true,
      ipv4Address: "192.168.1.10",
      subnetMask: "255.255.255.0",
    }],
  };
  const pc2 = {
    id: "pc2",
    name: "PC2",
    kind: "pc",
    icmpEnabled: true,
    interfaces: [{
      id: "pc2-eth0",
      name: "eth0",
      macAddress: "02:00:00:00:01:02",
      enabled: true,
      ipv4Address: "192.168.1.20",
      subnetMask: "255.255.255.0",
    }],
  };
  const makeSwitch = (id, name) => ({
    id,
    name,
    kind: "switch",
    interfaces: Array.from({ length: 4 }, (_, index) => ({
      id: `${id}-port${index + 1}`,
      name: `Fa0/${index + 1}`,
      macAddress: `02:00:00:00:${id === "sw1" ? "11" : "22"}:0${index + 1}`,
      enabled: true,
    })),
  });
  const sw1 = makeSwitch("sw1", "Switch1");
  if (!twoSwitches) {
    return {
      devices: [pc1, pc2, sw1],
      connections: [
        { firstDeviceId: pc1.id, secondDeviceId: sw1.id, firstInterfaceId: "pc1-eth0", secondInterfaceId: "sw1-port1" },
        { firstDeviceId: pc2.id, secondDeviceId: sw1.id, firstInterfaceId: "pc2-eth0", secondInterfaceId: "sw1-port2" },
      ],
    };
  }
  const sw2 = makeSwitch("sw2", "Switch2");
  return {
    devices: [pc1, pc2, sw1, sw2],
    connections: [
      { firstDeviceId: pc1.id, secondDeviceId: sw1.id, firstInterfaceId: "pc1-eth0", secondInterfaceId: "sw1-port1" },
      { firstDeviceId: sw1.id, secondDeviceId: sw2.id, firstInterfaceId: "sw1-port2", secondInterfaceId: "sw2-port1" },
      { firstDeviceId: pc2.id, secondDeviceId: sw2.id, firstInterfaceId: "pc2-eth0", secondInterfaceId: "sw2-port2" },
    ],
  };
}

function createTerminal(topology, simulation, switchId = "sw1") {
  const runtime = simulation.getSwitch(switchId);
  assert.ok(runtime);
  return new SwitchTerminal(runtime, {
    onConfigurationChange(configuration) {
      const persistentConfiguration = simulation.serializeSwitchConfiguration(switchId, configuration);
      topology.devices = topology.devices.map((device) =>
        device.id === switchId
          ? { ...device, switchConfig: structuredClone(persistentConfiguration) }
          : device);
    },
  });
}

function run(terminal, command) {
  const result = terminal.execute(command);
  assert.notEqual(result.tone, "error", `${command}: ${result.output}`);
  return result.output;
}

function configureVlan(terminal, vlanId, portId, mode = "access") {
  if (terminal.mode === "user") run(terminal, "enable");
  run(terminal, "conf t");
  run(terminal, `vlan ${vlanId}`);
  run(terminal, `name Users${vlanId}`);
  run(terminal, "exit");
  run(terminal, `int ${portId}`);
  if (mode === "access") run(terminal, `switchport access vlan ${vlanId}`);
  else {
    run(terminal, "switchport mode trunk");
    run(terminal, `switchport trunk allowed vlan ${vlanId}`);
  }
  run(terminal, "end");
}

test("supports IOS mode transitions, abbreviations, and explicit unsupported STP", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);

  assert.equal(terminal.prompt, "Switch1>");
  run(terminal, "en");
  assert.equal(terminal.prompt, "Switch1#");
  run(terminal, "conf t");
  run(terminal, "hostname Edge1");
  assert.equal(terminal.prompt, "Edge1(config)#");
  const before = simulation.getSwitch("sw1").runningConfiguration;
  const unsupported = terminal.execute("spanning-tree mode rapid-pvst");
  assert.equal(unsupported.tone, "error");
  assert.match(unsupported.output, /STP is not implemented/);
  assert.deepEqual(simulation.getSwitch("sw1").runningConfiguration, before);
});

test("restores isolated switch terminal modes and their current configuration contexts", () => {
  const topology = createTopology(true);
  const simulation = new TopologySimulation(topology);
  const sw1 = createTerminal(topology, simulation, "sw1");
  const sw2 = createTerminal(topology, simulation, "sw2");

  run(sw1, "enable");
  run(sw1, "configure terminal");
  run(sw1, "interface Fa0/1");
  run(sw2, "enable");
  run(sw2, "configure terminal");
  run(sw2, "vlan 20");

  const resumedSimulation = new TopologySimulation(topology);
  const resumedSw1 = createTerminal(topology, resumedSimulation, "sw1");
  const resumedSw2 = createTerminal(topology, resumedSimulation, "sw2");
  resumedSw1.restoreState(sw1.snapshot());
  resumedSw2.restoreState(sw2.snapshot());

  assert.equal(resumedSw1.prompt, "Switch1(config-if)#");
  assert.equal(resumedSw2.prompt, "Switch2(config-vlan)#");
  assert.notDeepEqual(resumedSw1.snapshot(), resumedSw2.snapshot());
  run(resumedSw1, "description Uplink");
  run(resumedSw2, "name Users20");
  const sw1PortId = resumedSimulation.getSwitch("sw1").portInterfaceIds[0];
  assert.equal(resumedSimulation.getSwitch("sw1").getPortConfiguration(sw1PortId).description, "Uplink");
  assert.equal(resumedSimulation.getSwitch("sw2").runningConfiguration.vlans
    .find((vlan) => vlan.id === 20).name, "Users20");
});

test("rejects terminal state whose selected interface no longer exists", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);

  assert.throws(() => terminal.restoreState({
    mode: "interface",
    selectedPorts: ["removed-port"],
    selectedVlanId: null,
    authenticated: false,
    awaitingPassword: false,
  }), /ne correspond plus à la configuration/);
});

test("a new Catalyst 2960 stores its default VLANs and displays default ACCESS ports", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const networkSwitch = simulation.getSwitch("sw1");
  assert.equal(networkSwitch.persistentConfiguration.model, "catalyst-2960");
  assert.deepEqual(networkSwitch.runningConfiguration.vlans.map(({ id, name, status }) =>
    [id, name, status]), [
    [1, "default", "active"],
    [1002, "fddi-default", "active"],
    [1003, "token-ring-default", "active"],
    [1004, "fddinet-default", "active"],
    [1005, "trnet-default", "active"],
  ]);
  assert.ok(networkSwitch.portInterfaceIds.every((id) => {
    const port = networkSwitch.getPortConfiguration(id);
    return port.mode === "access" && port.accessVlan === 1;
  }));

  const output = run(createTerminal(topology, simulation), "show vlan brief");
  const rows = output.split("\n");
  assert.match(rows[0], /VLAN\s+Name\s+Status\s+Ports/);
  assert.match(rows[2], /^1\s+default\s+active\s+Fa0\/1, Fa0\/2, Fa0\/3, Fa0\/4$/);
  assert.match(rows[3], /^1002\s+fddi-default\s+active\s*$/);
  assert.match(rows[4], /^1003\s+token-ring-default\s+active\s*$/);
  assert.match(rows[5], /^1004\s+fddinet-default\s+active\s*$/);
  assert.match(rows[6], /^1005\s+trnet-default\s+active\s*$/);
});

test("show vlan brief follows ACCESS assignments and excludes trunks", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);

  configureVlan(terminal, 10, "Fa0/1");
  configureVlan(terminal, 20, "Fa0/2");
  run(terminal, "configure terminal");
  run(terminal, "interface Fa0/1");
  run(terminal, "switchport access vlan 20");
  run(terminal, "shutdown");
  run(terminal, "exit");
  run(terminal, "interface Fa0/3");
  run(terminal, "switchport mode trunk");
  run(terminal, "end");

  const rows = run(terminal, "show vlan brief").split("\n");
  assert.match(rows[2], /^1\s+default\s+active\s+Fa0\/4$/);
  assert.match(rows[3], /^10\s+Users10\s+active\s*$/);
  assert.match(rows[4], /^20\s+Users20\s+active\s+Fa0\/1, Fa0\/2$/);
  assert.equal(rows.some((row) => row.includes("Fa0/3")), false);
  const firstPortId = simulation.getSwitch("sw1").portInterfaceIds[0];
  assert.equal(simulation.getSwitch("sw1").getPortConfiguration(firstPortId).enabled, false);

  run(terminal, "configure terminal");
  run(terminal, "no vlan 10");
  run(terminal, "end");
  const withoutVlan10 = run(terminal, "show vlan brief");
  assert.doesNotMatch(withoutVlan10, /^10\s/m);
  assert.match(withoutVlan10, /^20\s+Users20\s+active\s+Fa0\/1, Fa0\/2$/m);
});

test("reserved VLANs cannot be deleted or renamed", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);
  run(terminal, "enable");
  run(terminal, "configure terminal");
  run(terminal, "vlan 1002");
  assert.equal(terminal.execute("name CUSTOM").tone, "error");
  run(terminal, "end");
  assert.equal(terminal.execute("no vlan 1002").tone, "error");
  assert.ok(simulation.getSwitch("sw1").runningConfiguration.vlans.some((vlan) =>
    vlan.id === 1002 && vlan.name === "fddi-default"));
  assert.equal(terminal.execute("configure terminal").tone, "info");
  assert.equal(terminal.execute("no vlan 1").tone, "error");
});

test("VLANs survive reopen without duplicates and remain isolated per switch", () => {
  const topology = createTopology(true);
  let simulation = new TopologySimulation(topology);
  let first = createTerminal(topology, simulation, "sw1");
  configureVlan(first, 10, "Fa0/1");
  run(first, "write memory");
  assert.equal(simulation.getSwitch("sw2").runningConfiguration.vlans.some((vlan) =>
    vlan.id === 10), false);

  const saved = structuredClone(topology);
  const savedFirst = saved.devices.find((device) => device.id === "sw1").switchConfig;
  assert.equal(savedFirst.model, "catalyst-2960");
  assert.ok(savedFirst.startup.vlans.some((vlan) => vlan.id === 1005));

  simulation = new TopologySimulation(saved);
  first = createTerminal(saved, simulation, "sw1");
  const restoredVlans = simulation.getSwitch("sw1").runningConfiguration.vlans;
  assert.equal(restoredVlans.filter((vlan) => vlan.id === 1002).length, 1);
  assert.ok(restoredVlans.some((vlan) => vlan.id === 10 && vlan.name === "Users10"));
  assert.ok(simulation.getSwitch("sw2").runningConfiguration.vlans.every((vlan) =>
    vlan.id !== 10));
  assert.match(run(first, "show vlan brief"), /^10\s+Users10\s+active\s+Fa0\/1$/m);

  const reopened = new TopologySimulation(structuredClone(saved));
  assert.equal(reopened.getSwitch("sw1").runningConfiguration.vlans.length, 6);
});

test("reopening a legacy switch migrates missing defaults without replacing custom VLANs", () => {
  const topology = createTopology();
  const originalSimulation = new TopologySimulation(topology);
  const legacyConfiguration = structuredClone(originalSimulation.serializeSwitchConfiguration(
    "sw1",
    originalSimulation.getSwitch("sw1").persistentConfiguration,
  ));
  delete legacyConfiguration.model;
  legacyConfiguration.running.vlans = [
    { id: 1, name: "default" },
    { id: 10, name: "ADMINISTRATION" },
  ];
  legacyConfiguration.running.ports["sw1-port1"] = {
    ...legacyConfiguration.running.ports["sw1-port1"],
    accessVlan: 10,
    enabled: false,
  };
  legacyConfiguration.startup = structuredClone(legacyConfiguration.running);
  const legacyTopology = structuredClone(topology);
  legacyTopology.devices.find((device) => device.id === "sw1").switchConfig = legacyConfiguration;

  const restored = new TopologySimulation(legacyTopology);
  const networkSwitch = restored.getSwitch("sw1");
  assert.deepEqual(networkSwitch.runningConfiguration.vlans.map(({ id }) => id), [
    1, 10, 1002, 1003, 1004, 1005,
  ]);
  assert.equal(networkSwitch.runningConfiguration.vlans.find((vlan) => vlan.id === 10).name, "ADMINISTRATION");
  const firstPortId = networkSwitch.portInterfaceIds[0];
  assert.equal(networkSwitch.getPortConfiguration(firstPortId).accessVlan, 10);
  assert.equal(networkSwitch.getPortConfiguration(firstPortId).enabled, false);

  const terminal = createTerminal(legacyTopology, restored);
  run(terminal, "enable");
  run(terminal, "write memory");
  const migrated = legacyTopology.devices.find((device) => device.id === "sw1").switchConfig;
  assert.equal(migrated.model, "catalyst-2960");
  assert.equal(migrated.startup.vlans.filter((vlan) => vlan.id === 1002).length, 1);
});

test("port shutdown and no shutdown affect actual packet forwarding", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);
  run(terminal, "enable");
  run(terminal, "configure terminal");
  run(terminal, "interface range Fa0/1 - Fa0/2");
  run(terminal, "shutdown");
  assert.equal(simulation.ping("pc1", "192.168.1.20").success, false);
  run(terminal, "no shutdown");
  assert.equal(simulation.ping("pc1", "192.168.1.20").success, true);
});

test("access VLAN membership isolates hosts and permits same-VLAN communication", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);

  configureVlan(terminal, 10, "Fa0/1");
  configureVlan(terminal, 20, "Fa0/2");
  assert.equal(simulation.ping("pc1", "192.168.1.20").success, false);

  run(terminal, "configure terminal");
  run(terminal, "interface Fa0/2");
  run(terminal, "switchport access vlan 10");
  run(terminal, "end");
  assert.equal(simulation.ping("pc1", "192.168.1.20").success, true);
});

test("802.1Q trunks carry a VLAN between switches and preserve host connectivity", () => {
  const topology = createTopology(true);
  const simulation = new TopologySimulation(topology);
  const first = createTerminal(topology, simulation, "sw1");
  const second = createTerminal(topology, simulation, "sw2");

  configureVlan(first, 10, "Fa0/1");
  run(first, "configure terminal");
  run(first, "interface Fa0/2");
  run(first, "switchport mode trunk");
  run(first, "switchport trunk allowed vlan 10");
  run(first, "end");

  configureVlan(second, 10, "Fa0/2");
  run(second, "configure terminal");
  run(second, "interface Fa0/1");
  run(second, "switchport mode trunk");
  run(second, "switchport trunk allowed vlan 10");
  run(second, "end");

  assert.equal(simulation.ping("pc1", "192.168.1.20").success, true);
  assert.ok(simulation.engine.events.some((event) =>
    event.details.vlanId === "10" && event.type === "ethernet-frame-received"));
});

test("running and startup configuration survive restoration and reload", () => {
  const topology = createTopology();
  let simulation = new TopologySimulation(topology);
  let terminal = createTerminal(topology, simulation);
  run(terminal, "enable");
  run(terminal, "configure terminal");
  run(terminal, "hostname SavedSwitch");
  run(terminal, "end");
  run(terminal, "write memory");
  run(terminal, "configure terminal");
  run(terminal, "hostname TemporarySwitch");
  assert.equal(terminal.prompt, "TemporarySwitch(config)#");

  simulation = new TopologySimulation(topology);
  terminal = createTerminal(topology, simulation);
  assert.equal(terminal.prompt, "TemporarySwitch>");
  run(terminal, "enable");
  run(terminal, "reload");
  assert.equal(terminal.prompt, "SavedSwitch>");
  assert.match(run(terminal, "show startup-config"), /hostname SavedSwitch/);
});

test("MAC table commands show learned state, clear dynamic entries, and persist static entries", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);
  assert.equal(simulation.ping("pc1", "192.168.1.20").success, true);
  run(terminal, "enable");
  assert.match(run(terminal, "show mac address-table dynamic"), /02:00:00:00:01:01/);
  run(terminal, "clear mac address-table dynamic");
  assert.equal(simulation.getSwitch("sw1").macTableSnapshot.length, 0);

  run(terminal, "configure terminal");
  run(terminal, "mac address-table static 02:00:00:00:01:01 vlan 1 interface Fa0/1");
  run(terminal, "end");
  assert.match(run(terminal, "show mac address-table static"), /static/);
  assert.equal(topology.devices.find((device) => device.id === "sw1").switchConfig.running.staticMacEntries.length, 1);
  const restored = new TopologySimulation(topology).getSwitch("sw1");
  assert.equal(restored.macTableSnapshot[0].type, "static");
});

test("console login protects a new session and invalid settings return errors", () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);
  run(terminal, "enable");
  run(terminal, "configure terminal");
  run(terminal, "line console 0");
  run(terminal, "password secret");
  run(terminal, "login");
  run(terminal, "end");

  const newSession = createTerminal(topology, simulation);
  assert.equal(newSession.prompt, "Password:");
  assert.equal(newSession.execute("wrong").tone, "error");
  assert.equal(newSession.execute("secret").tone, "info");
  assert.equal(newSession.prompt, "Switch1>");

  const invalid = newSession.execute("en").output;
  assert.equal(newSession.mode, "privileged");
  const unknown = newSession.execute("show bogus");
  assert.equal(unknown.tone, "error");
  assert.match(invalid, /Mode privilégié/);
});

test("PC terminal and switch console use the same live forwarding table", async () => {
  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const pcTerminal = new ComputerTerminal(topology, "pc1", { simulation });
  for await (const _output of pcTerminal.execute("ping 192.168.1.20")) {
  }

  const switchTerminal = createTerminal(topology, simulation);
  run(switchTerminal, "enable");
  assert.match(run(switchTerminal, "show mac address-table dynamic"), /02:00:00:00:01:01/);
});

test("trunk VLAN allow-lists reject frames outside the configured set", () => {
  const topology = createTopology(true);
  const simulation = new TopologySimulation(topology);
  const first = createTerminal(topology, simulation, "sw1");
  const second = createTerminal(topology, simulation, "sw2");

  configureVlan(first, 10, "Fa0/1");
  run(first, "configure terminal");
  run(first, "vlan 20");
  run(first, "exit");
  run(first, "interface Fa0/2");
  run(first, "switchport mode trunk");
  run(first, "switchport trunk allowed vlan 20");
  run(first, "end");

  configureVlan(second, 10, "Fa0/2");
  run(second, "configure terminal");
  run(second, "vlan 20");
  run(second, "exit");
  run(second, "interface Fa0/1");
  run(second, "switchport mode trunk");
  run(second, "switchport trunk allowed vlan 20");
  run(second, "end");

  assert.equal(simulation.ping("pc1", "192.168.1.20").success, false);
});

test("dynamic MAC entries age out and unsupported speed settings are not applied", () => {
  let now = 100;
  const fakeTopology = {
    getConnectionForInterface: (id) => ({ id }),
    getInterface: (id) => ({ name: id }),
  };
  const eventSink = { recordEvent() {} };
  const networkSwitch = new EthernetSwitch(
    "AgingSwitch",
    ["port1", "port2"],
    fakeTopology,
    eventSink,
    undefined,
    () => now,
    50,
  );
  networkSwitch.receive("port1", {
    etherType: "ARP",
    sourceMac: "02:00:00:00:00:01",
    destinationMac: "ff:ff:ff:ff:ff:ff",
    payload: {},
  });
  assert.equal(networkSwitch.macTableSnapshot.length, 1);
  now += 51;
  assert.equal(networkSwitch.macTableSnapshot.length, 0);

  const topology = createTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = createTerminal(topology, simulation);
  run(terminal, "enable");
  run(terminal, "configure terminal");
  run(terminal, "interface Fa0/1");
  const firstPort = simulation.getSwitch("sw1").portInterfaceIds[0];
  const previous = simulation.getSwitch("sw1").getPortConfiguration(firstPort);
  const result = terminal.execute("speed 100");
  assert.equal(result.tone, "error");
  assert.deepEqual(simulation.getSwitch("sw1").getPortConfiguration(firstPort), previous);
});

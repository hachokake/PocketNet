import assert from "node:assert/strict";
import test from "node:test";

import { ComputerTerminal, SwitchTerminal, TopologySimulation } from "../dist/index.js";

function createTopology(overrides = {}) {
  const pc1 = {
    id: "pc1",
    name: "PC1",
    kind: "pc",
    defaultGateway: "",
    dnsServer: "",
    dhcpEnabled: false,
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
    defaultGateway: "",
    dnsServer: "",
    dhcpEnabled: false,
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
  const sw = {
    id: "switch",
    name: "Switch1",
    kind: "switch",
    interfaces: Array.from({ length: 4 }, (_, index) => ({
      id: `switch-port${index + 1}`,
      name: `port${index + 1}`,
      macAddress: `02:00:00:00:02:0${index + 1}`,
      enabled: true,
    })),
  };
  const devices = [
    { ...pc1, ...overrides.pc1 },
    { ...pc2, ...overrides.pc2 },
    { ...sw, ...overrides.switch },
  ];
  return {
    devices,
    connections: [
      {
        firstDeviceId: "pc1",
        secondDeviceId: "switch",
        firstInterfaceId: "pc1-eth0",
        secondInterfaceId: "switch-port1",
      },
      {
        firstDeviceId: "pc2",
        secondDeviceId: "switch",
        firstInterfaceId: "pc2-eth0",
        secondInterfaceId: "switch-port2",
      },
    ],
  };
}

function createRoutedTopology() {
  const pc1 = {
    id: "pc1",
    name: "PC1",
    kind: "pc",
    defaultGateway: "192.168.1.1",
    interfaces: [{
      id: "pc1-eth0",
      name: "eth0",
      macAddress: "02:00:00:00:11:01",
      enabled: true,
      ipv4Address: "192.168.1.10",
      subnetMask: "255.255.255.0",
    }],
  };
  const pc2 = {
    id: "pc2",
    name: "PC2",
    kind: "pc",
    defaultGateway: "192.168.2.1",
    interfaces: [{
      id: "pc2-eth0",
      name: "eth0",
      macAddress: "02:00:00:00:22:01",
      enabled: true,
      ipv4Address: "192.168.2.20",
      subnetMask: "255.255.255.0",
    }],
  };
  const router = {
    id: "router",
    name: "Router1",
    kind: "router",
    interfaces: [
      {
        id: "router-g0-0",
        name: "g0/0",
        macAddress: "02:00:00:00:33:01",
        enabled: true,
        ipv4Address: "192.168.1.1",
        subnetMask: "255.255.255.0",
      },
      {
        id: "router-g0-1",
        name: "g0/1",
        macAddress: "02:00:00:00:33:02",
        enabled: true,
        ipv4Address: "192.168.2.1",
        subnetMask: "255.255.255.0",
      },
    ],
  };
  const switch1 = {
    id: "switch1",
    name: "Switch1",
    kind: "switch",
    interfaces: ["port1", "port2"].map((name, index) => ({
      id: `switch1-${name}`,
      name,
      macAddress: `02:00:00:00:44:0${index + 1}`,
      enabled: true,
    })),
  };
  const switch2 = {
    id: "switch2",
    name: "Switch2",
    kind: "switch",
    interfaces: ["port1", "port2"].map((name, index) => ({
      id: `switch2-${name}`,
      name,
      macAddress: `02:00:00:00:55:0${index + 1}`,
      enabled: true,
    })),
  };
  return {
    devices: [pc1, pc2, router, switch1, switch2],
    connections: [
      {
        firstDeviceId: "pc1",
        secondDeviceId: "switch1",
        firstInterfaceId: "pc1-eth0",
        secondInterfaceId: "switch1-port1",
      },
      {
        firstDeviceId: "router",
        secondDeviceId: "switch1",
        firstInterfaceId: "router-g0-0",
        secondInterfaceId: "switch1-port2",
      },
      {
        firstDeviceId: "router",
        secondDeviceId: "switch2",
        firstInterfaceId: "router-g0-1",
        secondInterfaceId: "switch2-port1",
      },
      {
        firstDeviceId: "pc2",
        secondDeviceId: "switch2",
        firstInterfaceId: "pc2-eth0",
        secondInterfaceId: "switch2-port2",
      },
    ],
  };
}

function createLayer3SwitchTopology(ipRouting = true) {
  const pc = (id, name, address, gateway, mac) => ({
    id,
    name,
    kind: "pc",
    defaultGateway: gateway,
    icmpEnabled: true,
    interfaces: [{
      id: `${id}-eth0`,
      name: "eth0",
      macAddress: mac,
      enabled: true,
      ipv4Address: address,
      subnetMask: "255.255.255.0",
    }],
  });
  const ports = ["Fa0/1", "Fa0/2", "Fa0/3"].map((name, index) => ({
    id: `switch-port${index + 1}`,
    name,
    macAddress: `02:00:00:00:66:0${index + 1}`,
    enabled: true,
  }));
  const switchConfiguration = (routeEnabled) => {
    const port = (accessVlan) => ({
      enabled: true,
      switchport: true,
      mode: "access",
      accessVlan,
      nativeVlan: 1,
      allowedVlans: "all",
      description: "",
      speedMbps: "auto",
      duplex: "auto",
    });
    return {
      model: "catalyst-3560",
      running: {
        hostname: "Core3560",
        vlans: [
          { id: 1, name: "default", status: "active" },
          { id: 10, name: "Users", status: "active" },
          { id: 20, name: "Servers", status: "active" },
          { id: 1002, name: "fddi-default", status: "active" },
          { id: 1003, name: "token-ring-default", status: "active" },
          { id: 1004, name: "fddinet-default", status: "active" },
          { id: 1005, name: "trnet-default", status: "active" },
        ],
        ports: {
          "switch-port1": port(10),
          "switch-port2": port(20),
          "switch-port3": port(1),
        },
        staticMacEntries: [],
        macAgingTimeSeconds: 300,
        consoleLine: { loginRequired: false, password: "" },
        ipRouting: routeEnabled,
        vlanInterfaces: [
          {
            vlanId: 10,
            enabled: true,
            description: "",
            ipv4: { address: "192.168.10.1", subnetMask: "255.255.255.0" },
          },
          {
            vlanId: 20,
            enabled: true,
            description: "",
            ipv4: { address: "192.168.20.1", subnetMask: "255.255.255.0" },
          },
        ],
        routedPorts: {},
        staticRoutes: [],
      },
      startup: null,
    };
  };
  const pc1 = pc("pc1", "PC1", "192.168.10.10", "192.168.10.1", "02:00:00:00:10:01");
  const pc2 = pc("pc2", "PC2", "192.168.20.20", "192.168.20.1", "02:00:00:00:20:02");
  const networkSwitch = {
    id: "switch",
    name: "Core3560",
    kind: "layer3-switch",
    interfaces: ports,
    switchConfig: switchConfiguration(ipRouting),
  };
  const router = {
    id: "router",
    name: "EdgeRouter",
    kind: "router",
    staticRoutes: [
      {
        destination: "192.168.10.0",
        subnetMask: "255.255.255.0",
        nextHop: "192.168.99.2",
      },
      {
        destination: "192.168.20.0",
        subnetMask: "255.255.255.0",
        nextHop: "192.168.99.2",
      },
    ],
    interfaces: [
      {
        id: "router-g0-0",
        name: "g0/0",
        macAddress: "02:00:00:00:99:01",
        enabled: true,
        ipv4Address: "192.168.99.1",
        subnetMask: "255.255.255.0",
      },
      {
        id: "router-g0-1",
        name: "g0/1",
        macAddress: "02:00:00:00:99:02",
        enabled: true,
        ipv4Address: "172.16.0.1",
        subnetMask: "255.255.255.0",
      },
    ],
  };
  const pc3 = pc("pc3", "PC3", "172.16.0.10", "172.16.0.1", "02:00:00:00:30:03");
  return {
    devices: [pc1, pc2, networkSwitch, router, pc3],
    connections: [
      {
        firstDeviceId: "pc1",
        secondDeviceId: "switch",
        firstInterfaceId: "pc1-eth0",
        secondInterfaceId: "switch-port1",
      },
      {
        firstDeviceId: "pc2",
        secondDeviceId: "switch",
        firstInterfaceId: "pc2-eth0",
        secondInterfaceId: "switch-port2",
      },
      {
        firstDeviceId: "switch",
        secondDeviceId: "router",
        firstInterfaceId: "switch-port3",
        secondInterfaceId: "router-g0-0",
      },
      {
        firstDeviceId: "router",
        secondDeviceId: "pc3",
        firstInterfaceId: "router-g0-1",
        secondInterfaceId: "pc3-eth0",
      },
    ],
  };
}

function createThreeRouterTopology() {
  const interfaces = (entries) => entries.map(([id, name, macAddress, ipv4Address, subnetMask]) => ({
    id,
    name,
    macAddress,
    enabled: true,
    ipv4Address,
    subnetMask,
  }));
  const pc1 = {
    id: "pc1",
    name: "PC1",
    kind: "pc",
    defaultGateway: "192.168.10.1",
    interfaces: interfaces([[
      "pc1-eth0", "eth0", "02:00:00:00:10:01", "192.168.10.10", "255.255.255.0",
    ]]),
  };
  const pc2 = {
    id: "pc2",
    name: "PC2",
    kind: "pc",
    defaultGateway: "192.168.20.1",
    interfaces: interfaces([[
      "pc2-eth0", "eth0", "02:00:00:00:20:01", "192.168.20.20", "255.255.255.0",
    ]]),
  };
  const router = (id, name, entries, staticRoutes = []) => ({
    id,
    name,
    kind: "router",
    interfaces: interfaces(entries),
    staticRoutes,
  });
  const router1 = router("router1", "Router1", [
    ["r1-g0-0", "g0/0", "02:00:00:00:11:01", "192.168.10.1", "255.255.255.0"],
    ["r1-g0-1", "g0/1", "02:00:00:00:11:02", "10.0.12.1", "255.255.255.252"],
  ], [{
    destination: "192.168.20.0",
    subnetMask: "255.255.255.0",
    nextHop: "10.0.12.2",
  }]);
  const router2 = router("router2", "Router2", [
    ["r2-g0-0", "g0/0", "02:00:00:00:12:01", "10.0.12.2", "255.255.255.252"],
    ["r2-g0-1", "g0/1", "02:00:00:00:12:02", "10.0.23.1", "255.255.255.252"],
  ], [
    {
      destination: "192.168.10.0",
      subnetMask: "255.255.255.0",
      nextHop: "10.0.12.1",
    },
    {
      destination: "192.168.20.0",
      subnetMask: "255.255.255.0",
      nextHop: "10.0.23.2",
    },
  ]);
  const router3 = router("router3", "Router3", [
    ["r3-g0-0", "g0/0", "02:00:00:00:13:01", "10.0.23.2", "255.255.255.252"],
    ["r3-g0-1", "g0/1", "02:00:00:00:13:02", "192.168.20.1", "255.255.255.0"],
  ], [{
    destination: "192.168.10.0",
    subnetMask: "255.255.255.0",
    nextHop: "10.0.23.1",
  }]);
  return {
    devices: [pc1, pc2, router1, router2, router3],
    connections: [
      {
        firstDeviceId: "pc1",
        secondDeviceId: "router1",
        firstInterfaceId: "pc1-eth0",
        secondInterfaceId: "r1-g0-0",
      },
      {
        firstDeviceId: "router1",
        secondDeviceId: "router2",
        firstInterfaceId: "r1-g0-1",
        secondInterfaceId: "r2-g0-0",
      },
      {
        firstDeviceId: "router2",
        secondDeviceId: "router3",
        firstInterfaceId: "r2-g0-1",
        secondInterfaceId: "r3-g0-0",
      },
      {
        firstDeviceId: "router3",
        secondDeviceId: "pc2",
        firstInterfaceId: "r3-g0-1",
        secondInterfaceId: "pc2-eth0",
      },
    ],
  };
}

async function collectCommand(terminal, command, signal) {
  const output = [];
  for await (const entry of terminal.execute(command, signal)) output.push(entry);
  return output;
}

test("sends bidirectional pings through ARP, Ethernet switching, and ICMP", () => {
  const simulation = new TopologySimulation(createTopology());

  const pc1Ping = simulation.ping("pc1", "192.168.1.20");
  assert.equal(pc1Ping.success, true);
  assert.ok(pc1Ping.events.some((event) => event.type === "arp-request-sent"));
  assert.ok(pc1Ping.events.some((event) => event.type === "ethernet-frame-forwarded"));
  assert.ok(pc1Ping.events.some((event) => event.type === "icmp-echo-request-received"));
  assert.ok(pc1Ping.events.some((event) => event.type === "icmp-ping-succeeded"));
  assert.equal(pc1Ping.events.find((event) => event.type === "ipv4-packet-created")
    .details.initialTtl, "128");
  assert.equal(pc1Ping.events.find((event) => event.type === "ipv4-packet-received"
    && event.details.host === "PC2").details.ttl, "128");
  assert.equal(pc1Ping.responseTtl, 128);
  assert.equal(pc1Ping.events.some((event) => event.type === "ipv4-ttl-decremented"), false);

  const pc2Ping = simulation.ping("pc2", "192.168.1.10");
  assert.equal(pc2Ping.success, true);
  assert.equal(pc2Ping.events.some((event) => event.type === "icmp-ping-succeeded"), true);
});

test("handles a configured self-ping locally without ARP, Ethernet, or a cable", async () => {
  const topology = { ...createTopology(), connections: [] };
  const simulation = new TopologySimulation(topology);
  const result = simulation.ping("pc1", "192.168.1.10");

  assert.equal(result.success, true);
  assert.equal(result.responseType, "echo-reply");
  assert.equal(result.responseIp, "192.168.1.10");
  assert.ok(result.events.some((event) => event.type === "icmp-echo-request-received"
    && event.details.delivery === "local"));
  assert.ok(result.events.some((event) => event.type === "icmp-echo-reply-sent"
    && event.details.delivery === "local"));
  assert.equal(result.events.some((event) => event.type === "icmp-ping-succeeded"), true);
  assert.equal(result.events.some((event) => event.type === "arp-request-sent"), false);
  assert.equal(result.events.some((event) => event.type.startsWith("ethernet-frame-")), false);

  const terminal = new ComputerTerminal(topology, "pc1", { pingIntervalMs: 0 });
  const output = await collectCommand(terminal, "ping -n 1 192.168.1.10");
  assert.ok(output.some((entry) => entry.kind === "line"
    && entry.text.startsWith("Réponse de 192.168.1.10")));
  assert.ok(output.some((entry) => entry.kind === "events"
    && entry.events.some((event) => event.type === "icmp-ping-succeeded")));
});

test("does not treat an unconfigured address as local or bypass ICMP policy", () => {
  const simulation = new TopologySimulation(createTopology());
  const unconfigured = simulation.ping("pc1", "192.168.1.11");
  assert.equal(unconfigured.success, false);
  assert.ok(unconfigured.events.some((event) => event.type === "arp-resolution-failed"));
  assert.equal(unconfigured.events.some((event) => event.type === "icmp-ping-succeeded"), false);

  const blocked = new TopologySimulation(createTopology({
    pc1: { icmpEnabled: false },
  })).ping("pc1", "192.168.1.10");
  assert.equal(blocked.success, false);
  assert.ok(blocked.events.some((event) => event.type === "icmp-destination-unreachable"));
  assert.equal(blocked.events.some((event) => event.type === "icmp-ping-succeeded"), false);
});

test("routes ping and traceroute through a router with two configured networks", () => {
  const simulation = new TopologySimulation(createRoutedTopology());
  const ping = simulation.ping("pc1", "192.168.2.20");

  assert.equal(ping.success, true);
  assert.ok(ping.events.some((event) => event.type === "ipv4-packet-forwarded"));
  assert.ok(ping.events.some((event) => event.type === "icmp-ping-succeeded"));
  assert.equal(ping.events.find((event) => event.type === "ipv4-packet-received"
    && event.details.host === "PC2").details.ttl, "127");
  assert.equal(ping.responseTtl, 127);
  assert.equal(ping.events.filter((event) => event.type === "ipv4-ttl-decremented").length, 2);

  const firstHop = simulation.traceProbe("pc1", "192.168.2.20", 1);
  assert.equal(firstHop.responseType, "time-exceeded");
  assert.equal(firstHop.responseIp, "192.168.1.1");

  const destinationHop = simulation.traceProbe("pc1", "192.168.2.20", 2);
  assert.equal(destinationHop.success, true);
  assert.equal(destinationHop.responseType, "echo-reply");
  assert.equal(destinationHop.responseIp, "192.168.2.20");
});

test("routes between VLANs through active SVI interfaces when Layer 3 routing is enabled", () => {
  const simulation = new TopologySimulation(createLayer3SwitchTopology());
  const ping = simulation.ping("pc1", "192.168.20.20");

  assert.equal(ping.success, true);
  assert.ok(ping.events.some((event) => event.type === "ipv4-packet-forwarded"
    && event.details.deviceId === "switch"));
  assert.equal(ping.events.filter((event) => event.type === "ipv4-ttl-decremented").length, 2);
  assert.deepEqual(simulation.getLayer3InterfaceEntries("switch").map((item) => [
    item.name, item.address, item.status, item.protocol,
  ]), [
    ["Vlan10", "192.168.10.1", "up", "up"],
    ["Vlan20", "192.168.20.1", "up", "up"],
  ]);
});

test("configures and saves Layer 3 switch routes and a real routed port through IOS commands", () => {
  const topology = createLayer3SwitchTopology();
  const simulation = new TopologySimulation(topology);
  const networkSwitch = simulation.getSwitch("switch");
  const terminal = new SwitchTerminal(networkSwitch, {
    onConfigurationChange(configuration) {
      topology.devices = topology.devices.map((device) =>
        device.id === "switch"
          ? {
              ...device,
              switchConfig: simulation.serializeSwitchConfiguration("switch", configuration),
            }
          : device);
    },
    getLayer3Interfaces: () => simulation.getLayer3InterfaceEntries("switch"),
    getRouteEntries: () => simulation.getRouteEntries("switch"),
    getArpEntries: () => simulation.getArpEntries("switch"),
    ping: (destinationIp) => simulation.ping("switch", destinationIp),
  });
  const execute = (command) => {
    const result = terminal.execute(command);
    assert.notEqual(result.tone, "error", `${command}: ${result.output}`);
    return result.output;
  };

  execute("enable");
  execute("configure terminal");
  execute("interface vlan 10");
  execute("description User gateway");
  execute("exit");
  execute("interface Fa0/3");
  execute("no switchport");
  execute("ip address 192.168.99.2 255.255.255.0");
  execute("exit");
  execute("ip routing");
  execute("ip route 172.16.0.0 255.255.255.0 192.168.99.1");
  execute("end");
  execute("write memory");

  const routedPortId = networkSwitch.portInterfaceIds[2];
  assert.equal(networkSwitch.runningConfiguration.routedPorts[routedPortId].address, "192.168.99.2");
  assert.equal(networkSwitch.startupConfiguration.staticRoutes[0].destination, "172.16.0.0");
  assert.equal(
    networkSwitch.startupConfiguration.ports[routedPortId].switchport,
    false,
  );
  assert.match(execute("show ip route"), /172\.16\.0\.0\s+192\.168\.99\.1/);
  assert.match(execute("show interfaces status"), /Fa0\/3\s+connected\s+routed/);
  assert.match(execute("show running-config interface Fa0/3"), /no switchport/);
  assert.match(execute("show running-config interface Vlan10"), /description User gateway/);
  assert.match(execute("ping 172.16.0.10"), /Réponse ICMP reçue/);
  assert.match(execute("show ip interface brief"), /Vlan10\s+192\.168\.10\.1\s+up\s+up/);
  assert.equal(execute("show arp"), execute("show ip arp"));

  execute("configure terminal");
  execute("no ip routing");
  execute("end");
  assert.match(execute("show ip route"), /IP routing is disabled/);
  execute("configure terminal");
  execute("ip routing");
  execute("no ip route 172.16.0.0 255.255.255.0 192.168.99.1");
  execute("end");
  assert.doesNotMatch(execute("show ip route"), /172\.16\.0\.0/);
  execute("configure terminal");
  execute("ip route 172.16.0.0 255.255.255.0 192.168.99.1");

  execute("interface vlan 10");
  execute("ip address 192.168.10.1 255.255.255.0");
  execute("no ip address");
  assert.equal(
    networkSwitch.runningConfiguration.vlanInterfaces.find((item) => item.vlanId === 10).ipv4,
    null,
  );
  execute("ip address 192.168.10.1 255.255.255.0");
  execute("exit");

  execute("interface Fa0/3");
  execute("no ip address");
  assert.equal(networkSwitch.runningConfiguration.routedPorts[routedPortId], undefined);
  execute("ip address 192.168.99.2 255.255.255.0");
  execute("end");

  const restoredTopology = JSON.parse(JSON.stringify(topology));
  const restoredSimulation = new TopologySimulation(restoredTopology);
  assert.equal(restoredSimulation.ping("pc1", "172.16.0.10").success, true);
});

test("does not route between VLANs until ip routing is enabled", () => {
  const simulation = new TopologySimulation(createLayer3SwitchTopology(false));
  const ping = simulation.ping("pc1", "192.168.20.20");

  assert.equal(ping.success, false);
  assert.equal(ping.responseType, "destination-unreachable");
  assert.equal(ping.events.some((event) => event.type === "ipv4-packet-forwarded"), false);
});

test("keeps an SVI down when shut or when its VLAN has no active member ports", () => {
  const topology = createLayer3SwitchTopology();
  const simulation = new TopologySimulation(topology);
  const terminal = new SwitchTerminal(simulation.getSwitch("switch"), {
    onConfigurationChange(configuration) {
      topology.devices = topology.devices.map((device) =>
        device.id === "switch"
          ? {
              ...device,
              switchConfig: simulation.serializeSwitchConfiguration("switch", configuration),
            }
          : device);
    },
    getLayer3Interfaces: () => simulation.getLayer3InterfaceEntries("switch"),
    getRouteEntries: () => simulation.getRouteEntries("switch"),
    getArpEntries: () => simulation.getArpEntries("switch"),
    ping: (destinationIp) => simulation.ping("switch", destinationIp),
  });
  const execute = (command) => {
    const result = terminal.execute(command);
    assert.notEqual(result.tone, "error", `${command}: ${result.output}`);
    return result.output;
  };
  execute("enable");
  execute("configure terminal");
  execute("interface vlan 20");
  execute("shutdown");
  assert.deepEqual(simulation.getLayer3InterfaceEntries("switch")
    .find((item) => item.name === "Vlan20"), {
    name: "Vlan20",
    address: "192.168.20.1",
    status: "down",
    protocol: "down",
  });
  execute("no shutdown");
  execute("exit");
  execute("interface Fa0/2");
  execute("shutdown");
  assert.equal(simulation.getLayer3InterfaceEntries("switch")
    .find((item) => item.name === "Vlan20").status, "down");
  assert.equal(simulation.ping("pc1", "192.168.20.20").success, false);
});

test("supports a configured initial TTL and reports the reply's remaining TTL", async () => {
  const configuredTopology = createTopology({ pc1: { initialTtl: 42 } });
  const configuredPing = new TopologySimulation(configuredTopology).ping("pc1", "192.168.1.20");
  assert.equal(configuredPing.events.find((event) => event.type === "ipv4-packet-created")
    .details.initialTtl, "42");
  assert.equal(configuredPing.events.find((event) => event.type === "ipv4-packet-received"
    && event.details.host === "PC2").details.ttl, "42");
  assert.equal(configuredPing.responseTtl, 128);

  const terminal = new ComputerTerminal(createRoutedTopology(), "pc1", { pingIntervalMs: 0 });
  const ping = await collectCommand(terminal, "ping -n 1 -i 5 192.168.2.20");
  assert.ok(ping.some((entry) => entry.kind === "line"
    && entry.text.startsWith("Réponse de 192.168.2.20")
    && entry.text.endsWith("TTL=127")));

  const expired = await collectCommand(terminal, "ping -n 1 -i 1 192.168.2.20");
  assert.ok(expired.some((entry) => entry.kind === "line"
    && entry.text.includes("TTL expiré sur 192.168.1.1")));
  assert.ok((await collectCommand(terminal, "ping -i 0 192.168.2.20"))
    .some((entry) => entry.kind === "line" && entry.tone === "error"));
});

test("decrements TTL once per router across three routers and traces their real addresses", async () => {
  const topology = createThreeRouterTopology();
  const simulation = new TopologySimulation(topology);
  const ping = simulation.ping("pc1", "192.168.20.20");

  assert.equal(ping.success, true);
  assert.equal(ping.events.find((event) => event.type === "ipv4-packet-received"
    && event.details.host === "PC2").details.ttl, "125");
  assert.equal(ping.responseTtl, 125);
  assert.equal(ping.events.filter((event) => event.type === "ipv4-ttl-decremented").length, 6);

  const terminal = new ComputerTerminal(topology, "pc1", { pingIntervalMs: 0 });
  const trace = await collectCommand(terminal, "tracert -d 192.168.20.20");
  const lines = trace.filter((entry) => entry.kind === "line").map((entry) => entry.text);
  assert.ok(lines.some((line) => line.includes("192.168.10.1") && line.includes("TTL-expired")));
  assert.ok(lines.some((line) => line.includes("10.0.12.2") && line.includes("TTL-expired")));
  assert.ok(lines.some((line) => line.includes("10.0.23.2") && line.includes("TTL-expired")));
  assert.ok(lines.some((line) => line.includes("192.168.20.20") && line.includes("destination atteinte")));
});

test("drops a TTL-one ping at the first router and generates ICMP Time Exceeded", () => {
  const simulation = new TopologySimulation(createRoutedTopology());
  const result = simulation.ping("pc1", "192.168.2.20", 1);

  assert.equal(result.success, false);
  assert.equal(result.responseType, "time-exceeded");
  assert.ok(result.events.some((event) => event.type === "ipv4-ttl-decremented"
    && event.details.ttlBefore === "1" && event.details.ttlAfter === "0"));
  assert.ok(result.events.some((event) => event.type === "ipv4-packet-dropped"
    && event.details.reason === "ttl-expired" && event.details.ttl === "0"));
  assert.ok(result.events.some((event) => event.type === "icmp-time-exceeded"
    && event.details.expiredTtl === "1"));
  assert.equal(result.events.some((event) => event.type === "icmp-echo-request-received"
    && event.details.host === "PC2"), false);
});

test("fails when a cable is missing, a host is on another subnet, or ICMP is blocked", () => {
  const topology = createTopology();
  const disconnected = {
    ...topology,
    connections: topology.connections.filter((connection) => connection.firstDeviceId !== "pc1"),
  };
  const disconnectedPing = new TopologySimulation(disconnected).ping("pc1", "192.168.1.20");
  assert.equal(disconnectedPing.success, false);
  assert.ok(disconnectedPing.events.some((event) => event.type === "arp-resolution-failed"));

  const incompatible = createTopology({
    pc2: {
      interfaces: [{
        id: "pc2-eth0",
        name: "eth0",
        macAddress: "02:00:00:00:01:02",
        enabled: true,
        ipv4Address: "192.168.2.20",
        subnetMask: "255.255.255.0",
      }],
    },
  });
  const incompatiblePing = new TopologySimulation(incompatible).ping("pc1", "192.168.2.20");
  assert.equal(incompatiblePing.success, false);
  assert.ok(incompatiblePing.events.some((event) => event.type === "icmp-destination-unreachable"));
  assert.equal(incompatiblePing.events.some((event) => event.type === "arp-request-sent"), false);

  const blocked = createTopology({ pc2: { icmpEnabled: false } });
  const blockedPing = new TopologySimulation(blocked).ping("pc1", "192.168.1.20");
  assert.equal(blockedPing.success, false);
  assert.ok(blockedPing.events.some((event) => event.type === "icmp-request-blocked"));
});

test("reports disabled interfaces, unknown peers, and a missing route without claiming success", async () => {
  const baseTopology = createTopology();
  const disabled = createTopology({
    pc1: {
      interfaces: [{
        id: "pc1-eth0",
        name: "eth0",
        macAddress: "02:00:00:00:01:01",
        enabled: false,
        ipv4Address: "192.168.1.10",
        subnetMask: "255.255.255.0",
      }],
    },
  });
  const disabledPing = new TopologySimulation(disabled).ping("pc1", "192.168.1.20");
  assert.equal(disabledPing.success, false);
  assert.ok(disabledPing.events.some((event) => event.type === "interface-down"));
  const disabledSelfPing = new TopologySimulation(disabled).ping("pc1", "192.168.1.10");
  assert.equal(disabledSelfPing.success, false);
  assert.ok(disabledSelfPing.events.some((event) => event.type === "interface-down"));
  const disabledTerminal = new ComputerTerminal(disabled, "pc1");
  assert.ok((await collectCommand(disabledTerminal, "getmac"))
    .some((entry) => entry.kind === "line" && entry.text.includes("eth0 (déconnecté)")));

  const unknownPeer = {
    ...baseTopology,
    devices: baseTopology.devices.filter((device) => device.id !== "pc2"),
    connections: baseTopology.connections.filter((connection) => connection.firstDeviceId !== "pc2"),
  };
  const unknownPing = new TopologySimulation(unknownPeer).ping("pc1", "192.168.1.99");
  assert.equal(unknownPing.success, false);
  assert.ok(unknownPing.events.some((event) => event.type === "arp-resolution-failed"));

  const noGateway = new TopologySimulation(createTopology({
    pc2: {
      interfaces: [{
        id: "pc2-eth0",
        name: "eth0",
        macAddress: "02:00:00:00:01:02",
        enabled: true,
        ipv4Address: "192.168.2.20",
        subnetMask: "255.255.255.0",
      }],
    },
  })).ping("pc1", "192.168.2.20");
  assert.equal(noGateway.success, false);
  assert.match(noGateway.message, /Aucune passerelle/);
  assert.equal(noGateway.events.some((event) => event.type === "arp-request-sent"), false);
});

test("reports an unreachable routed network instead of fabricating a reply", async () => {
  const terminal = new ComputerTerminal(createRoutedTopology(), "pc1", { pingIntervalMs: 0 });
  const output = await collectCommand(terminal, "ping -n 1 192.168.3.20");
  assert.ok(output.some((entry) => entry.kind === "line"
    && entry.text.includes("Destination inaccessible")));
  assert.ok(output.some((entry) => entry.kind === "events"
    && entry.events.some((event) => event.type === "icmp-destination-unreachable")));
});

test("runs identity, IP configuration, ping, and cache commands through the terminal", async () => {
  const topology = createTopology();
  const pc1 = new ComputerTerminal(topology, "pc1", { pingIntervalMs: 0 });
  const pc2 = new ComputerTerminal(topology, "pc2", { pingIntervalMs: 0 });

  const pc1Config = await collectCommand(pc1, "ipconfig");
  const pc2Config = await collectCommand(pc2, "ipconfig /all");
  assert.ok(pc1Config.some((entry) => entry.kind === "line" && entry.text.includes("192.168.1.10")));
  assert.ok(pc1Config.some((entry) => entry.kind === "line" && entry.text.includes("02:00:00:00:01:01")));
  assert.ok(pc2Config.some((entry) => entry.kind === "line" && entry.text.includes("192.168.1.20")));
  assert.ok((await collectCommand(pc1, "hostname")).some((entry) => entry.text === "PC1"));
  assert.ok((await collectCommand(pc1, "getmac")).some((entry) => entry.text.includes("02:00:00:00:01:01")));
  assert.ok((await collectCommand(pc1, "ver")).some((entry) => entry.text.includes("PocketNet")));

  const ping = await collectCommand(pc1, "ping -n 10 192.168.1.20");
  assert.equal(ping.filter((entry) => entry.kind === "line" && entry.text.startsWith("Réponse de")).length, 10);
  assert.equal(ping.filter((entry) => entry.kind === "events")
    .flatMap((entry) => entry.events)
    .filter((event) => event.type === "icmp-ping-succeeded").length, 10);
  assert.ok((await collectCommand(pc2, "ping 192.168.1.10"))
    .some((entry) => entry.kind === "line" && entry.text.startsWith("Réponse de")));
  assert.ok((await collectCommand(pc1, "arp -a"))
    .some((entry) => entry.kind === "line" && entry.text.includes("192.168.1.20")));
  assert.ok((await collectCommand(pc1, "arp -d 192.168.1.20"))
    .some((entry) => entry.kind === "line" && entry.text.includes("supprimée")));
  assert.ok((await collectCommand(pc1, "route print"))
    .some((entry) => entry.kind === "line" && entry.text.includes("192.168.1.0")));
  assert.ok((await collectCommand(pc1, "route add 192.168.2.0"))
    .some((entry) => entry.kind === "line" && entry.text.includes("n’est pas encore simulée")));
  assert.ok((await collectCommand(pc1, "netstat -an"))
    .some((entry) => entry.kind === "line" && entry.text.includes("TCP/UDP")));
  assert.ok((await collectCommand(pc1, "ipconfig /flushdns"))
    .some((entry) => entry.kind === "line" && entry.text.includes("cache DNS n’est pas implémenté")));
  assert.ok((await collectCommand(pc1, "help")).some((entry) => entry.kind === "line" && entry.text.includes("tracert")));
  assert.deepEqual(await collectCommand(pc1, "cls"), [{ kind: "clear" }]);
  assert.ok((await collectCommand(pc1, "ping 192.168.999.1"))
    .some((entry) => entry.kind === "line" && entry.text.includes("Adresse IPv4 invalide")));
  assert.ok((await collectCommand(pc1, "nslookup example.test"))
    .some((entry) => entry.kind === "line" && entry.text.includes("aucun serveur DNS")));
  assert.ok((await collectCommand(pc1, "ipconfig /renew"))
    .some((entry) => entry.kind === "line" && entry.text.includes("DHCP n’est pas activé")));
  const dhcp = new ComputerTerminal(createTopology({
    pc1: { dhcpEnabled: true },
  }), "pc1", { pingIntervalMs: 0 });
  assert.ok((await collectCommand(dhcp, "ipconfig /renew"))
    .some((entry) => entry.kind === "line" && entry.text.includes("aucun serveur DHCP")));
  assert.ok((await collectCommand(dhcp, "ping 192.168.1.20"))
    .some((entry) => entry.kind === "line" && entry.text.includes("aucun serveur DHCP")));
  assert.ok((await collectCommand(pc1, "unknown-command"))
    .some((entry) => entry.kind === "line" && entry.tone === "error"));
});

test("streams routed tracert hops from actual TTL-expired and echo replies", async () => {
  const terminal = new ComputerTerminal(createRoutedTopology(), "pc1", { pingIntervalMs: 0 });
  const trace = await collectCommand(terminal, "tracert -d 192.168.2.20");
  const lines = trace.filter((entry) => entry.kind === "line").map((entry) => entry.text);
  assert.ok(lines.some((text) => text.includes("192.168.1.1") && text.includes("TTL-expired")));
  assert.ok(lines.some((text) => text.includes("192.168.2.20") && text.includes("destination atteinte")));
  assert.ok(trace.some((entry) => entry.kind === "events"
    && entry.events.some((event) => event.type === "icmp-time-exceeded")));
});

test("supports interrupting continuous ping without starting another probe", async () => {
  const terminal = new ComputerTerminal(createTopology(), "pc1", { pingIntervalMs: 10 });
  const controller = new AbortController();
  const iterator = terminal.execute("ping -t 192.168.1.20", controller.signal);
  let successCount = 0;
  for (;;) {
    const { done, value } = await iterator.next();
    if (done) break;
    if (value.kind === "line" && value.text.startsWith("Réponse de")) successCount += 1;
    if (successCount === 3) controller.abort();
  }
  assert.equal(successCount, 3);
  assert.equal(terminal.events.filter((event) => event.type === "icmp-ping-succeeded").length, 3);
});

test("prevents concurrent terminal commands while a continuous ping is running", async () => {
  const terminal = new ComputerTerminal(createTopology(), "pc1", { pingIntervalMs: 50 });
  const controller = new AbortController();
  const active = terminal.execute("ping -t 192.168.1.20", controller.signal);
  const firstOutput = await active.next();
  assert.equal(firstOutput.done, false);

  const concurrent = await collectCommand(terminal, "hostname");
  assert.ok(concurrent.some((entry) => entry.kind === "line" && entry.tone === "error"
    && entry.text.includes("Une commande est déjà en cours")));

  controller.abort();
  let next = await active.next();
  while (!next.done) next = await active.next();
  assert.ok((await collectCommand(terminal, "hostname")).some((entry) => entry.text === "PC1"));
});

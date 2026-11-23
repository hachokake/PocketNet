import assert from "node:assert/strict";
import test from "node:test";

import {
  EthernetSwitch,
  PeerSwitchLab,
  SimulationEngine,
} from "../dist/index.js";

test("builds PC1, PC2, an Ethernet switch, and exactly two connected cables", () => {
  const lab = new PeerSwitchLab();

  assert.equal(lab.pc1.device.name, "PC1");
  assert.equal(lab.pc2.device.name, "PC2");
  assert.equal(lab.switchDevice.name, "Switch Ethernet");
  assert.equal(lab.engine.topology.connections.length, 2);
  assert.equal(
    lab.engine.topology.isConnected(lab.pc1.networkInterface.id, lab.pc1SwitchPort.id),
    true,
  );
  assert.equal(
    lab.engine.topology.isConnected(lab.pc2.networkInterface.id, lab.pc2SwitchPort.id),
    true,
  );
  assert.equal(lab.pc1.ipv4.address, "192.168.10.1");
  assert.equal(lab.pc1.ipv4.subnetMask, "255.255.255.0");
  assert.equal(lab.pc1.networkInterface.name, "eth0");
  assert.equal(lab.pc1.arpCache.get(lab.pc2.ipv4.address), undefined);
  assert.equal(lab.ethernetSwitch.macTableSnapshot.length, 0);
});

test("resolves ARP, learns both MAC addresses, forwards ICMP echo, and returns a reply", () => {
  const lab = new PeerSwitchLab();

  const result = lab.ping();
  const eventTypes = result.events.map((event) => event.type);

  assert.equal(result.success, true);
  assert.equal(result.sourceIp, "192.168.10.1");
  assert.equal(result.destinationIp, "192.168.10.2");
  assert.equal(lab.pc1.arpCache.get(lab.pc2.ipv4.address), lab.pc2.macAddress);
  assert.equal(lab.pc2.arpCache.get(lab.pc1.ipv4.address), lab.pc1.macAddress);
  assert.deepEqual(
    lab.ethernetSwitch.macTableSnapshot.map((entry) => entry.macAddress).sort(),
    [lab.pc1.macAddress, lab.pc2.macAddress].sort(),
  );

  const arpRequestIndex = eventTypes.indexOf("arp-request-sent");
  const firstFloodIndex = eventTypes.indexOf("ethernet-frame-flooded");
  const arpReplyIndex = eventTypes.indexOf("arp-reply-sent");
  const knownForwardIndex = eventTypes.indexOf("ethernet-frame-forwarded");
  const echoRequestIndex = eventTypes.indexOf("icmp-echo-request-sent");
  const echoReceivedIndex = eventTypes.indexOf("icmp-echo-request-received");
  const echoReplyIndex = eventTypes.indexOf("icmp-echo-reply-sent");
  const successIndex = eventTypes.indexOf("icmp-ping-succeeded");

  assert.ok(arpRequestIndex >= 0);
  assert.ok(firstFloodIndex > arpRequestIndex);
  assert.ok(arpReplyIndex > firstFloodIndex);
  assert.ok(knownForwardIndex > arpReplyIndex);
  assert.ok(echoRequestIndex > knownForwardIndex);
  assert.ok(echoReceivedIndex > echoRequestIndex);
  assert.ok(echoReplyIndex > echoReceivedIndex);
  assert.ok(successIndex > echoReplyIndex);
  assert.equal(result.events.at(-1).type, "icmp-ping-succeeded");
});

test("reuses learned ARP and switch entries for subsequent pings", () => {
  const lab = new PeerSwitchLab();
  lab.ping();

  const result = lab.ping();

  assert.equal(result.success, true);
  assert.equal(result.events.some((event) => event.type === "arp-request-sent"), false);
  assert.equal(result.events.some((event) => event.type === "ethernet-frame-flooded"), false);
  assert.equal(result.events.some((event) => event.type === "ethernet-frame-forwarded"), true);
});

test("floods a broadcast ARP request but reports failure for an unknown peer", () => {
  const lab = new PeerSwitchLab();

  const result = lab.ping("192.168.10.99");

  assert.equal(result.success, false);
  assert.match(result.message, /Aucune réponse ARP/);
  assert.equal(result.events.some((event) => event.type === "arp-request-sent"), true);
  assert.equal(result.events.some((event) => event.type === "ethernet-frame-flooded"), true);
  assert.equal(result.events.some((event) => event.type === "arp-resolution-failed"), true);
  assert.equal(result.events.some((event) => event.type === "icmp-ping-succeeded"), false);
});

test("does not claim remote-subnet connectivity without a configured router", () => {
  const lab = new PeerSwitchLab();

  const result = lab.ping("192.168.11.2");

  assert.equal(result.success, false);
  assert.match(result.message, /Aucune passerelle/);
  assert.equal(result.events.some((event) => event.type === "icmp-destination-unreachable"), true);
  assert.equal(result.events.some((event) => event.type === "arp-request-sent"), false);
});

test("validates IPv4, subnet masks, MAC addresses, and duplicate host addresses", () => {
  assert.throws(
    () => new PeerSwitchLab({ pc1: { address: "300.1.1.1" } }),
    { code: "invalid-ipv4-address" },
  );
  assert.throws(
    () => new PeerSwitchLab({ pc1: { subnetMask: "255.0.255.0" } }),
    { code: "invalid-subnet-mask" },
  );
  assert.throws(
    () => new PeerSwitchLab({ pc1: { macAddress: "not-a-mac" } }),
    { code: "invalid-mac-address" },
  );
  assert.throws(
    () => new PeerSwitchLab({ pc2: { address: "192.168.10.1" } }),
    { code: "duplicate-host-ip-address" },
  );
  assert.throws(
    () => new PeerSwitchLab({ pc2: { macAddress: "02:00:00:00:00:01" } }),
    { code: "duplicate-host-mac-address" },
  );
});

test("floods an unknown unicast only to connected ports and learns its source", () => {
  const engine = new SimulationEngine();
  const pc1 = engine.createDevice("PC1", "host");
  const pc2 = engine.createDevice("PC2", "host");
  const sw = engine.createDevice("Switch", "switch");
  const pc1Port = engine.createInterface(pc1.id, "eth0");
  const pc2Port = engine.createInterface(pc2.id, "eth0");
  const switchPort1 = engine.createInterface(sw.id, "port1");
  const switchPort2 = engine.createInterface(sw.id, "port2");
  const unusedSwitchPort = engine.createInterface(sw.id, "port3");
  engine.connectInterfaces(pc1Port.id, switchPort1.id);
  engine.connectInterfaces(pc2Port.id, switchPort2.id);
  const ethernetSwitch = new EthernetSwitch(
    sw.name,
    [switchPort1.id, switchPort2.id, unusedSwitchPort.id],
    engine.topology,
    engine,
  );

  const egresses = ethernetSwitch.receive(switchPort1.id, {
    sourceMac: "02:00:00:00:00:01",
    destinationMac: "02:00:00:00:00:99",
    etherType: "ARP",
    payload: {
      operation: "request",
      senderMac: "02:00:00:00:00:01",
      senderIp: "192.168.10.1",
      targetIp: "192.168.10.99",
    },
  });

  assert.deepEqual(egresses.map((egress) => egress.portInterfaceId), [switchPort2.id]);
  assert.equal(ethernetSwitch.macTableSnapshot[0].portInterfaceId, switchPort1.id);
  assert.equal(engine.events.at(-1).type, "ethernet-frame-flooded");
});

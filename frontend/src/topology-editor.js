import {
  isSameSubnet,
  normalizeIPv4Address,
  normalizeMacAddress,
  validateIPv4Configuration,
} from "./index.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEVICE_HEIGHT,
  DEVICE_WIDTH,
  addConnection,
  addDevice,
  createEmptyTopology,
  generateLocalMacAddress,
  moveDevice,
  normalizeSwitchConfiguration,
  normalizeTopology,
  removeConnection,
  removeDevice,
} from "./topology-model.mjs";

const DEVICE_LABELS = {
  pc: "PC de bureau",
  laptop: "Laptop",
  switch: "Switch",
  "layer3-switch": "Switch multicouche",
  router: "Routeur",
  server: "Serveur",
  "access-point": "Point d’accès",
};

function isSwitchDevice(device) {
  return device.kind === "switch" || device.kind === "layer3-switch";
}

function trimSwitchConfiguration(configuration, interfaceIds) {
  const trimRunning = (running) => ({
    ...running,
    staticMacEntries: running.staticMacEntries.filter((entry) =>
      interfaceIds.has(entry.portInterfaceId)),
    ...(running.routedPorts
      ? {
          routedPorts: Object.fromEntries(Object.entries(running.routedPorts)
            .filter(([interfaceId]) => interfaceIds.has(interfaceId))),
        }
      : {}),
  });
  return {
    ...configuration,
    running: trimRunning(configuration.running),
    startup: configuration.startup ? trimRunning(configuration.startup) : null,
  };
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createField(labelText, name, value, options = {}) {
  const label = createElement("label", "editor-field", labelText);
  const input = document.createElement("input");
  input.name = name;
  input.type = options.type || "text";
  input.value = value ?? "";
  input.autocomplete = "off";
  input.spellcheck = false;
  if (options.required) input.required = true;
  if (options.readOnly) input.readOnly = true;
  label.append(input);
  return label;
}

function createCheckbox(labelText, name, checked) {
  const label = createElement("label", "editor-checkbox");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.checked = checked;
  label.append(input, document.createTextNode(labelText));
  return label;
}

function createSvgElement(tagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function addSvgElement(parent, tagName, attributes) {
  const element = createSvgElement(tagName);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  parent.append(element);
  return element;
}

function getPortLayout(device) {
  if (isSwitchDevice(device)) {
    const rows = Math.ceil(device.interfaces.length / 8);
    const firstRowY = 70 - ((rows - 1) * 9);
    return device.interfaces.map((_, index) => ({
      x: 25 + (index % 8) * 18,
      y: firstRowY + Math.floor(index / 8) * 18,
    }));
  }
  if (device.kind === "router") return device.interfaces.map((_, index) => ({ x: 46 + index * 30, y: 84 }));
  if (device.kind === "server") return device.interfaces.map((_, index) => ({ x: 64 + index * 19, y: 106 }));
  if (device.kind === "laptop") return device.interfaces.map(() => ({ x: 158, y: 88 }));
  if (device.kind === "access-point") return device.interfaces.map(() => ({ x: 92, y: 91 }));
  return device.interfaces.map(() => ({ x: 158, y: 75 }));
}

function drawDeviceBody(svg, kind) {
  if (kind === "pc") {
    addSvgElement(svg, "rect", {
      x: 20, y: 13, width: 96, height: 64, rx: 5,
      fill: "#1E3A8A", stroke: "#0F172A", "stroke-width": 3,
    });
    addSvgElement(svg, "rect", { x: 27, y: 20, width: 82, height: 50, rx: 2, fill: "#2DD4BF" });
    addSvgElement(svg, "path", {
      d: "M45 51h20l8-10 10 14 8-8h8",
      fill: "none", stroke: "#1E3A8A", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round",
    });
    addSvgElement(svg, "path", { d: "M61 78v12h15V78M53 92h31", fill: "none", stroke: "#1E3A8A", "stroke-width": 5, "stroke-linecap": "round" });
    addSvgElement(svg, "rect", { x: 129, y: 43, width: 31, height: 59, rx: 5, fill: "#14B8A6", stroke: "#1E3A8A", "stroke-width": 2 });
    addSvgElement(svg, "path", { d: "M135 54h19M135 61h19", stroke: "#1E3A8A", "stroke-width": 2, "stroke-linecap": "round" });
    addSvgElement(svg, "circle", { cx: 145, cy: 91, r: 3, fill: "#2DD4BF", stroke: "#0F172A", "stroke-width": 1 });
    return;
  }

  if (kind === "laptop") {
    addSvgElement(svg, "rect", { x: 42, y: 10, width: 99, height: 69, rx: 7, fill: "#1E3A8A", stroke: "#0F172A", "stroke-width": 3 });
    addSvgElement(svg, "rect", { x: 49, y: 17, width: 85, height: 55, rx: 3, fill: "#2DD4BF" });
    addSvgElement(svg, "path", { d: "M61 49h17l8-10 10 14 8-9h16", fill: "none", stroke: "#1E3A8A", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" });
    addSvgElement(svg, "path", { d: "M30 82h124l13 13c1 2-1 4-4 4H24c-3 0-5-2-3-4l9-13Z", fill: "#14B8A6", stroke: "#1E3A8A", "stroke-width": 3, "stroke-linejoin": "round" });
    addSvgElement(svg, "path", { d: "M74 84h36l-4 6H78l-4-6Z", fill: "#1E3A8A" });
    return;
  }

  if (kind === "switch" || kind === "layer3-switch") {
    addSvgElement(svg, "rect", { x: 10, y: 22, width: 164, height: 79, rx: 8, fill: "#1E3A8A", stroke: "#0F172A", "stroke-width": 3 });
    addSvgElement(svg, "rect", { x: 17, y: 31, width: 150, height: 62, rx: 4, fill: "#0F172A" });
    addSvgElement(svg, "path", { d: "M25 42h30M25 48h20", stroke: "#2DD4BF", "stroke-width": 2, "stroke-linecap": "round" });
    addSvgElement(svg, "circle", { cx: 151, cy: 40, r: 3, fill: "#2DD4BF" });
    addSvgElement(svg, "circle", { cx: 160, cy: 40, r: 3, fill: "#14B8A6" });
    return;
  }

  if (kind === "router") {
    addSvgElement(svg, "path", { d: "M32 43 47 28h90l15 15v37l-15 13H47L32 80V43Z", fill: "#1E3A8A", stroke: "#0F172A", "stroke-width": 3, "stroke-linejoin": "round" });
    addSvgElement(svg, "path", { d: "M53 48h18l-7-7m7 7-7 7M131 68h-18l7-7m-7 7 7 7", fill: "none", stroke: "#2DD4BF", "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" });
    addSvgElement(svg, "circle", { cx: 92, cy: 60, r: 13, fill: "#14B8A6", stroke: "#FFFFFF", "stroke-width": 2 });
    addSvgElement(svg, "path", { d: "M92 52v16M84 60h16", stroke: "#1E3A8A", "stroke-width": 2, "stroke-linecap": "round" });
    return;
  }

  if (kind === "server") {
    addSvgElement(svg, "rect", { x: 44, y: 11, width: 96, height: 108, rx: 7, fill: "#1E3A8A", stroke: "#0F172A", "stroke-width": 3 });
    [20, 45, 70].forEach((y) => {
      addSvgElement(svg, "rect", { x: 52, y, width: 80, height: 21, rx: 3, fill: "#0F172A", stroke: "#64748B", "stroke-width": 1 });
      addSvgElement(svg, "path", { d: `M62 ${y + 6}h42M62 ${y + 12}h30`, stroke: "#94A3B8", "stroke-width": 2, "stroke-linecap": "round" });
      addSvgElement(svg, "circle", { cx: 122, cy: y + 10, r: 3, fill: "#2DD4BF" });
    });
    addSvgElement(svg, "path", { d: "M53 99h76", stroke: "#2DD4BF", "stroke-width": 2 });
    return;
  }

  addSvgElement(svg, "path", { d: "M38 61c0-20 23-35 54-35s54 15 54 35v21c0 11-24 20-54 20S38 93 38 82V61Z", fill: "#14B8A6", stroke: "#1E3A8A", "stroke-width": 3 });
  addSvgElement(svg, "ellipse", { cx: 92, cy: 61, rx: 54, ry: 20, fill: "#2DD4BF", stroke: "#1E3A8A", "stroke-width": 3 });
  addSvgElement(svg, "path", { d: "M70 53q22-22 44 0M78 58q14-14 28 0", fill: "none", stroke: "#1E3A8A", "stroke-width": 3, "stroke-linecap": "round" });
  addSvgElement(svg, "circle", { cx: 92, cy: 62, r: 3, fill: "#1E3A8A" });
  addSvgElement(svg, "path", { d: "M48 47 37 29m99 18 11-18M73 40l-5-18m46 18 5-18", stroke: "#1E3A8A", "stroke-width": 3, "stroke-linecap": "round" });
}

function drawEquipmentSvg(svg, device, connected, pendingPortId) {
  drawDeviceBody(svg, device.kind);
  const layout = getPortLayout(device);
  device.interfaces.forEach((networkInterface, index) => {
    const point = layout[index];
    const isConnected = connected.has(networkInterface.id);
    const portEnabled = isSwitchDevice(device)
      ? device.switchConfig?.running?.ports?.[networkInterface.id]?.enabled !== false
      : networkInterface.enabled;
    const group = addSvgElement(svg, "g", {
      class: `equipment-port${isConnected ? " is-connected" : ""}${!portEnabled ? " is-disabled" : ""}${pendingPortId === networkInterface.id ? " is-pending" : ""}`,
      "data-interface-id": networkInterface.id,
      role: "button",
      tabindex: 0,
      "aria-label": `${networkInterface.name}, port Ethernet ${index + 1}, ${!portEnabled ? "désactivé" : isConnected ? "connecté" : "libre"}`,
    });
    addSvgElement(group, "title", {}).textContent =
      `${networkInterface.name} · ${!portEnabled ? "port désactivé" : isConnected ? "connecté" : "port Ethernet libre"}`;
    addSvgElement(group, "rect", {
      x: point.x - 6, y: point.y - 5, width: 12, height: 10, rx: 1.5,
      class: "equipment-port-socket",
    });
    addSvgElement(group, "rect", {
      x: point.x - 3.5, y: point.y - 2.5, width: 7, height: 5, rx: 0.5,
      class: "equipment-port-opening",
    });
    const portLabel = isSwitchDevice(device) ? String(index + 1) : networkInterface.name;
    addSvgElement(group, "text", {
      x: point.x, y: point.y + 13, class: "equipment-port-label", "text-anchor": "middle",
    }).textContent = portLabel;
  });
}

function getPortPosition(device, interfaceId) {
  const index = device.interfaces.findIndex((networkInterface) => networkInterface.id === interfaceId);
  return index < 0 ? null : getPortLayout(device)[index];
}

function connectedInterfaces(topology) {
  return new Set(topology.connections.flatMap((connection) => [
    connection.firstInterfaceId,
    connection.secondInterfaceId,
  ]));
}

function gridOffset(index) {
  if (index === 0) return [0, 0];
  let firstIndex = 1;
  for (let ring = 1; ring < 100; ring += 1) {
    const positions = [];
    for (let x = -ring; x <= ring; x += 1) positions.push([x, -ring]);
    for (let y = -ring + 1; y <= ring; y += 1) positions.push([ring, y]);
    for (let x = ring - 1; x >= -ring; x -= 1) positions.push([x, ring]);
    for (let y = ring - 1; y > -ring; y -= 1) positions.push([-ring, y]);
    if (index < firstIndex + positions.length) return positions[index - firstIndex];
    firstIndex += positions.length;
  }
  return [0, index];
}

export class TopologyEditor {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.viewport = root.querySelector("#editor-viewport");
    this.world = root.querySelector("#editor-world");
    this.links = root.querySelector("#editor-links");
    this.deviceLayer = root.querySelector("#editor-devices");
    this.inspector = root.querySelector("#editor-inspector-content");
    this.announcement = root.querySelector("#editor-announcement");
    this.saveStatus = root.querySelector("#editor-save-status");
    this.topology = createEmptyTopology();
    this.selection = null;
    this.connectMode = false;
    this.pendingConnectionPort = null;
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this.pointerAction = null;

    root.querySelectorAll("[data-add-device]").forEach((button) => {
      button.addEventListener("click", () => this.add(button.dataset.addDevice));
    });
    root.querySelector("[data-connect-mode]").addEventListener("click", (event) => {
      this.setConnectMode(!this.connectMode);
      event.currentTarget.setAttribute("aria-pressed", String(this.connectMode));
    });
    root.querySelector("[data-zoom-in]").addEventListener("click", () => this.zoom(1.2));
    root.querySelector("[data-zoom-out]").addEventListener("click", () => this.zoom(1 / 1.2));
    root.querySelector("[data-reset-view]").addEventListener("click", () => this.centerView());
    root.querySelector("[data-delete-selection]").addEventListener("click", () => this.deleteSelection());
    root.querySelector("[data-editor-back]").addEventListener("click", () => {
      root.dispatchEvent(new CustomEvent("editor:close"));
    });
    root.querySelector("#editor-inspector-content").addEventListener("submit", (event) => {
      if (event.target.matches("[data-device-config]")) {
        event.preventDefault();
        this.saveDeviceConfiguration(event.target);
      }
    });
    this.deviceLayer.addEventListener("dblclick", (event) => {
      const node = event.target.closest("[data-device-id]");
      const device = this.topology.devices.find((item) => item.id === node?.dataset.deviceId);
      if (device?.kind !== "pc" && !isSwitchDevice(device)) return;
      event.preventDefault();
      this.root.dispatchEvent(new CustomEvent(device.kind === "pc" ? "computer:open" : "switch:open", {
        detail: { deviceId: device.id },
      }));
    });
    root.querySelector("#editor-inspector-content").addEventListener("click", (event) => {
      const deleteButton = event.target.closest("[data-delete-connection]");
      if (deleteButton) this.deleteConnection(deleteButton.dataset.deleteConnection);
      const deleteDeviceButton = event.target.closest("[data-delete-device]");
      if (deleteDeviceButton) this.deleteDevice(deleteDeviceButton.dataset.deleteDevice);
    });

    this.deviceLayer.addEventListener("click", (event) => {
      const port = event.target.closest("[data-interface-id]");
      const node = port?.closest("[data-device-id]") || event.target.closest("[data-device-id]");
      if (!node) return;
      const deviceId = node.dataset.deviceId;
      if (port && this.connectMode) {
        this.handleConnectionPortClick(deviceId, port.dataset.interfaceId);
      } else if (this.connectMode) {
        this.announce("Cliquez directement sur un port Ethernet de l’équipement.", true);
      } else {
        this.select({ type: "device", id: deviceId });
      }
    });
    this.deviceLayer.addEventListener("keydown", (event) => {
      const port = event.target.closest("[data-interface-id]");
      const node = port?.closest("[data-device-id]") || event.target.closest("[data-device-id]");
      if (!node || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      if (port && this.connectMode) {
        this.handleConnectionPortClick(node.dataset.deviceId, port.dataset.interfaceId);
      } else if (this.connectMode) {
        this.announce("Cliquez directement sur un port Ethernet de l’équipement.", true);
      } else {
        this.select({ type: "device", id: node.dataset.deviceId });
      }
    });
    this.links.addEventListener("click", (event) => {
      const connection = event.target.closest("[data-connection-id]");
      if (connection) this.select({ type: "connection", id: connection.dataset.connectionId });
    });
    this.links.addEventListener("keydown", (event) => {
      const connection = event.target.closest("[data-connection-id]");
      if (!connection || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      this.select({ type: "connection", id: connection.dataset.connectionId });
    });
    this.viewport.addEventListener("pointerdown", (event) => this.startPointerAction(event));
    this.viewport.addEventListener("pointermove", (event) => this.movePointerAction(event));
    this.viewport.addEventListener("pointerup", (event) => this.endPointerAction(event));
    this.viewport.addEventListener("pointercancel", (event) => this.endPointerAction(event));
    this.viewport.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
    }, { passive: false });
    this.viewport.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.connectMode) this.setConnectMode(false);
      if ((event.key === "Delete" || event.key === "Backspace")
        && !event.target.matches("input, select, textarea")) {
        event.preventDefault();
        this.deleteSelection();
      }
    });
  }

  open(topology) {
    const normalizedTopology = normalizeTopology(topology);
    const needsMigration = Boolean(topology?.devices?.length)
      && JSON.stringify(normalizedTopology) !== JSON.stringify(topology);
    this.topology = normalizedTopology;
    this.selection = null;
    this.pendingConnectionPort = null;
    this.setConnectMode(false);
    this.centerView();
    this.render();
    this.setSaveStatus("Enregistré localement", false);
    if (needsMigration) this.notifyChanged();
  }

  centerView() {
    this.scale = 1;
    this.panX = (this.viewport.clientWidth - CANVAS_WIDTH) / 2;
    this.panY = (this.viewport.clientHeight - CANVAS_HEIGHT) / 2;
    this.applyTransform();
  }

  zoom(factor) {
    const bounds = this.viewport.getBoundingClientRect();
    this.zoomAt(factor, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
  }

  zoomAt(factor, clientX, clientY) {
    const bounds = this.viewport.getBoundingClientRect();
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;
    const nextScale = Math.max(0.45, Math.min(1.8, this.scale * factor));
    const worldX = (pointX - this.panX) / this.scale;
    const worldY = (pointY - this.panY) / this.scale;
    this.scale = nextScale;
    this.panX = pointX - worldX * nextScale;
    this.panY = pointY - worldY * nextScale;
    this.applyTransform();
  }

  applyTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.root.querySelector("#editor-zoom-level").textContent = `${Math.round(this.scale * 100)}%`;
  }

  add(kind) {
    const bounds = this.viewport.getBoundingClientRect();
    const centerX = (bounds.width / 2 - this.panX) / this.scale - DEVICE_WIDTH / 2;
    const centerY = (bounds.height / 2 - this.panY) / this.scale - DEVICE_HEIGHT / 2;
    const [offsetX, offsetY] = gridOffset(this.topology.devices.length);
    try {
      this.topology = addDevice(
        this.topology,
        kind,
        centerX + offsetX * 212,
        centerY + offsetY * 180,
      );
      const device = this.topology.devices.at(-1);
      this.select({ type: "device", id: device.id });
      const saved = this.notifyChanged();
      this.announce(saved
        ? `${DEVICE_LABELS[kind]} ajouté. Configurez-le ou reliez-le à un autre équipement.`
        : "Équipement ajouté, mais la sauvegarde locale a échoué.", !saved);
    } catch (error) {
      this.announce(error.message, true);
    }
  }

  setConnectMode(enabled) {
    this.connectMode = enabled;
    this.pendingConnectionPort = null;
    const button = this.root.querySelector("[data-connect-mode]");
    button.classList.toggle("is-active", enabled);
    button.setAttribute("aria-pressed", String(enabled));
    this.viewport.classList.toggle("is-connecting", enabled);
    this.render();
    this.announce(enabled
      ? "Mode connexion activé. Sélectionnez un port Ethernet de départ."
      : "Mode connexion désactivé.");
  }

  handleConnectionPortClick(deviceId, interfaceId) {
    const device = this.topology.devices.find((item) => item.id === deviceId);
    const networkInterface = device?.interfaces.find((item) => item.id === interfaceId);
    const occupied = connectedInterfaces(this.topology);
    if (!networkInterface || !networkInterface.enabled || occupied.has(interfaceId)) {
      this.announce("Ce port est désactivé ou déjà connecté. Choisissez un port libre.", true);
      return;
    }

    if (!this.pendingConnectionPort) {
      this.pendingConnectionPort = { deviceId, interfaceId };
      this.select({ type: "device", id: deviceId });
      this.announce(`${device.name} · ${networkInterface.name} sélectionné. Choisissez le port de destination.`);
      return;
    }

    try {
      this.topology = addConnection(
        this.topology,
        this.pendingConnectionPort.deviceId,
        this.pendingConnectionPort.interfaceId,
        deviceId,
        interfaceId,
      );
      const connection = this.topology.connections.at(-1);
      this.pendingConnectionPort = null;
      this.select({ type: "connection", id: connection.id });
      const saved = this.notifyChanged();
      this.announce(saved
        ? "Câble Ethernet ajouté entre les ports sélectionnés."
        : "Câble ajouté, mais la sauvegarde locale a échoué.", !saved);
    } catch (error) {
      this.pendingConnectionPort = null;
      this.render();
      this.announce(error.message, true);
    }
  }

  select(selection) {
    this.selection = selection;
    const selectionExists = selection.type === "device"
      ? this.deviceLayer.querySelector(`[data-device-id="${CSS.escape(selection.id)}"]`)
      : this.links.querySelector(`[data-connection-id="${CSS.escape(selection.id)}"]`);
    if (!selectionExists || this.connectMode) {
      this.renderDevices();
      this.renderConnections();
    }
    this.deviceLayer.querySelectorAll("[data-device-id]").forEach((node) => {
      node.classList.toggle(
        "is-selected",
        selection.type === "device" && node.dataset.deviceId === selection.id,
      );
      node.classList.toggle(
        "is-pending",
        this.pendingConnectionPort?.deviceId === node.dataset.deviceId,
      );
    });
    this.links.querySelectorAll("[data-connection-id]").forEach((connection) => {
      connection.classList.toggle(
        "is-selected",
        selection.type === "connection" && connection.dataset.connectionId === selection.id,
      );
    });
    this.renderInspector();
    this.root.querySelector("[data-delete-selection]").disabled = !selection;
  }

  deleteSelection() {
    if (!this.selection) return;
    if (this.selection.type === "device") this.deleteDevice(this.selection.id);
    else this.deleteConnection(this.selection.id);
  }

  deleteDevice(deviceId) {
    const device = this.topology.devices.find((item) => item.id === deviceId);
    if (!device) return;
    this.topology = removeDevice(this.topology, deviceId);
    this.selection = null;
    this.pendingConnectionPort = null;
    this.render();
    const saved = this.notifyChanged();
    this.announce(saved
      ? `${device.name} et ses câbles ont été supprimés.`
      : "Équipement supprimé, mais la sauvegarde locale a échoué.", !saved);
  }

  deleteConnection(connectionId) {
    if (!this.topology.connections.some((item) => item.id === connectionId)) return;
    this.topology = removeConnection(this.topology, connectionId);
    this.selection = null;
    this.render();
    const saved = this.notifyChanged();
    this.announce(saved
      ? "Câble supprimé. Les interfaces sont de nouveau disponibles."
      : "Câble supprimé, mais la sauvegarde locale a échoué.", !saved);
  }

  startPointerAction(event) {
    if (event.button !== 0) return;
    const node = event.target.closest("[data-device-id]");
    const connection = event.target.closest("[data-connection-id]");
    if (node && this.connectMode) return;
    if (node) {
      const device = this.topology.devices.find((item) => item.id === node.dataset.deviceId);
      if (!device) return;
      this.pointerAction = {
        type: "device",
        pointerId: event.pointerId,
        deviceId: device.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: device.x,
        originY: device.y,
        moved: false,
      };
    } else if (!connection) {
      this.pointerAction = {
        type: "pan",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: this.panX,
        originY: this.panY,
      };
    } else {
      return;
    }
    if (!node) this.viewport.setPointerCapture(event.pointerId);
    if (node) this.select({ type: "device", id: node.dataset.deviceId });
  }

  movePointerAction(event) {
    const action = this.pointerAction;
    if (!action || action.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - action.startX;
    const deltaY = event.clientY - action.startY;
    if (action.type === "pan") {
      this.panX = action.originX + deltaX;
      this.panY = action.originY + deltaY;
      this.applyTransform();
      return;
    }

    if (!action.moved && Math.hypot(deltaX, deltaY) < 3) return;
    if (!action.moved) this.viewport.setPointerCapture(event.pointerId);
    action.moved = true;
    this.topology = moveDevice(
      this.topology,
      action.deviceId,
      action.originX + deltaX / this.scale,
      action.originY + deltaY / this.scale,
    );
    const node = this.deviceLayer.querySelector(`[data-device-id="${CSS.escape(action.deviceId)}"]`);
    const device = this.topology.devices.find((item) => item.id === action.deviceId);
    node.style.left = `${device.x}px`;
    node.style.top = `${device.y}px`;
    this.renderConnections();
  }

  endPointerAction(event) {
    const action = this.pointerAction;
    if (!action || action.pointerId !== event.pointerId) return;
    this.pointerAction = null;
    if (action.type === "device" && action.moved) {
      const saved = this.notifyChanged();
      this.announce(saved
        ? "Position enregistrée."
        : "Position modifiée, mais la sauvegarde locale a échoué.", !saved);
    }
  }

  updateComputerConfiguration(deviceId, configuration) {
    const device = this.topology.devices.find((item) => item.id === deviceId && item.kind === "pc");
    if (!device) throw new Error("Ordinateur introuvable dans ce laboratoire.");
    const networkInterface = device.interfaces[0];
    if (!networkInterface) throw new Error("L’ordinateur ne possède aucune interface réseau.");

    const subnetMask = configuration.subnetMask || "255.255.255.0";
    const ipv4 = configuration.dhcpEnabled
      ? { address: "", subnetMask }
      : configuration.ipv4Address
        ? validateIPv4Configuration({ address: configuration.ipv4Address, subnetMask })
        : { address: "", subnetMask };
    const defaultGateway = configuration.defaultGateway
      ? normalizeIPv4Address(configuration.defaultGateway)
      : "";
    const dnsServer = configuration.dnsServer
      ? normalizeIPv4Address(configuration.dnsServer)
      : "";
    if (defaultGateway && ipv4.address && !isSameSubnet(ipv4.address, defaultGateway, ipv4.subnetMask)) {
      throw new Error("La passerelle doit appartenir au même sous-réseau que l’ordinateur.");
    }

    const duplicateAddress = this.topology.devices.some((item) =>
      item.id !== device.id
      && item.interfaces.some((candidate) =>
        candidate.ipv4Address === ipv4.address && Boolean(ipv4.address)));
    if (duplicateAddress) throw new Error(`L’adresse IPv4 ${ipv4.address} est déjà utilisée dans ce laboratoire.`);

    this.topology = {
      ...this.topology,
      devices: this.topology.devices.map((item) => item.id === device.id
        ? {
            ...item,
            defaultGateway,
            dnsServer,
            dhcpEnabled: configuration.dhcpEnabled,
            icmpEnabled: configuration.icmpEnabled,
            interfaces: item.interfaces.map((currentInterface) =>
              currentInterface.id === networkInterface.id
                ? { ...currentInterface, ipv4Address: ipv4.address, subnetMask: ipv4.subnetMask }
                : currentInterface),
          }
        : item),
    };
    const saved = this.notifyChanged();
    this.render();
    this.announce(saved
      ? "Configuration IP enregistrée."
      : "Configuration modifiée, mais la sauvegarde locale a échoué.", !saved);
    if (!saved) throw new Error("La configuration n’a pas pu être enregistrée dans ce navigateur.");
  }

  updateSwitchConfiguration(deviceId, configuration) {
    const device = this.topology.devices.find((item) => item.id === deviceId && isSwitchDevice(item));
    if (!device) throw new Error("Commutateur introuvable dans ce laboratoire.");
    const switchConfig = normalizeSwitchConfiguration(configuration, device.name, device.interfaces);
    this.topology = {
      ...this.topology,
      devices: this.topology.devices.map((item) =>
        item.id === deviceId ? { ...item, switchConfig } : item),
    };
    const saved = this.notifyChanged();
    this.render();
    if (!saved) throw new Error("La configuration du commutateur n’a pas pu être enregistrée.");
  }

  saveDeviceConfiguration(form) {
    const device = this.topology.devices.find((item) => item.id === form.dataset.deviceId);
    if (!device) return;
    const values = new FormData(form);
    const name = values.get("name").trim();
    if (!name) {
      this.announce("Le nom de l’équipement est obligatoire.", true);
      return;
    }

    try {
      let updatedDevice = { ...device, name };
      const addressesInUse = new Set(this.topology.devices
        .filter((item) => item.id !== device.id)
        .flatMap((item) => item.interfaces.map((networkInterface) => networkInterface.macAddress)));
      const configuredAddresses = new Set();
      const readMacAddress = (index) => {
        const macAddress = normalizeMacAddress(values.get(`interface-${index}-mac`).trim());
        if (addressesInUse.has(macAddress) || configuredAddresses.has(macAddress)) {
          throw new Error(`L’adresse MAC ${macAddress} est déjà utilisée dans ce laboratoire.`);
        }
        configuredAddresses.add(macAddress);
        return macAddress;
      };

      if (isSwitchDevice(device)) {
        const portCount = Number(values.get("portCount"));
        if (![4, 8, 16, 24].includes(portCount)) throw new Error("Nombre de ports non valide.");
        const connected = connectedInterfaces(this.topology);
        const removedPort = device.interfaces.slice(portCount).some((item) => connected.has(item.id));
        if (removedPort) throw new Error("Débranchez les ports concernés avant de réduire leur nombre.");
        const macAddresses = new Set(this.topology.devices
          .flatMap((item) => item.interfaces.map((networkInterface) => networkInterface.macAddress)));
        updatedDevice = {
          ...updatedDevice,
          portCount,
          interfaces: Array.from({ length: portCount }, (_, index) =>
            device.interfaces[index] || {
              id: `${device.id}-if-${index}`,
              name: `Fa0/${index + 1}`,
              enabled: true,
              macAddress: generateLocalMacAddress(macAddresses),
            }).map((networkInterface, index) => ({
              ...networkInterface,
              enabled: true,
              macAddress: readMacAddress(index),
            })),
        };
        const remainingInterfaceIds = new Set(updatedDevice.interfaces.map((item) => item.id));
        updatedDevice.switchConfig = normalizeSwitchConfiguration(
          trimSwitchConfiguration(device.switchConfig, remainingInterfaceIds),
          name,
          updatedDevice.interfaces,
          device.kind === "layer3-switch" ? "catalyst-3560" : "catalyst-2960",
        );
        updatedDevice.switchConfig = {
          ...updatedDevice.switchConfig,
          running: {
            ...updatedDevice.switchConfig.running,
            ports: Object.fromEntries(updatedDevice.interfaces.map((networkInterface, index) => [
              networkInterface.id,
              {
                ...updatedDevice.switchConfig.running.ports[networkInterface.id],
                enabled: values.get(`interface-${index}-enabled`) === "on",
              },
            ])),
          },
        };
      } else {
        updatedDevice.interfaces = device.interfaces.map((networkInterface, index) => {
          const networkInterfaceName = values.get(`interface-${index}-name`).trim();
          if (!networkInterfaceName) throw new Error("Le nom d’une interface est obligatoire.");
          const enabled = values.get(`interface-${index}-enabled`) === "on";
          const macAddress = readMacAddress(index);
          if (device.kind === "pc" || device.kind === "laptop" || device.kind === "router") {
            const ipv4Address = values.get(`interface-${index}-ipv4`).trim();
            const subnetMask = values.get(`interface-${index}-mask`).trim();
            if (ipv4Address || subnetMask !== "255.255.255.0") {
              const validated = validateIPv4Configuration({ address: ipv4Address, subnetMask });
              return {
                ...networkInterface,
                name: networkInterfaceName,
                enabled,
                macAddress,
                ipv4Address: validated.address,
                subnetMask: validated.subnetMask,
              };
            }
            return {
              ...networkInterface,
              name: networkInterfaceName,
              enabled,
              macAddress,
              ipv4Address,
              subnetMask,
            };
          }
          return { ...networkInterface, name: networkInterfaceName, enabled, macAddress };
        });
        if (new Set(updatedDevice.interfaces.map((item) => item.name)).size !== updatedDevice.interfaces.length) {
          throw new Error("Chaque interface doit avoir un nom distinct.");
        }
      }

      this.topology = {
        ...this.topology,
        devices: this.topology.devices.map((item) => item.id === device.id ? updatedDevice : item),
      };
      const saved = this.notifyChanged();
      this.render();
      this.announce(saved
        ? "Configuration de l’équipement enregistrée."
        : "Configuration modifiée, mais la sauvegarde locale a échoué.", !saved);
    } catch (error) {
      this.announce(error.message, true);
      this.renderInspector();
    }
  }

  notifyChanged() {
    const saved = this.onChange(structuredClone(this.topology));
    this.setSaveStatus(saved ? "Enregistré localement" : "Échec de l’enregistrement", !saved);
    return saved;
  }

  setSaveStatus(text, isError) {
    this.saveStatus.textContent = text;
    this.saveStatus.classList.toggle("is-error", isError);
  }

  announce(text, isError = false) {
    this.announcement.textContent = text;
    this.announcement.classList.toggle("is-error", isError);
  }

  render() {
    this.renderDevices();
    this.renderConnections();
    this.renderInspector();
    this.root.querySelector("[data-delete-selection]").disabled = !this.selection;
  }

  renderDevices() {
    const occupied = connectedInterfaces(this.topology);
    this.root.querySelector("#editor-canvas-empty").hidden = this.topology.devices.length > 0;
    const nodes = this.topology.devices.map((device) => {
      const node = createElement("div", `topology-node device-${device.kind}`);
      node.dataset.deviceId = device.id;
      node.style.left = `${device.x}px`;
      node.style.top = `${device.y}px`;
      node.tabIndex = 0;
      node.setAttribute("role", "group");
      node.setAttribute("aria-label", `${DEVICE_LABELS[device.kind]} ${device.name}`);
      node.classList.toggle(
        "is-selected",
        this.selection?.type === "device" && this.selection.id === device.id,
      );
      node.classList.toggle("is-pending", this.pendingConnectionPort?.deviceId === device.id);

      const illustration = createSvgElement("svg");
      illustration.classList.add("equipment-illustration");
      illustration.setAttribute("viewBox", "0 0 184 126");
      illustration.setAttribute("role", "group");
      illustration.setAttribute("aria-label", `${DEVICE_LABELS[device.kind]} ${device.name} et ses ports`);
      drawEquipmentSvg(
        illustration,
        device,
        occupied,
        this.pendingConnectionPort?.deviceId === device.id
          ? this.pendingConnectionPort.interfaceId
          : null,
      );
      const name = createElement("strong", "topology-node-name", device.name);
      const connectedCount = device.interfaces.filter((item) => occupied.has(item.id)).length;
      const detail = isSwitchDevice(device)
        ? `${connectedCount} / ${device.portCount} ports connectés`
        : device.kind === "pc" && device.interfaces[0]?.ipv4Address
          ? device.interfaces[0].ipv4Address
          : `${device.interfaces.length} port${device.interfaces.length > 1 ? "s" : ""} Ethernet`;
      const meta = createElement("span", "topology-node-meta", detail);
      node.append(illustration, name, meta);
      return node;
    });
    this.deviceLayer.replaceChildren(...nodes);
  }

  renderConnections() {
    const groups = this.topology.connections.map((connection) => {
      const first = this.topology.devices.find((item) => item.id === connection.firstDeviceId);
      const second = this.topology.devices.find((item) => item.id === connection.secondDeviceId);
      if (!first || !second) return null;
      const firstPort = getPortPosition(first, connection.firstInterfaceId);
      const secondPort = getPortPosition(second, connection.secondInterfaceId);
      if (!firstPort || !secondPort) return null;
      const group = createSvgElement("g");
      group.dataset.connectionId = connection.id;
      group.classList.add("topology-link");
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute(
        "aria-label",
        `Câble Ethernet entre ${first.name} ${connection.firstInterfaceId} et ${second.name} ${connection.secondInterfaceId}`,
      );
      if (this.selection?.type === "connection" && this.selection.id === connection.id) {
        group.classList.add("is-selected");
      }
      const coordinates = {
        x1: first.x + firstPort.x,
        y1: first.y + firstPort.y,
        x2: second.x + secondPort.x,
        y2: second.y + secondPort.y,
      };
      const hitTarget = createSvgElement("line");
      hitTarget.setAttribute("class", "topology-link-hit");
      Object.entries(coordinates).forEach(([key, value]) => hitTarget.setAttribute(key, String(value)));
      const selectionLine = createSvgElement("line");
      selectionLine.setAttribute("class", "topology-link-selection");
      Object.entries(coordinates).forEach(([key, value]) => selectionLine.setAttribute(key, String(value)));
      const line = createSvgElement("line");
      line.setAttribute("class", "topology-link-line");
      Object.entries(coordinates).forEach(([key, value]) => line.setAttribute(key, String(value)));
      group.append(hitTarget, selectionLine, line);
      return group;
    }).filter(Boolean);
    this.links.replaceChildren(...groups);
  }

  renderInspector() {
    if (!this.selection) {
      this.inspector.replaceChildren(
        createElement("span", "section-eyebrow", "CONFIGURATION"),
        createElement("h3", "", "Aucun équipement sélectionné"),
        createElement("p", "editor-inspector-empty", "Sélectionnez un équipement ou un câble pour consulter ses propriétés."),
      );
      return;
    }

    if (this.selection.type === "connection") {
      const connection = this.topology.connections.find((item) => item.id === this.selection.id);
      if (!connection) return;
      const first = this.topology.devices.find((item) => item.id === connection.firstDeviceId);
      const second = this.topology.devices.find((item) => item.id === connection.secondDeviceId);
      const firstInterface = first.interfaces.find((item) => item.id === connection.firstInterfaceId);
      const secondInterface = second.interfaces.find((item) => item.id === connection.secondInterfaceId);
      const heading = createElement("div", "editor-inspector-heading");
      heading.append(
        createElement("span", "section-eyebrow", "CONNEXION"),
        createElement("h3", "", "Câble Ethernet"),
      );
      const description = createElement(
        "p",
        "editor-link-description",
        `${first.name} · ${firstInterface.name} ↔ ${second.name} · ${secondInterface.name}`,
      );
      const removeButton = createElement("button", "button button-danger editor-delete-button", "Supprimer le câble");
      removeButton.type = "button";
      removeButton.dataset.deleteConnection = connection.id;
      this.inspector.replaceChildren(heading, description, removeButton);
      return;
    }

    const device = this.topology.devices.find((item) => item.id === this.selection.id);
    if (!device) return;
    this.inspector.replaceChildren(this.createDeviceForm(device));
  }

  createDeviceForm(device) {
    const form = createElement("form", "editor-config-form");
    form.dataset.deviceConfig = "";
    form.dataset.deviceId = device.id;
    form.append(
      createElement("span", "section-eyebrow", DEVICE_LABELS[device.kind].toUpperCase()),
      createElement("h3", "", "Configuration"),
      createField("Nom de l’équipement", "name", device.name, { required: true }),
    );

    if (isSwitchDevice(device)) {
      form.append(createElement(
        "p",
        "editor-port-status",
        device.kind === "layer3-switch"
          ? "Catalyst 3560 · commutation VLAN et routage IPv4 Layer 3."
          : "Catalyst 2960 · commutation Ethernet Layer 2.",
      ));
      const label = createElement("label", "editor-field", "Nombre de ports");
      const select = document.createElement("select");
      select.name = "portCount";
      [4, 8, 16, 24].forEach((count) => {
        const option = document.createElement("option");
        option.value = String(count);
        option.textContent = `${count} ports`;
        option.selected = device.portCount === count;
        select.append(option);
      });
      label.append(select);
      form.append(label, createElement("h4", "editor-subheading", "État des ports"));
      this.appendPortStates(form, device);
    } else {
      device.interfaces.forEach((networkInterface, index) => {
        form.append(createElement("h4", "editor-subheading", `Interface ${networkInterface.name}`));
        form.append(createField("Nom de l’interface", `interface-${index}-name`, networkInterface.name));
        form.append(createCheckbox(
          "Interface activée",
          `interface-${index}-enabled`,
          networkInterface.enabled,
        ));
        form.append(createField("Adresse MAC", `interface-${index}-mac`, networkInterface.macAddress));
        if (device.kind === "pc" || device.kind === "laptop" || device.kind === "router") {
          form.append(
            createField("Adresse IPv4", `interface-${index}-ipv4`, networkInterface.ipv4Address),
            createField("Masque réseau", `interface-${index}-mask`, networkInterface.subnetMask || "255.255.255.0"),
          );
        }
        const status = createElement(
          "p",
          "editor-port-status",
          this.interfaceStatus(device, networkInterface),
        );
        form.append(status);
      });
    }

    const saveButton = createElement("button", "button button-primary editor-save-device", "Enregistrer la configuration");
    saveButton.type = "submit";
    const deleteButton = createElement("button", "button button-danger editor-delete-button", "Supprimer l’équipement");
    deleteButton.type = "button";
    deleteButton.dataset.deleteDevice = device.id;
    form.append(saveButton, deleteButton);
    return form;
  }

  appendPortStates(form, device) {
    const occupied = connectedInterfaces(this.topology);
    const list = createElement("div", "editor-port-list");
    device.interfaces.forEach((networkInterface, index) => {
      const row = createElement("div", "editor-port-row");
      const portConfiguration = device.switchConfig?.running?.ports?.[networkInterface.id];
      row.append(
        createCheckbox(networkInterface.name, `interface-${index}-enabled`, portConfiguration?.enabled !== false),
        createField("Adresse MAC", `interface-${index}-mac`, networkInterface.macAddress),
      );
      const statusText = portConfiguration?.enabled === false
        ? "Désactivé"
        : occupied.has(networkInterface.id) ? "Connecté" : "Libre";
      row.append(createElement("span", "editor-port-state", statusText));
      list.append(row);
    });
    form.append(list);
  }

  interfaceStatus(device, networkInterface) {
    const isConnected = this.topology.connections.some((connection) =>
      connection.firstInterfaceId === networkInterface.id
      || connection.secondInterfaceId === networkInterface.id);
    return `${networkInterface.enabled ? "Activée" : "Désactivée"} · ${isConnected ? "câble connecté" : "aucun câble"}`;
  }
}

import { ComputerTerminal, SwitchTerminal, TopologySimulation } from "./index.js";
import { initializePwa } from "./pwa.mjs";
import { createEmptyTopology } from "./topology-model.mjs";
import { TopologyEditor } from "./topology-editor.js";

const STORAGE_KEY = "pocketnet.laboratories.v1";
const TERMINAL_STATE_KEY = "pocketnet.terminal-sessions.v1";
const TERMINAL_STATE_SAVE_DELAY_MS = 100;
const menuButton = document.querySelector(".menu-toggle");
const sidebar = document.querySelector(".sidebar");
const labList = document.querySelector("#lab-list");
const emptyLabs = document.querySelector("#empty-labs");
const createDialog = document.querySelector("#create-dialog");
const settingsDialog = document.querySelector("#settings-dialog");
const resourcesDialog = document.querySelector("#resources-dialog");
const guideDialog = document.querySelector("#guide-dialog");
const createForm = document.querySelector("#create-form");
const createError = document.querySelector("#create-error");
const toast = document.querySelector("#app-toast");
const labCount = document.querySelector("#lab-count");
const headingLabCount = document.querySelector("#heading-lab-count");
const content = document.querySelector(".content");
const labEditorRoot = document.querySelector("#lab-editor");
const editorTitle = document.querySelector("#editor-title");
const clearLabsButton = document.querySelector("#clear-labs");
const computerDialog = document.querySelector("#pc-management-dialog");
const switchDialog = document.querySelector("#switch-management-dialog");
const computerTitle = document.querySelector("#pc-management-title");
const computerDesktopPanel = document.querySelector("#pc-desktop-panel");
const computerIpForm = document.querySelector("#pc-ip-form");
const computerConfigMessage = document.querySelector("#pc-config-message");
const computerTerminalPanel = document.querySelector("#pc-terminal-output");
const computerTerminalForm = document.querySelector("#pc-terminal-form");
const computerTerminalInput = document.querySelector("#pc-terminal-command");
const computerTerminalPrompt = document.querySelector("#pc-terminal-prompt");
const computerTerminalStatus = document.querySelector("#pc-terminal-status");
const switchTitle = document.querySelector("#switch-management-title");
const switchTerminalOutput = document.querySelector("#switch-terminal-output");
const switchTerminalForm = document.querySelector("#switch-terminal-form");
const switchTerminalInput = document.querySelector("#switch-terminal-command");
const switchTerminalPrompt = document.querySelector("#switch-terminal-prompt");
const switchTerminalStatus = document.querySelector("#switch-terminal-status");
const simulationEventList = document.querySelector("#simulation-events");
const simulationEventCount = document.querySelector("#simulation-event-count");
const guides = {
  osi: {
    title: "Comprendre le modèle OSI",
    description: "Le modèle OSI est une représentation en sept couches qui aide à décrire les fonctions d’un système de communication réseau.",
    paragraphs: [
      "De la couche physique à la couche application, chaque niveau a un rôle distinct : transmettre des signaux, acheminer des données ou les présenter aux applications.",
      "Pour analyser un problème, on peut parcourir ces niveaux : le support et le signal, le lien local, l’adressage et le routage, le transport, puis les services utilisés par l’application."
    ],
    bullets: ["1–2 : physique et liaison de données", "3–4 : réseau et transport", "5–7 : session, présentation et application"]
  },
  ip: {
    title: "Les bases de l’adressage IP",
    description: "Une adresse IP identifie une interface réseau dans un contexte donné. Le préfixe indique la partie réseau et aide à distinguer les hôtes.",
    paragraphs: [
      "Par exemple, 192.168.10.25/24 est une notation CIDR : /24 indique la longueur du préfixe. Cette valeur illustre une adresse et n’est associée à aucun laboratoire ici.",
      "Le plan d’adressage dépend du réseau conçu. Il est utile de noter les préfixes, les passerelles et les plages réservées avant de configurer des équipements."
    ],
    bullets: ["Une adresse IPv4 comporte 32 bits", "Le préfixe décrit la partie réseau", "Une adresse seule ne garantit pas la connectivité"]
  },
  topology: {
    title: "Lire une topologie réseau",
    description: "Une topologie représente les équipements d’un réseau et les liaisons qui les relient.",
    paragraphs: [
      "Les icônes de routeurs, commutateurs, serveurs et postes indiquent des rôles possibles. Les traits représentent des liens, pas nécessairement leur configuration ou leur état réel.",
      "Une bonne lecture consiste à repérer les hôtes, les équipements intermédiaires, les frontières entre réseaux et les chemins possibles entre les extrémités."
    ],
    bullets: ["Identifier les équipements et leurs rôles", "Repérer les liaisons et les limites des réseaux", "Ne pas confondre un schéma avec une simulation"]
  }
};

let laboratories = [];
let storageAvailable = true;
let toastTimeout;
let activeLaboratoryId = null;
let topologyEditor;
let activeComputerId = null;
let computerTerminal;
let activeSwitchId = null;
let switchTerminal;
let switchTerminalHistory = [];
let switchTerminalHistoryIndex = 0;
let activeTopologySimulation;
let activeTopologySignature = null;
let terminalSessionStates = {};
let terminalStateSaveTimeout;
let terminalStateStorageFailed = false;
let terminalLines = [];
let terminalHistory = [];
let terminalHistoryIndex = 0;
let terminalCommandController = null;
let switchTerminalLines = [];
let renderedSimulationEventCount = 0;
let lastRenderedSimulationEventId = null;

function showToast(message) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.hidden = false;
  toastTimeout = window.setTimeout(() => {
    toast.hidden = true;
  }, 4500);
}

function readLaboratories() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isLaboratory)) {
      throw new Error("Les données enregistrées ne correspondent pas au format attendu.");
    }

    return parsed;
  } catch (error) {
    storageAvailable = false;
    showToast(`Impossible de lire les laboratoires enregistrés : ${error.message}`);
    return [];
  }
}

function isLaboratory(value) {
  return value !== null
    && typeof value === "object"
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.createdAt === "string"
    && !Number.isNaN(Date.parse(value.createdAt));
}

function getLaboratoryModifiedTime(laboratory) {
  const updatedAt = Date.parse(laboratory.updatedAt || "");
  return Number.isNaN(updatedAt) ? Date.parse(laboratory.createdAt) : updatedAt;
}

function persistLaboratories(nextLaboratories) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLaboratories));
    return true;
  } catch (error) {
    showToast(`Impossible d’enregistrer vos laboratoires dans ce navigateur : ${error.message}`);
    return false;
  }
}

function readTerminalSessionStates() {
  try {
    const stored = window.localStorage.getItem(TERMINAL_STATE_KEY);
    if (stored === null) return {};

    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Le format enregistré n’est pas valide.");
    }
    return parsed;
  } catch (error) {
    showToast(`Impossible de restaurer les terminaux : ${error.message}`);
    return {};
  }
}

function persistTerminalSessionStates() {
  window.clearTimeout(terminalStateSaveTimeout);
  terminalStateSaveTimeout = null;
  try {
    window.localStorage.setItem(TERMINAL_STATE_KEY, JSON.stringify(terminalSessionStates));
    terminalStateStorageFailed = false;
  } catch (error) {
    if (!terminalStateStorageFailed) {
      showToast(`Impossible d’enregistrer l’état des terminaux : ${error.message}`);
    }
    terminalStateStorageFailed = true;
  }
}

function scheduleTerminalSessionSave() {
  window.clearTimeout(terminalStateSaveTimeout);
  terminalStateSaveTimeout = window.setTimeout(
    persistTerminalSessionStates,
    TERMINAL_STATE_SAVE_DELAY_MS,
  );
}

function getTerminalSessionState(deviceId) {
  const laboratoryState = terminalSessionStates[activeLaboratoryId];
  const state = laboratoryState?.[deviceId];
  return state && typeof state === "object" && !Array.isArray(state) ? state : null;
}

function saveTerminalSessionState(deviceId, state) {
  if (!activeLaboratoryId || !deviceId) return;
  const laboratoryState = terminalSessionStates[activeLaboratoryId];
  terminalSessionStates = {
    ...terminalSessionStates,
    [activeLaboratoryId]: {
      ...(laboratoryState && typeof laboratoryState === "object" ? laboratoryState : {}),
      [deviceId]: state,
    },
  };
  scheduleTerminalSessionSave();
}

function restoreTerminalLines(state) {
  if (!Array.isArray(state?.lines)) return [];
  return state.lines
    .filter((line) => line && typeof line.text === "string")
    .map((line) => ({
      text: line.text,
      tone: ["command", "error", "info", "normal", "success"].includes(line.tone) ? line.tone : "normal",
    }));
}

function restoreTerminalHistory(state) {
  return Array.isArray(state?.history)
    ? state.history.filter((command) => typeof command === "string")
    : [];
}

function restoreTerminalHistoryIndex(state, history) {
  return Number.isInteger(state?.historyIndex)
    ? Math.max(0, Math.min(state.historyIndex, history.length))
    : history.length;
}

function restoreTerminalInput(input, state) {
  input.value = typeof state?.inputValue === "string" ? state.inputValue : "";
  const start = Number.isInteger(state?.selectionStart)
    ? Math.max(0, Math.min(state.selectionStart, input.value.length))
    : input.value.length;
  const end = Number.isInteger(state?.selectionEnd)
    ? Math.max(start, Math.min(state.selectionEnd, input.value.length))
    : start;
  input.setSelectionRange(start, end, state?.selectionDirection === "backward" ? "backward" : "forward");
}

function captureTerminalInput(input) {
  return {
    inputValue: input.value,
    selectionStart: input.selectionStart ?? input.value.length,
    selectionEnd: input.selectionEnd ?? input.value.length,
    selectionDirection: input.selectionDirection ?? "none",
  };
}

function getTopologySimulationSignature(topology) {
  return JSON.stringify({
    devices: topology.devices.map(({
      id, name, kind, interfaces, defaultGateway, dnsServer, dhcpEnabled, icmpEnabled, initialTtl, staticRoutes,
    }) => ({ id, name, kind, interfaces, defaultGateway, dnsServer, dhcpEnabled, icmpEnabled, initialTtl, staticRoutes })),
    connections: topology.connections,
  });
}

function addSimulationEventsPlaceholder() {
  const placeholder = document.createElement("li");
  placeholder.className = "console-placeholder";
  placeholder.textContent = "Les échanges simulés apparaîtront ici.";
  simulationEventList.append(placeholder);
}

function resetSimulationEvents() {
  simulationEventList.replaceChildren();
  renderedSimulationEventCount = 0;
  lastRenderedSimulationEventId = null;
  simulationEventCount.textContent = "0 événement";
  addSimulationEventsPlaceholder();
}

function getSimulationEventLayer(event) {
  if (event.details.layer) return event.details.layer;
  if (event.type.startsWith("arp-")) return "ARP";
  if (event.type.startsWith("icmp-")) return "ICMP";
  if (event.type.startsWith("ipv4-")) return "IPv4";
  if (event.type.startsWith("ethernet-frame-") || event.type.startsWith("switch-mac-")) return "L2";
  return "SIM";
}

function renderSimulationEvents(events) {
  const previousLastEvent = events[renderedSimulationEventCount - 1];
  if (
    events.length < renderedSimulationEventCount
    || (renderedSimulationEventCount > 0 && previousLastEvent?.id !== lastRenderedSimulationEventId)
  ) {
    resetSimulationEvents();
  }

  if (events.length === 0) return;
  const newEvents = events.slice(renderedSimulationEventCount);
  if (simulationEventList.firstElementChild?.classList.contains("console-placeholder")) {
    simulationEventList.replaceChildren();
  }
  newEvents.forEach((event) => {
    const item = document.createElement("li");
    item.className = "console-event";
    item.dataset.layer = getSimulationEventLayer(event);

    const time = document.createElement("span");
    time.className = "event-time";
    const timestamp = new Date(event.timestamp);
    time.textContent = Number.isNaN(timestamp.getTime())
      ? "--:--:--"
      : new Intl.DateTimeFormat("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(timestamp);

    const label = document.createElement("span");
    label.className = "event-label";
    label.textContent = event.type.replaceAll("-", " ").toUpperCase();

    const message = document.createElement("span");
    message.className = "event-message";
    message.textContent = event.message;

    item.append(time, label, message);
    simulationEventList.append(item);
  });
  while (simulationEventList.children.length > 100) {
    simulationEventList.firstElementChild.remove();
  }
  renderedSimulationEventCount = events.length;
  lastRenderedSimulationEventId = events.at(-1)?.id ?? null;
  simulationEventCount.textContent = `${events.length} événement${events.length === 1 ? "" : "s"}`;
  simulationEventList.scrollTop = simulationEventList.scrollHeight;
}

function createLabCard(laboratory) {
  const card = document.createElement("article");
  card.className = "lab-card";

  const mark = document.createElement("span");
  mark.className = "lab-card-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 3.75h8M9 3.75v6l-4.1 7.1a2.25 2.25 0 0 0 1.95 3.4h10.3a2.25 2.25 0 0 0 1.95-3.4L15 9.75v-6"/><path d="M8 15h8"/></svg>';

  const copy = document.createElement("span");
  copy.className = "lab-card-copy";
  const name = document.createElement("strong");
  name.textContent = laboratory.name;
  const details = document.createElement("small");
  const modifiedAt = new Date(getLaboratoryModifiedTime(laboratory));
  const deviceCount = Array.isArray(laboratory.topology?.devices) ? laboratory.topology.devices.length : 0;
  const formattedDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(modifiedAt);
  details.textContent = `Modifié le ${formattedDate} · ${deviceCount} équipement${deviceCount === 1 ? "" : "s"}`;
  copy.append(name, details);

  const actions = document.createElement("span");
  actions.className = "lab-card-actions";

  const openButton = document.createElement("button");
  openButton.className = "lab-card-button";
  openButton.type = "button";
  openButton.dataset.openLab = laboratory.id;
  openButton.textContent = "Ouvrir";

  const deleteButton = document.createElement("button");
  deleteButton.className = "lab-card-button danger";
  deleteButton.type = "button";
  deleteButton.dataset.deleteLab = laboratory.id;
  deleteButton.textContent = "Supprimer";
  deleteButton.setAttribute("aria-label", `Supprimer le laboratoire ${laboratory.name}`);

  actions.append(openButton, deleteButton);
  card.append(mark, copy, actions);
  return card;
}

function renderLaboratories() {
  const recentLaboratories = [...laboratories].sort((first, second) =>
    getLaboratoryModifiedTime(second) - getLaboratoryModifiedTime(first));
  labList.replaceChildren(...recentLaboratories.map(createLabCard));
  const hasLaboratories = laboratories.length > 0;
  emptyLabs.hidden = hasLaboratories;
  labList.hidden = !hasLaboratories;
  labCount.textContent = String(laboratories.length);
  labCount.hidden = !hasLaboratories;
  headingLabCount.textContent = String(laboratories.length);
  clearLabsButton.disabled = !hasLaboratories || !storageAvailable;
  document.querySelectorAll("[data-open-create]").forEach((button) => {
    button.disabled = !storageAvailable;
    button.title = storageAvailable ? "" : "Stockage local indisponible";
  });
}

function saveTopology(topology) {
  if (activeComputerId) saveComputerTerminalState();
  if (activeSwitchId) saveSwitchTerminalState();
  const nextLaboratories = laboratories.map((laboratory) =>
    laboratory.id === activeLaboratoryId
      ? { ...laboratory, topology, updatedAt: new Date().toISOString() }
      : laboratory);
  if (nextLaboratories.every((laboratory) => laboratory.id !== activeLaboratoryId)) return false;
  if (!persistLaboratories(nextLaboratories)) return false;
  laboratories = nextLaboratories;
  computerTerminal = null;
  const topologySignature = getTopologySimulationSignature(topology);
  if (!activeTopologySimulation || topologySignature !== activeTopologySignature) {
    activeTopologySimulation = new TopologySimulation(topology);
    activeTopologySignature = topologySignature;
    switchTerminal = null;
    renderSimulationEvents(activeTopologySimulation.engine.events);
  }
  renderLaboratories();
  return true;
}

function closeLaboratoryEditor() {
  if (activeComputerId) saveComputerTerminalState();
  if (activeSwitchId) saveSwitchTerminalState();
  persistTerminalSessionStates();
  activeLaboratoryId = null;
  activeTopologySimulation = null;
  activeTopologySignature = null;
  labEditorRoot.hidden = true;
  content.classList.remove("editor-mode");
  window.location.hash = "#laboratoires";
  document.querySelector("#laboratoires").scrollIntoView({ behavior: "smooth" });
}

function openLaboratoryEditor(laboratory) {
  try {
    activeLaboratoryId = laboratory.id;
    content.classList.add("editor-mode");
    labEditorRoot.hidden = false;
    editorTitle.textContent = laboratory.name;
    topologyEditor.open(laboratory.topology);
    activeTopologySimulation = new TopologySimulation(topologyEditor.topology);
    activeTopologySignature = getTopologySimulationSignature(topologyEditor.topology);
    resetSimulationEvents();
    renderSimulationEvents(activeTopologySimulation.engine.events);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    activeLaboratoryId = null;
    labEditorRoot.hidden = true;
    content.classList.remove("editor-mode");
    showToast(`Impossible d’ouvrir ce laboratoire : ${error.message}`);
  }
}

function closeMobileMenu() {
  if (!menuButton || !sidebar) return;
  sidebar.classList.remove("is-open");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.querySelector(".sr-only").textContent = "Ouvrir la navigation";
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

document.querySelectorAll("[data-open-create]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!storageAvailable) {
      showToast("Le stockage local est indisponible ; un laboratoire ne peut pas être enregistré.");
      return;
    }
    createError.hidden = true;
    createForm.reset();
    openDialog(createDialog);
    document.querySelector("#lab-name").focus();
  });
});

document.querySelector("[data-open-settings]").addEventListener("click", () => {
  openDialog(settingsDialog);
});

document.querySelectorAll("[data-open-resources]").forEach((button) => {
  button.addEventListener("click", () => {
    closeMobileMenu();
    openDialog(resourcesDialog);
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

document.querySelectorAll(".app-dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = new FormData(createForm).get("name").trim();

  if (!name) {
    createError.textContent = "Saisissez un nom pour votre laboratoire.";
    createError.hidden = false;
    document.querySelector("#lab-name").focus();
    return;
  }

  const now = new Date().toISOString();
  const laboratory = {
    id: window.crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    topology: createEmptyTopology()
  };
  const nextLaboratories = [laboratory, ...laboratories];

  if (!persistLaboratories(nextLaboratories)) return;
  laboratories = nextLaboratories;
  renderLaboratories();
  createDialog.close();
  showToast(`Le laboratoire « ${name} » a été enregistré sur cet appareil.`);
  document.querySelector("#laboratoires").scrollIntoView({ behavior: "smooth" });
});

labList.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-lab]");
  if (openButton) {
    const laboratory = laboratories.find((item) => item.id === openButton.dataset.openLab);
    if (laboratory) {
      openLaboratoryEditor(laboratory);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete-lab]");
  if (!deleteButton) return;

  const laboratory = laboratories.find((item) => item.id === deleteButton.dataset.deleteLab);
  if (!laboratory || !window.confirm(`Supprimer le laboratoire « ${laboratory.name} » de cet appareil ?`)) return;

  const nextLaboratories = laboratories.filter((item) => item.id !== laboratory.id);
  if (!persistLaboratories(nextLaboratories)) return;
  laboratories = nextLaboratories;
  renderLaboratories();
  showToast(`Le laboratoire « ${laboratory.name} » a été supprimé de cet appareil.`);
});

clearLabsButton.addEventListener("click", () => {
  if (laboratories.length === 0 || !window.confirm("Supprimer tous les laboratoires enregistrés dans ce navigateur ? Cette action est définitive.")) return;
  if (!persistLaboratories([])) return;
  laboratories = [];
  renderLaboratories();
  showToast("Tous les laboratoires locaux ont été supprimés.");
});

document.querySelectorAll("[data-guide]").forEach((button) => {
  button.addEventListener("click", () => {
    const guide = guides[button.dataset.guide];
    if (!guide) return;

    document.querySelector("#guide-title").textContent = guide.title;
    document.querySelector("#guide-description").textContent = guide.description;
    const content = document.querySelector("#guide-content");
    const paragraphs = guide.paragraphs.map((text) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      return paragraph;
    });
    const list = document.createElement("ul");
    guide.bullets.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      list.append(item);
    });
    content.replaceChildren(...paragraphs, list);
    openDialog(guideDialog);
  });
});

if (menuButton && sidebar) {
  menuButton.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.querySelector(".sr-only").textContent = isOpen
      ? "Fermer la navigation"
      : "Ouvrir la navigation";
  });

  sidebar.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });
}

const navigationLinks = document.querySelectorAll(".nav-link[href], .mobile-nav-link[href]");
function updateNavigation() {
  const currentHash = window.location.hash || "#accueil";
  navigationLinks.forEach((link) => {
    const active = link.getAttribute("href") === currentHash;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("hashchange", updateNavigation);

laboratories = readLaboratories();
terminalSessionStates = readTerminalSessionStates();
topologyEditor = new TopologyEditor(labEditorRoot, saveTopology);
labEditorRoot.addEventListener("editor:close", closeLaboratoryEditor);
labEditorRoot.addEventListener("computer:open", (event) => {
  openComputerManagement(event.detail.deviceId);
});
labEditorRoot.addEventListener("switch:open", (event) => {
  openSwitchManagement(event.detail.deviceId);
});
renderLaboratories();
updateNavigation();

function getActiveComputer() {
  return topologyEditor.topology.devices.find((device) =>
    device.id === activeComputerId && device.kind === "pc");
}

function renderComputerDesktop(device) {
  computerDesktopPanel.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "pc-desktop-summary";

  device.interfaces.forEach((networkInterface) => {
    const card = document.createElement("section");
    card.className = "pc-interface-card";
    const heading = document.createElement("h3");
    heading.textContent = `Interface ${networkInterface.name}`;
    const details = document.createElement("dl");
    const isConnected = topologyEditor.topology.connections.some((connection) =>
      connection.firstInterfaceId === networkInterface.id
      || connection.secondInterfaceId === networkInterface.id);
    const entries = [
      ["Adresse MAC", networkInterface.macAddress],
      ["État", !networkInterface.enabled ? "Désactivée" : isConnected ? "Connectée" : "Déconnectée"],
      ["Adresse IPv4", device.dhcpEnabled
        ? "Non attribuée (DHCP en attente)"
        : networkInterface.ipv4Address || "Non configurée"],
      ["Masque", device.dhcpEnabled ? "Non disponible" : networkInterface.subnetMask || "Non configuré"],
      ["Passerelle", device.dhcpEnabled ? "En attente d’un bail DHCP" : device.defaultGateway || "Aucune"],
    ];
    entries.forEach(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      row.append(term, description);
      details.append(row);
    });
    card.append(heading, details);
    summary.append(card);
  });
  computerDesktopPanel.append(summary);
}

function populateComputerIpForm(device) {
  const networkInterface = device.interfaces[0];
  if (!networkInterface) return;
  computerIpForm.elements.namedItem("ipv4Address").value = networkInterface.ipv4Address || "";
  computerIpForm.elements.namedItem("subnetMask").value = networkInterface.subnetMask || "255.255.255.0";
  computerIpForm.elements.namedItem("defaultGateway").value = device.defaultGateway || "";
  computerIpForm.elements.namedItem("dnsServer").value = device.dnsServer || "";
  computerIpForm.elements.namedItem("dhcpEnabled").checked = device.dhcpEnabled === true;
  computerIpForm.elements.namedItem("icmpEnabled").checked = device.icmpEnabled !== false;
}

function saveComputerTerminalState() {
  if (!activeComputerId) return;
  saveTerminalSessionState(activeComputerId, {
    lines: terminalLines,
    history: terminalHistory,
    historyIndex: terminalHistoryIndex,
    ...captureTerminalInput(computerTerminalInput),
  });
}

function openComputerManagement(deviceId) {
  const device = topologyEditor.topology.devices.find((item) =>
    item.id === deviceId && item.kind === "pc");
  if (!device) return;
  terminalCommandController?.abort();
  terminalCommandController = null;
  activeComputerId = device.id;
  computerTerminal = null;
  const savedState = getTerminalSessionState(device.id);
  terminalLines = restoreTerminalLines(savedState).slice(-500);
  terminalHistory = restoreTerminalHistory(savedState);
  terminalHistoryIndex = restoreTerminalHistoryIndex(savedState, terminalHistory);
  restoreTerminalInput(computerTerminalInput, savedState);
  computerTerminalPrompt.textContent = `${device.name} C:\\>`;
  computerTitle.textContent = device.name;
  renderTerminalOutput();
  computerTerminalStatus.textContent = "Prêt.";
  renderComputerDesktop(device);
  populateComputerIpForm(device);
  computerConfigMessage.textContent = "Le DHCP est prévu pour une étape ultérieure ; aucun serveur DHCP n’est encore simulé.";
  computerConfigMessage.classList.remove("is-error");
  computerDialog.showModal();
  activateComputerTab("desktop");
}

function activateComputerTab(tabName) {
  computerDialog.querySelectorAll("[data-pc-tab]").forEach((button) => {
    const isActive = button.dataset.pcTab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  computerDialog.querySelectorAll("[data-pc-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.pcPanel !== tabName;
  });

  if (tabName === "terminal" && activeComputerId) {
    try {
      if (!computerTerminal) {
        computerTerminal = new ComputerTerminal(topologyEditor.topology, activeComputerId, {
          lineDelayMs: 16,
          pingIntervalMs: 350,
          simulation: activeTopologySimulation,
        });
      }
      computerTerminalForm.querySelector("button").disabled = false;
      computerTerminalInput.focus();
    } catch (error) {
      computerTerminalPanel.textContent = `Impossible d’initialiser le terminal : ${error.message}`;
      computerTerminalForm.querySelector("button").disabled = true;
    }
  }
}

computerDialog.querySelectorAll("[data-pc-tab]").forEach((button) => {
  button.addEventListener("click", () => activateComputerTab(button.dataset.pcTab));
});
computerDialog.querySelector("[data-close-computer]").addEventListener("click", () => computerDialog.close());
computerDialog.addEventListener("close", () => {
  saveComputerTerminalState();
  terminalCommandController?.abort();
  terminalCommandController = null;
  activeComputerId = null;
  computerTerminal = null;
  terminalLines = [];
  terminalHistory = [];
  terminalHistoryIndex = 0;
  computerTerminalInput.value = "";
});

function getActiveSwitch() {
  return topologyEditor.topology.devices.find((device) =>
    device.id === activeSwitchId && device.kind === "switch");
}

function saveSwitchTerminalState() {
  if (!activeSwitchId) return;
  const savedState = getTerminalSessionState(activeSwitchId);
  saveTerminalSessionState(activeSwitchId, {
    lines: switchTerminalLines,
    history: switchTerminalHistory,
    historyIndex: switchTerminalHistoryIndex,
    ...captureTerminalInput(switchTerminalInput),
    cliState: switchTerminal?.snapshot() ?? savedState?.cliState ?? null,
  });
}

function openSwitchManagement(deviceId) {
  const device = topologyEditor.topology.devices.find((item) =>
    item.id === deviceId && item.kind === "switch");
  if (!device) return;
  activeSwitchId = device.id;
  switchTerminal = null;
  const savedState = getTerminalSessionState(device.id);
  switchTerminalLines = restoreTerminalLines(savedState);
  switchTerminalHistory = restoreTerminalHistory(savedState);
  switchTerminalHistoryIndex = restoreTerminalHistoryIndex(savedState, switchTerminalHistory);
  restoreTerminalInput(switchTerminalInput, savedState);
  switchTitle.textContent = device.name;
  renderSwitchTerminalOutput();
  try {
    if (savedState?.cliState) ensureSwitchTerminal().restoreState(savedState.cliState);
    switchTerminalStatus.textContent = `Mode ${switchTerminal?.mode ?? "user"}.`;
  } catch (error) {
    appendSwitchTerminalLine(`Impossible de restaurer le mode CLI : ${error.message}`, "error");
    switchTerminalStatus.textContent = "Mode utilisateur.";
  }
  switchTerminalPrompt.textContent = switchTerminal?.prompt ?? `${device.switchConfig.running.hostname}>`;
  switchDialog.showModal();
  switchTerminalInput.focus();
  restoreTerminalInput(switchTerminalInput, getTerminalSessionState(activeSwitchId));
}

function renderSwitchTerminalOutput() {
  const fragment = document.createDocumentFragment();
  switchTerminalLines.forEach(({ text, tone }) => {
    const line = document.createElement("span");
    line.className = `pc-terminal-line is-${tone}`;
    line.textContent = text;
    fragment.append(line);
  });
  switchTerminalOutput.replaceChildren(fragment);
  switchTerminalOutput.scrollTop = switchTerminalOutput.scrollHeight;
}

function appendSwitchTerminalLine(text, tone = "normal") {
  switchTerminalLines.push({ text, tone });
  const line = document.createElement("span");
  line.className = `pc-terminal-line is-${tone}`;
  line.textContent = text;
  switchTerminalOutput.append(line);
  switchTerminalOutput.scrollTop = switchTerminalOutput.scrollHeight;
  saveSwitchTerminalState();
}

function ensureSwitchTerminal() {
  const device = getActiveSwitch();
  if (!device || !activeTopologySimulation) throw new Error("Commutateur indisponible.");
  const runtime = activeTopologySimulation.getSwitch(device.id);
  if (!runtime) throw new Error("Le moteur n’a pas créé ce commutateur.");
  if (!switchTerminal) {
    switchTerminal = new SwitchTerminal(runtime, {
      onConfigurationChange: (configuration) =>
        topologyEditor.updateSwitchConfiguration(
          device.id,
          activeTopologySimulation.serializeSwitchConfiguration(device.id, configuration),
        ),
    });
  }
  return switchTerminal;
}

switchTerminalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = switchTerminalInput.value.trim();
  if (!command || !activeSwitchId) return;
  try {
    const terminal = ensureSwitchTerminal();
    appendSwitchTerminalLine(`${terminal.prompt} ${command}`, "command");
    switchTerminalHistory.push(command);
    switchTerminalHistoryIndex = switchTerminalHistory.length;
    switchTerminalInput.value = "";
    const result = terminal.execute(command);
    if (result.output) {
      result.output.split("\n").forEach((line) => appendSwitchTerminalLine(line, result.tone));
    }
    switchTerminalPrompt.textContent = terminal.prompt;
    switchTerminalStatus.textContent = `Mode ${terminal.mode}.`;
    renderSimulationEvents(activeTopologySimulation.engine.events);
  } catch (error) {
    appendSwitchTerminalLine(`Erreur : ${error instanceof Error ? error.message : "échec inconnu"}`, "error");
    switchTerminalStatus.textContent = "Erreur de commande.";
  }
  saveSwitchTerminalState();
  switchTerminalInput.focus();
});

switchTerminalInput.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    if (!switchTerminal) return;
    switchTerminalInput.value = switchTerminal.complete(switchTerminalInput.value);
    switchTerminalInput.setSelectionRange(
      switchTerminalInput.value.length,
      switchTerminalInput.value.length,
    );
    saveSwitchTerminalState();
    return;
  }
  if (event.key === "ArrowUp") {
    if (!switchTerminalHistory.length) return;
    event.preventDefault();
    switchTerminalHistoryIndex = Math.max(0, switchTerminalHistoryIndex - 1);
    switchTerminalInput.value = switchTerminalHistory[switchTerminalHistoryIndex];
    saveSwitchTerminalState();
  } else if (event.key === "ArrowDown" && switchTerminalHistoryIndex < switchTerminalHistory.length) {
    event.preventDefault();
    switchTerminalHistoryIndex += 1;
    switchTerminalInput.value = switchTerminalHistory[switchTerminalHistoryIndex] || "";
    saveSwitchTerminalState();
  }
});

switchDialog.querySelector("[data-close-switch]").addEventListener("click", () => switchDialog.close());
switchDialog.addEventListener("close", () => {
  saveSwitchTerminalState();
  activeSwitchId = null;
  switchTerminal = null;
  switchTerminalLines = [];
  switchTerminalHistory = [];
  switchTerminalHistoryIndex = 0;
  switchTerminalInput.value = "";
});

computerIpForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!activeComputerId) return;
  terminalCommandController?.abort();
  const values = new FormData(computerIpForm);
  try {
    topologyEditor.updateComputerConfiguration(activeComputerId, {
      ipv4Address: values.get("ipv4Address").trim(),
      subnetMask: values.get("subnetMask").trim(),
      defaultGateway: values.get("defaultGateway").trim(),
      dnsServer: values.get("dnsServer").trim(),
      dhcpEnabled: values.get("dhcpEnabled") === "on",
      icmpEnabled: values.get("icmpEnabled") === "on",
    });
    const device = getActiveComputer();
    if (device) {
      renderComputerDesktop(device);
      populateComputerIpForm(device);
    }
    computerTerminal = null;
    computerConfigMessage.textContent = "Configuration IP enregistrée dans le laboratoire.";
    computerConfigMessage.classList.remove("is-error");
  } catch (error) {
    computerConfigMessage.textContent = `Configuration invalide : ${error.message}`;
    computerConfigMessage.classList.add("is-error");
  }
});

function renderTerminalOutput() {
  const fragment = document.createDocumentFragment();
  terminalLines.forEach(({ text, tone }) => {
    const line = document.createElement("span");
    line.className = `pc-terminal-line is-${tone}`;
    line.textContent = text;
    fragment.append(line);
  });
  computerTerminalPanel.replaceChildren(fragment);
  computerTerminalPanel.scrollTop = computerTerminalPanel.scrollHeight;
}

function appendTerminalLine(text, tone = "normal") {
  terminalLines.push({ text, tone });
  if (terminalLines.length > 500) terminalLines.splice(0, terminalLines.length - 500);
  renderTerminalOutput();
  saveComputerTerminalState();
}

computerTerminalInput.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === "c" && terminalCommandController) {
    event.preventDefault();
    computerTerminalStatus.textContent = "Interruption demandée…";
    terminalCommandController.abort();
    return;
  }
  if (event.key === "ArrowUp") {
    if (!terminalHistory.length) return;
    event.preventDefault();
    terminalHistoryIndex = Math.max(0, terminalHistoryIndex - 1);
    computerTerminalInput.value = terminalHistory[terminalHistoryIndex];
    saveComputerTerminalState();
  } else if (event.key === "ArrowDown" && terminalHistoryIndex < terminalHistory.length) {
    event.preventDefault();
    terminalHistoryIndex += 1;
    computerTerminalInput.value = terminalHistory[terminalHistoryIndex] || "";
    saveComputerTerminalState();
  }
});

computerTerminalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const command = computerTerminalInput.value.trim();
  if (!command || !activeComputerId || !computerTerminal || terminalCommandController) return;
  const computerId = activeComputerId;
  const terminal = computerTerminal;
  const controller = new AbortController();
  terminalCommandController = controller;
  terminalHistory.push(command);
  terminalHistoryIndex = terminalHistory.length;
  appendTerminalLine(`${computerTitle.textContent} C:\\> ${command}`, "command");
  computerTerminalInput.value = "";
  saveComputerTerminalState();
  computerTerminalForm.querySelector("button").disabled = true;
  computerTerminalStatus.textContent = "Commande en cours…";
  computerTerminalInput.focus();

  try {
    for await (const output of terminal.execute(command, controller.signal)) {
      if (activeComputerId !== computerId) break;
      if (output.kind === "clear") {
        terminalLines = [];
        renderTerminalOutput();
        saveComputerTerminalState();
      } else if (output.kind === "line") {
        appendTerminalLine(output.text, output.tone || "normal");
      } else {
        renderSimulationEvents(terminal.events);
      }
    }
    if (controller.signal.aborted && activeComputerId === computerId) {
      appendTerminalLine("^C", "info");
    }
  } catch (error) {
    if (activeComputerId === computerId) {
      appendTerminalLine(`Erreur : ${error instanceof Error ? error.message : "échec inconnu"}`, "error");
    }
  } finally {
    if (terminalCommandController === controller) {
      terminalCommandController = null;
      computerTerminalForm.querySelector("button").disabled = false;
      computerTerminalStatus.textContent = "Prêt.";
      if (activeComputerId === computerId) computerTerminalInput.focus();
    }
  }
});

["input", "keyup", "click", "select"].forEach((eventName) => {
  computerTerminalInput.addEventListener(eventName, saveComputerTerminalState);
  switchTerminalInput.addEventListener(eventName, saveSwitchTerminalState);
});

window.addEventListener("pagehide", () => {
  if (activeComputerId) saveComputerTerminalState();
  if (activeSwitchId) saveSwitchTerminalState();
  persistTerminalSessionStates();
});

initializePwa({
  isSimulationBusy: () => terminalCommandController !== null,
});

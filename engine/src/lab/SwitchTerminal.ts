import type { InterfaceId } from "../domain/NetworkInterface.js";
import {
  defaultSwitchPortConfiguration,
  isReservedVlanId,
  type SwitchPersistentConfiguration,
  type SwitchPortConfiguration,
  type SwitchRunningConfiguration,
} from "../protocols/ethernet/SwitchConfiguration.js";
import type { EthernetSwitch, MacTableEntry } from "../protocols/ethernet/EthernetSwitch.js";

export type SwitchTerminalMode =
  | "user"
  | "privileged"
  | "global"
  | "interface"
  | "vlan"
  | "line";

export interface SwitchTerminalResult {
  readonly output: string;
  readonly tone: "normal" | "error" | "info";
}

export interface SwitchTerminalState {
  readonly mode: SwitchTerminalMode;
  readonly selectedPorts: readonly string[];
  readonly selectedVlanId: number | null;
  readonly authenticated: boolean;
  readonly awaitingPassword: boolean;
}

export interface SwitchTerminalOptions {
  readonly onConfigurationChange: (configuration: SwitchPersistentConfiguration) => void;
}

function isSwitchTerminalMode(value: unknown): value is SwitchTerminalMode {
  return ["user", "privileged", "global", "interface", "vlan", "line"].includes(String(value));
}

function resolvePrefix(
  token: string,
  choices: readonly string[],
): { value?: string; error?: string } {
  const normalized = token.toLowerCase();
  const matches = choices.filter((choice) => choice.startsWith(normalized));
  if (matches.length === 1) return { value: matches[0] };
  if (matches.length > 1) return { error: "% Ambiguous command." };
  return { error: "% Invalid input detected at '^' marker." };
}

function parseVlanId(value: string): number | undefined {
  const vlanId = Number(value);
  return Number.isInteger(vlanId) && vlanId >= 1 && vlanId <= 4094 ? vlanId : undefined;
}

function parseAllowedVlans(value: string): readonly number[] | "all" | undefined {
  if (value.toLowerCase() === "all") return "all";
  const vlanIds = value.split(",").map((part) => parseVlanId(part));
  return vlanIds.length > 0 && vlanIds.every((vlanId) => vlanId !== undefined)
    ? [...new Set(vlanIds as number[])]
    : undefined;
}

function parseInput(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function clonePort(
  port: SwitchPortConfiguration,
  changes: Partial<SwitchPortConfiguration>,
): SwitchPortConfiguration {
  return { ...port, ...changes };
}

export class SwitchTerminal {
  mode: SwitchTerminalMode = "user";
  private selectedPorts: readonly InterfaceId[] = [];
  private selectedVlanId: number | null = null;
  private authenticated = false;
  private awaitingPassword = false;

  constructor(
    private readonly networkSwitch: EthernetSwitch,
    private readonly options: SwitchTerminalOptions,
  ) {
  }

  get prompt(): string {
    const hostname = this.networkSwitch.runningConfiguration.hostname;
    if (
      this.mode === "user"
      && !this.authenticated
      && this.networkSwitch.runningConfiguration.consoleLine.loginRequired
    ) return "Password:";
    switch (this.mode) {
      case "user": return `${hostname}>`;
      case "privileged": return `${hostname}#`;
      case "global": return `${hostname}(config)#`;
      case "interface":
        return `${hostname}(config-${this.selectedPorts.length > 1 ? "if-range" : "if"})#`;
      case "vlan": return `${hostname}(config-vlan)#`;
      case "line": return `${hostname}(config-line)#`;
    }
  }

  execute(commandLine: string): SwitchTerminalResult {
    const tokens = parseInput(commandLine);
    if (tokens.length === 0) return { output: "", tone: "normal" };
    if (this.awaitingPassword) return this.authenticate(tokens.join(""));
    if (this.mode === "user" && !this.authenticated && this.networkSwitch.runningConfiguration.consoleLine.loginRequired) {
      this.awaitingPassword = true;
      return this.authenticate(tokens.join(""));
    }

    if (tokens.includes("?")) return { output: this.helpText(), tone: "info" };
    const first = resolvePrefix(tokens[0], this.commandsForMode());
    if (first.error) return { output: first.error, tone: "error" };

    switch (this.mode) {
      case "user": return this.executeUser(first.value!, tokens.slice(1));
      case "privileged": return this.executePrivileged(first.value!, tokens.slice(1));
      case "global": return this.executeGlobal(first.value!, tokens.slice(1));
      case "interface": return this.executeInterface(first.value!, tokens.slice(1));
      case "vlan": return this.executeVlan(first.value!, tokens.slice(1));
      case "line": return this.executeLine(first.value!, tokens.slice(1));
    }
  }

  complete(line: string): string {
    const candidates = this.completions();
    const normalized = line.trimStart().toLowerCase();
    const matches = candidates.filter((command) => command.startsWith(normalized));
    if (matches.length !== 1) return line;
    return `${matches[0]} `;
  }

  snapshot(): SwitchTerminalState {
    return {
      mode: this.mode,
      selectedPorts: this.selectedPorts.map((port) => this.networkSwitch.getPortName(port)),
      selectedVlanId: this.selectedVlanId,
      authenticated: this.authenticated,
      awaitingPassword: this.awaitingPassword,
    };
  }

  restoreState(state: unknown): void {
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("L’état enregistré du terminal est invalide.");
    }

    const value = state as Record<string, unknown>;
    const mode = value.mode;
    const savedPorts = value.selectedPorts;
    const selectedVlanId = value.selectedVlanId;
    const portIds = this.networkSwitch.portInterfaceIds;
    const selectedPorts = Array.isArray(savedPorts)
      ? savedPorts.map((port) => {
          if (typeof port !== "string") return undefined;
          return portIds.find((portId) => this.networkSwitch.getPortName(portId) === port)
            ?? (portIds.includes(port) ? port : undefined);
        })
      : null;
    const vlanExists = selectedVlanId === null
      || (typeof selectedVlanId === "number"
        && Number.isInteger(selectedVlanId)
        && this.networkSwitch.runningConfiguration.vlans.some((vlan) => vlan.id === selectedVlanId));
    if (
      !isSwitchTerminalMode(mode)
      || !Array.isArray(selectedPorts)
      || !selectedPorts.every((port): port is InterfaceId => typeof port === "string")
      || !vlanExists
      || typeof value.authenticated !== "boolean"
      || typeof value.awaitingPassword !== "boolean"
      || (mode === "interface" && selectedPorts.length === 0)
      || (mode === "vlan" && (selectedVlanId === null || selectedVlanId === undefined))
      || (value.awaitingPassword && (mode !== "user" || value.authenticated))
    ) {
      throw new Error("L’état enregistré du terminal ne correspond plus à la configuration du commutateur.");
    }

    this.mode = mode;
    this.selectedPorts = selectedPorts;
    this.selectedVlanId = selectedVlanId as number | null;
    this.authenticated = value.authenticated;
    this.awaitingPassword = value.awaitingPassword;
  }

  private authenticate(password: string): SwitchTerminalResult {
    const configuredPassword = this.networkSwitch.runningConfiguration.consoleLine.password;
    this.awaitingPassword = false;
    if (!configuredPassword || password !== configuredPassword) {
      this.authenticated = false;
      return { output: "Password incorrect.", tone: "error" };
    }
    this.authenticated = true;
    return { output: "Authentification réussie.", tone: "info" };
  }

  private commandsForMode(): readonly string[] {
    switch (this.mode) {
      case "user": return ["enable", "exit", "show"];
      case "privileged": return ["clear", "configure", "copy", "disable", "exit", "ping", "reload", "show", "write"];
      case "global": return ["default", "end", "exit", "hostname", "interface", "line", "mac", "no", "spanning-tree", "vlan"];
      case "interface": return ["default", "description", "end", "exit", "duplex", "no", "shutdown", "speed", "spanning-tree", "switchport"];
      case "vlan": return ["end", "exit", "name"];
      case "line": return ["end", "exit", "login", "no", "password"];
    }
  }

  private executeUser(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "enable") {
      if (args.length > 0) return this.incomplete();
      this.mode = "privileged";
      return this.info("Mode privilégié activé.");
    }
    if (command === "exit") return { output: "Session du terminal terminée.", tone: "info" };
    if (command === "show") return this.show(args);
    return this.invalid();
  }

  private executePrivileged(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "disable") {
      this.mode = "user";
      return this.info("Retour au mode utilisateur.");
    }
    if (command === "exit") {
      this.mode = "user";
      return this.info("Retour au mode utilisateur.");
    }
    if (command === "configure") {
      const target = resolvePrefix(args[0] || "", ["terminal"]);
      if (target.error) return args.length === 0 ? this.incomplete() : this.error(target.error);
      if (args.length !== 1) return this.invalid();
      this.mode = "global";
      return this.info("Mode de configuration globale activé.");
    }
    if (command === "show") return this.show(args);
    if (command === "write") {
      const memory = resolvePrefix(args[0] || "", ["memory"]);
      if (memory.error) return args.length === 0 ? this.incomplete() : this.error(memory.error);
      if (args.length !== 1) return this.invalid();
      this.saveStartup();
      return this.info("Building configuration... [OK]");
    }
    if (command === "copy") {
      const source = resolvePrefix(args[0] || "", ["running-config"]);
      const destination = resolvePrefix(args[1] || "", ["startup-config"]);
      if (source.error || destination.error) return args.length < 2 ? this.incomplete() : this.invalid();
      if (args.length !== 2) return this.invalid();
      this.saveStartup();
      return this.info("[OK] Configuration running sauvegardée au démarrage.");
    }
    if (command === "clear") return this.clear(args);
    if (command === "reload") {
      if (args.length !== 0) return this.invalid();
      this.networkSwitch.reloadStartupConfiguration();
      this.options.onConfigurationChange(structuredClone(this.networkSwitch.persistentConfiguration));
      this.mode = "user";
      this.selectedPorts = [];
      this.selectedVlanId = null;
      this.authenticated = false;
      return this.info("Le commutateur a été rechargé avec sa configuration de démarrage.");
    }
    if (command === "ping") {
      return this.error("% Ping indisponible : aucune interface de gestion IPv4 n’est configurée sur ce commutateur.");
    }
    return this.invalid();
  }

  private executeGlobal(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "end") {
      this.mode = "privileged";
      return this.info("Retour au mode privilégié.");
    }
    if (command === "exit") {
      this.mode = "privileged";
      return this.info("Retour au mode privilégié.");
    }
    if (command === "hostname") {
      if (args.length !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/.test(args[0])) return this.invalid();
      return this.changeRunning({ ...this.networkSwitch.runningConfiguration, hostname: args[0] });
    }
    if (command === "interface") {
      const ports = this.resolvePorts(args);
      if (!ports) return this.error("% Interface inconnue ou plage de ports invalide.");
      this.selectedPorts = ports;
      this.mode = "interface";
      return this.info(`Configuration de ${ports.map((id) => this.networkSwitch.getPortName(id)).join(", ")}.`);
    }
    if (command === "vlan") {
      if (args.length !== 1) return this.incomplete();
      const vlanId = parseVlanId(args[0]);
      if (!vlanId) return this.error("% VLAN ID must be between 1 and 4094.");
      if (!this.networkSwitch.runningConfiguration.vlans.some((vlan) => vlan.id === vlanId)) {
        const result = this.changeRunning({
          ...this.networkSwitch.runningConfiguration,
          vlans: [...this.networkSwitch.runningConfiguration.vlans, {
            id: vlanId,
            name: `VLAN${vlanId}`,
            status: "active",
          }],
        });
        if (result.tone !== "error") {
          this.selectedVlanId = vlanId;
          this.mode = "vlan";
        }
        return result;
      }
      this.selectedVlanId = vlanId;
      this.mode = "vlan";
      return this.info(`Configuration du VLAN ${vlanId}.`);
    }
    if (command === "line") {
      if (args.length !== 2 || args[0].toLowerCase() !== "console" || args[1] !== "0") {
        return this.error("% Seule la ligne console 0 est prise en charge.");
      }
      this.mode = "line";
      return this.info("Configuration de la ligne console 0.");
    }
    if (command === "no") return this.executeGlobalNo(args);
    if (command === "default") {
      const target = resolvePrefix(args[0] || "", ["interface"]);
      if (target.error || args.length < 2) return this.incomplete();
      const ports = this.resolvePorts(args.slice(1));
      if (!ports) return this.error("% Interface inconnue.");
      const running = this.networkSwitch.runningConfiguration;
      const nextPorts = { ...running.ports };
      for (const id of ports) nextPorts[id] = defaultSwitchPortConfiguration();
      return this.changeRunning({ ...running, ports: nextPorts });
    }
    if (command === "mac") return this.addStaticMac(args);
    if (command === "spanning-tree") return this.stpUnavailable();
    return this.invalid();
  }

  private executeGlobalNo(args: readonly string[]): SwitchTerminalResult {
    if (args[0]?.toLowerCase() === "mac") return this.removeStaticMac(args.slice(1));
    const subcommand = resolvePrefix(args[0] || "", ["vlan"]);
    if (subcommand.error) return this.error(subcommand.error);
    if (args.length !== 2) return this.incomplete();
    const vlanId = parseVlanId(args[1]);
    if (!vlanId) return this.error("% VLAN ID must be between 1 and 4094.");
    if (vlanId === 1) return this.error("% VLAN 1 cannot be removed.");
    if (isReservedVlanId(vlanId)) return this.error("% Reserved VLANs 1002-1005 cannot be removed.");
    const running = this.networkSwitch.runningConfiguration;
    if (!running.vlans.some((vlan) => vlan.id === vlanId)) return this.error("% VLAN does not exist.");
    const vlans = running.vlans.filter((vlan) => vlan.id !== vlanId);
    const ports: Record<string, SwitchPortConfiguration> = {};
    Object.entries(running.ports).forEach(([id, port]) => {
      ports[id] = {
        ...port,
        accessVlan: port.accessVlan === vlanId ? 1 : port.accessVlan,
        nativeVlan: port.nativeVlan === vlanId ? 1 : port.nativeVlan,
        allowedVlans: port.allowedVlans === "all"
          ? "all" as const
          : port.allowedVlans.filter((allowedId) => allowedId !== vlanId),
      };
    });
    const result = this.changeRunning({
      ...running,
      vlans,
      ports,
      staticMacEntries: running.staticMacEntries.filter((entry) => entry.vlanId !== vlanId),
    });
    if (result.tone !== "error") this.networkSwitch.removeVlanMacEntries(vlanId);
    return result;
  }

  private executeInterface(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "end") {
      this.mode = "privileged";
      return this.info("Retour au mode privilégié.");
    }
    if (command === "exit") {
      this.mode = "global";
      this.selectedPorts = [];
      return this.info("Retour au mode de configuration globale.");
    }
    if (command === "spanning-tree") return this.stpUnavailable();
    if (command === "default") {
      const target = resolvePrefix(args[0] || "", ["interface"]);
      if (target.error || args.length !== 1) return this.incomplete();
      const running = this.networkSwitch.runningConfiguration;
      const ports = { ...running.ports };
      for (const id of this.selectedPorts) ports[id] = defaultSwitchPortConfiguration();
      return this.changeRunning({ ...running, ports });
    }
    if (command === "description") {
      const description = args.join(" ");
      return this.updateSelectedPorts({ description });
    }
    if (command === "shutdown") {
      if (args.length) return this.invalid();
      return this.updateSelectedPorts({ enabled: false });
    }
    if (command === "speed") {
      return this.error("% Port speed is stored for display only; link-speed simulation is unavailable.");
    }
    if (command === "duplex") {
      return this.error("% Duplex behavior is not modeled; configuration unchanged.");
    }
    if (command === "no") return this.executeInterfaceNo(args);
    if (command === "switchport") return this.configureSwitchport(args);
    return this.invalid();
  }

  private executeInterfaceNo(args: readonly string[]): SwitchTerminalResult {
    const subcommand = resolvePrefix(args[0] || "", ["shutdown", "switchport"]);
    if (subcommand.error) return this.error(subcommand.error);
    if (subcommand.value === "shutdown" && args.length === 1) {
      return this.updateSelectedPorts({ enabled: true });
    }
    if (subcommand.value === "switchport") return this.configureSwitchport(args.slice(1), true);
    return this.incomplete();
  }

  private configureSwitchport(args: readonly string[], negate = false): SwitchTerminalResult {
    const first = resolvePrefix(args[0] || "", ["access", "mode", "trunk"]);
    if (first.error) return this.error(first.error);
    if (first.value === "mode") {
      const mode = resolvePrefix(args[1] || "", ["access", "trunk"]);
      if (mode.error || args.length !== 2) return this.incomplete();
      return this.updateSelectedPorts({ mode: mode.value as SwitchPortConfiguration["mode"] });
    }
    if (first.value === "access") {
      const field = resolvePrefix(args[1] || "", ["vlan"]);
      if (field.error || args.length > 3) return this.incomplete();
      if (negate) return this.updateSelectedPorts({ accessVlan: 1 });
      if (args.length !== 3) return this.incomplete();
      const vlanId = parseVlanId(args[2]);
      if (!vlanId || !this.networkSwitch.runningConfiguration.vlans.some((vlan) => vlan.id === vlanId)) {
        return this.error("% Access VLAN does not exist.");
      }
      return this.updateSelectedPorts({ accessVlan: vlanId });
    }
    if (first.value === "trunk") {
      const field = resolvePrefix(args[1] || "", ["allowed", "native"]);
      if (field.error) return this.error(field.error);
      if (field.value === "native") {
        const vlanKeyword = resolvePrefix(args[2] || "", ["vlan"]);
        if (vlanKeyword.error || args.length > 4) return this.incomplete();
        if (negate) return this.updateSelectedPorts({ nativeVlan: 1 });
        if (args.length !== 4) return this.incomplete();
        const vlanId = parseVlanId(args[3]);
        if (!vlanId || !this.networkSwitch.runningConfiguration.vlans.some((vlan) => vlan.id === vlanId)) {
          return this.error("% Native VLAN does not exist.");
        }
        return this.updateSelectedPorts({ nativeVlan: vlanId });
      }
      const allowedKeyword = resolvePrefix(args[2] || "", ["vlan"]);
      if (allowedKeyword.error || args.length < 4) return this.incomplete();
      if (negate) return this.updateSelectedPorts({ allowedVlans: "all" });
      let action: "set" | "add" | "remove" = "set";
      let listIndex = 3;
      if (["add", "remove"].includes(args[listIndex]?.toLowerCase())) {
        action = args[listIndex].toLowerCase() as "add" | "remove";
        listIndex += 1;
      }
      if (args.length !== listIndex + 1) return this.incomplete();
      const allowed = parseAllowedVlans(args[listIndex]);
      if (!allowed) return this.error("% Invalid VLAN list.");
      if (allowed !== "all" && allowed.some((id) =>
        !this.networkSwitch.runningConfiguration.vlans.some((vlan) => vlan.id === id))) {
        return this.error("% One or more VLANs do not exist.");
      }
      if (action === "set" || allowed === "all") return this.updateSelectedPorts({ allowedVlans: allowed });
      return this.updateSelectedPortsForEach((port) => {
        const current = port.allowedVlans === "all"
          ? this.networkSwitch.runningConfiguration.vlans.map((vlan) => vlan.id)
          : [...port.allowedVlans];
        const updated = action === "add"
          ? [...new Set([...current, ...allowed])]
          : current.filter((id) => !allowed.includes(id));
        return { ...port, allowedVlans: updated };
      });
    }
    return this.invalid();
  }

  private executeVlan(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "end") {
      this.mode = "privileged";
      this.selectedVlanId = null;
      return this.info("Retour au mode privilégié.");
    }
    if (command === "exit") {
      this.mode = "global";
      this.selectedVlanId = null;
      return this.info("Retour au mode de configuration globale.");
    }
    if (command === "name") {
      if (!this.selectedVlanId || args.length !== 1 || !/^[\w.-]{1,32}$/.test(args[0])) return this.invalid();
      if (isReservedVlanId(this.selectedVlanId)) {
        return this.error("% Reserved VLAN names cannot be changed.");
      }
      const running = this.networkSwitch.runningConfiguration;
      return this.changeRunning({
        ...running,
        vlans: running.vlans.map((vlan) =>
          vlan.id === this.selectedVlanId ? { ...vlan, name: args[0] } : vlan),
      });
    }
    return this.invalid();
  }

  private executeLine(command: string, args: readonly string[]): SwitchTerminalResult {
    if (command === "end") {
      this.mode = "privileged";
      return this.info("Retour au mode privilégié.");
    }
    if (command === "exit") {
      this.mode = "global";
      return this.info("Retour au mode de configuration globale.");
    }
    if (command === "login") {
      if (args.length) return this.invalid();
      return this.changeRunning({
        ...this.networkSwitch.runningConfiguration,
        consoleLine: { ...this.networkSwitch.runningConfiguration.consoleLine, loginRequired: true },
      });
    }
    if (command === "password") {
      if (args.length !== 1) return this.incomplete();
      return this.changeRunning({
        ...this.networkSwitch.runningConfiguration,
        consoleLine: { ...this.networkSwitch.runningConfiguration.consoleLine, password: args[0] },
      });
    }
    if (command === "no") {
      const target = resolvePrefix(args[0] || "", ["login", "password"]);
      if (target.error) return this.error(target.error);
      if (args.length !== 1) return this.invalid();
      const line = this.networkSwitch.runningConfiguration.consoleLine;
      return this.changeRunning({
        ...this.networkSwitch.runningConfiguration,
        consoleLine: target.value === "login"
          ? { ...line, loginRequired: false }
          : { ...line, password: "" },
      });
    }
    return this.invalid();
  }

  private show(args: readonly string[]): SwitchTerminalResult {
    if (args.length === 0) return this.incomplete();
    const first = resolvePrefix(args[0], ["interfaces", "mac", "running-config", "spanning-tree", "startup-config", "version", "vlan"]);
    if (first.error) return this.error(first.error);
    if (first.value === "spanning-tree") return this.stpUnavailable();
    if (first.value === "running-config") {
      return args.length === 1
        ? this.normal(this.renderConfiguration(this.networkSwitch.runningConfiguration))
        : this.invalid();
    }
    if (first.value === "startup-config") {
      if (args.length !== 1) return this.invalid();
      const startup = this.networkSwitch.startupConfiguration;
      return this.normal(startup
        ? this.renderConfiguration(startup)
        : "% Startup-config is not present");
    }
    if (first.value === "version") {
      return args.length === 1
        ? this.normal(`PocketNet Virtual Switch Software\n${this.networkSwitch.runningConfiguration.hostname} · moteur Layer 2 pédagogique`)
        : this.invalid();
    }
    if (first.value === "vlan") {
      const brief = resolvePrefix(args[1] || "", ["brief"]);
      if (brief.error || args.length !== 2) return this.incomplete();
      return this.normal(this.renderVlans());
    }
    if (first.value === "interfaces") return this.showInterfaces(args.slice(1));
    if (first.value === "mac") return this.showMacTable(args.slice(1));
    return this.invalid();
  }

  private showInterfaces(args: readonly string[]): SwitchTerminalResult {
    if (args.length === 1) {
      const status = resolvePrefix(args[0], ["status", "trunk"]);
      if (status.error) return this.error(status.error);
      if (status.value === "status") return this.normal(this.renderPortStatus());
      return this.normal(this.renderTrunks());
    }
    if (args.length === 0) return this.normal(this.renderPortStatus());
    return this.invalid();
  }

  private showMacTable(args: readonly string[]): SwitchTerminalResult {
    const first = resolvePrefix(args[0] || "", ["address-table"]);
    if (first.error) return args.length === 0 ? this.incomplete() : this.error(first.error);
    let entries = [...this.networkSwitch.macTableSnapshot];
    if (args.length > 1) {
      const filter = resolvePrefix(args[1], ["dynamic", "static"]);
      if (!filter.error) {
        if (args.length !== 2) return this.invalid();
        entries = entries.filter((entry) => entry.type === filter.value);
      }
      else if (args[1].toLowerCase() === "vlan" && args[2]) {
        if (args.length !== 3) return this.invalid();
        const vlanId = parseVlanId(args[2]);
        if (!vlanId) return this.error("% Invalid VLAN.");
        entries = entries.filter((entry) => entry.vlanId === vlanId);
      } else if (args[1].toLowerCase() === "address" && args[2]) {
        if (args.length !== 3 || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(args[2])) return this.invalid();
        entries = entries.filter((entry) => entry.macAddress === args[2].toLowerCase());
      } else {
        return this.error(filter.error);
      }
    }
    return this.normal(this.renderMacTable(entries));
  }

  private clear(args: readonly string[]): SwitchTerminalResult {
    const mac = resolvePrefix(args[0] || "", ["mac"]);
    const table = resolvePrefix(args[1] || "", ["address-table"]);
    const dynamic = resolvePrefix(args[2] || "", ["dynamic"]);
    if (mac.error || table.error || dynamic.error) return this.incomplete();
    let vlanId: number | undefined;
    if (args.length === 5 && args[3].toLowerCase() === "vlan") {
      vlanId = parseVlanId(args[4]);
      if (!vlanId) return this.error("% Invalid VLAN.");
    } else if (args.length !== 3) {
      return this.invalid();
    }
    const removed = this.networkSwitch.clearDynamicMacAddresses(vlanId);
    return this.info(`${removed} dynamic MAC address(es) cleared.`);
  }

  private addStaticMac(args: readonly string[]): SwitchTerminalResult {
    const addressTable = resolvePrefix(args[0] || "", ["address-table"]);
    const staticEntry = resolvePrefix(args[1] || "", ["static"]);
    if (addressTable.error || staticEntry.error) return this.incomplete();
    if (args.length !== 7 || args[3].toLowerCase() !== "vlan" || args[5].toLowerCase() !== "interface") {
      return this.error("% Usage: mac address-table static <mac> vlan <id> interface <port>");
    }
    const vlanId = parseVlanId(args[4]);
    const portIds = this.resolvePorts([args[6]]);
    if (!vlanId || !portIds || portIds.length !== 1) return this.error("% Invalid VLAN or interface.");
    const macAddress = args[2].toLowerCase();
    const running = this.networkSwitch.runningConfiguration;
    return this.changeRunning({
      ...running,
      staticMacEntries: [
        ...running.staticMacEntries.filter((entry) =>
          entry.macAddress !== macAddress || entry.vlanId !== vlanId),
        { macAddress, vlanId, portInterfaceId: portIds[0] },
      ],
    });
  }

  private removeStaticMac(args: readonly string[]): SwitchTerminalResult {
    const addressTable = resolvePrefix(args[0] || "", ["address-table"]);
    const staticEntry = resolvePrefix(args[1] || "", ["static"]);
    if (addressTable.error || staticEntry.error) return this.incomplete();
    if (args.length !== 7 || args[3].toLowerCase() !== "vlan" || args[5].toLowerCase() !== "interface") {
      return this.error("% Usage: no mac address-table static <mac> vlan <id> interface <port>");
    }
    const vlanId = parseVlanId(args[4]);
    const portIds = this.resolvePorts([args[6]]);
    if (!vlanId || !portIds || portIds.length !== 1) return this.error("% Invalid VLAN or interface.");
    const macAddress = args[2].toLowerCase();
    const running = this.networkSwitch.runningConfiguration;
    const entries = running.staticMacEntries.filter((entry) =>
      entry.macAddress !== macAddress
      || entry.vlanId !== vlanId
      || entry.portInterfaceId !== portIds[0]);
    if (entries.length === running.staticMacEntries.length) return this.error("% Static MAC entry not found.");
    return this.changeRunning({ ...running, staticMacEntries: entries });
  }

  private resolvePorts(args: readonly string[]): InterfaceId[] | null {
    if (args.length === 0) return null;
    let range = false;
    let value = args.join("").toLowerCase();
    if (args[0].toLowerCase() === "range") {
      range = true;
      value = args.slice(1).join("").toLowerCase();
    }
    const pieces = value.split("-");
    if (pieces.length > 2 || (range && pieces.length !== 2)) return null;
    const findIndex = (specification: string): number => {
      const exact = this.networkSwitch.portInterfaceIds.findIndex((id) =>
        id.toLowerCase() === specification
        || this.networkSwitch.getPortName(id).toLowerCase() === specification);
      if (exact >= 0) return exact;
      const match = specification.match(/(?:port|ethernet|fastethernet|gigabitethernet|fa|gi)?(?:0\/)?(\d+)$/);
      return match ? Number(match[1]) - 1 : -1;
    };
    const start = findIndex(pieces[0]);
    if (start < 0 || start >= this.networkSwitch.portInterfaceIds.length) return null;
    if (pieces.length === 1) return [this.networkSwitch.portInterfaceIds[start]];
    const end = findIndex(pieces[1]);
    if (end < start || end >= this.networkSwitch.portInterfaceIds.length) return null;
    return this.networkSwitch.portInterfaceIds.slice(start, end + 1);
  }

  private updateSelectedPorts(changes: Partial<SwitchPortConfiguration>): SwitchTerminalResult {
    return this.updateSelectedPortsForEach((port) => clonePort(port, changes));
  }

  private updateSelectedPortsForEach(
    update: (port: SwitchPortConfiguration) => SwitchPortConfiguration,
  ): SwitchTerminalResult {
    if (this.selectedPorts.length === 0) return this.error("% No interface is selected.");
    const running = this.networkSwitch.runningConfiguration;
    const ports = { ...running.ports };
    for (const id of this.selectedPorts) ports[id] = update(ports[id]);
    return this.changeRunning({ ...running, ports });
  }

  private saveStartup(): void {
    this.networkSwitch.saveStartupConfiguration();
    this.options.onConfigurationChange(structuredClone(this.networkSwitch.persistentConfiguration));
  }

  private changeRunning(running: SwitchRunningConfiguration): SwitchTerminalResult {
    try {
      this.networkSwitch.setRunningConfiguration(running);
      this.options.onConfigurationChange(structuredClone(this.networkSwitch.persistentConfiguration));
      return this.info("Configuration appliquée au commutateur.");
    } catch (error) {
      return this.error(error instanceof Error ? error.message : "Configuration invalide.");
    }
  }

  private renderVlans(): string {
    const rows = [
      "VLAN  Name                             Status    Ports",
      "----  -------------------------------- --------- -------------------------------",
    ];
    [...this.networkSwitch.runningConfiguration.vlans]
      .sort((first, second) => first.id - second.id)
      .forEach((vlan) => {
        const ports = this.networkSwitch.portInterfaceIds
          .filter((id) => {
            const port = this.networkSwitch.getPortConfiguration(id);
            return port.mode === "access" && port.accessVlan === vlan.id;
          })
          .map((id) => this.networkSwitch.getPortName(id))
          .join(", ");
        rows.push(
          `${String(vlan.id).padEnd(5)} ${vlan.name.padEnd(32)} ${vlan.status.padEnd(9)} ${ports}`,
        );
      });
    return rows.join("\n");
  }

  private renderPortStatus(): string {
    const rows = ["Port     Status      Mode   VLAN  Speed  Duplex"];
    for (const id of this.networkSwitch.portInterfaceIds) {
      const port = this.networkSwitch.getPortConfiguration(id);
      const name = this.networkSwitch.getPortName(id);
      const linked = this.networkSwitch.isPortOperational(id);
      rows.push(
        `${name.padEnd(8)} ${(linked ? "connected" : port.enabled ? "notconnect" : "disabled").padEnd(11)} ${port.mode.padEnd(6)} ${String(port.mode === "access" ? port.accessVlan : "trunk").padEnd(5)} ${String(port.speedMbps).padEnd(6)} ${port.duplex}`,
      );
    }
    return rows.join("\n");
  }

  private renderTrunks(): string {
    const trunks = this.networkSwitch.portInterfaceIds.filter((id) =>
      this.networkSwitch.getPortConfiguration(id).mode === "trunk"
      && this.networkSwitch.isPortOperational(id));
    if (trunks.length === 0) return "No operational trunks.";
    return trunks.map((id) => {
      const port = this.networkSwitch.getPortConfiguration(id);
      const allowed = port.allowedVlans === "all"
        ? this.networkSwitch.runningConfiguration.vlans.map((vlan) => vlan.id).join(",")
        : port.allowedVlans.join(",");
      return `${this.networkSwitch.getPortName(id)}  802.1Q  native ${port.nativeVlan}  allowed ${allowed}`;
    }).join("\n");
  }

  private renderMacTable(entries: readonly MacTableEntry[]): string {
    const rows = ["Vlan  Mac Address       Type      Ports"];
    entries.forEach((entry) => rows.push(
      `${String(entry.vlanId).padEnd(5)} ${entry.macAddress.padEnd(17)} ${entry.type.padEnd(9)} ${this.networkSwitch.getPortName(entry.portInterfaceId)}`,
    ));
    return rows.join("\n");
  }

  private renderConfiguration(running: SwitchRunningConfiguration): string {
    const rows = [
      "Building configuration...",
      `hostname ${running.hostname}`,
      "",
      "vlan 1",
      " name default",
    ];
    running.vlans.filter((vlan) => vlan.id !== 1).forEach((vlan) => rows.push(
      `vlan ${vlan.id}`,
      ` name ${vlan.name}`,
    ));
    running.staticMacEntries.forEach((entry) => rows.push(
      `mac address-table static ${entry.macAddress} vlan ${entry.vlanId} interface ${this.networkSwitch.getPortName(entry.portInterfaceId)}`,
    ));
    for (const id of this.networkSwitch.portInterfaceIds) {
      const port = running.ports[id];
      if (!port) continue;
      rows.push(
        `interface ${this.networkSwitch.getPortName(id)}`,
        port.description ? ` description ${port.description}` : "",
        port.enabled ? "" : " shutdown",
        ` switchport mode ${port.mode}`,
        port.mode === "access" ? ` switchport access vlan ${port.accessVlan}` : "",
        port.mode === "trunk" ? ` switchport trunk native vlan ${port.nativeVlan}` : "",
        port.mode === "trunk"
          ? ` switchport trunk allowed vlan ${port.allowedVlans === "all" ? "all" : port.allowedVlans.join(",")}`
          : "",
        ` speed ${port.speedMbps}`,
        ` duplex ${port.duplex}`,
      );
    }
    rows.push(
      "line console 0",
      running.consoleLine.password ? ` password ${running.consoleLine.password}` : "",
      running.consoleLine.loginRequired ? " login" : " no login",
      "end",
    );
    return rows.filter((row) => row !== "").join("\n");
  }

  private helpText(): string {
    return this.commandsForMode().join("  ");
  }

  private completions(): readonly string[] {
    const base = this.commandsForMode();
    if (this.mode === "user") {
      return [...base, "show version", "show vlan brief", "show interfaces status", "show mac address-table"];
    }
    if (this.mode === "privileged") {
      return [
        ...base,
        "configure terminal",
        "show running-config",
        "show startup-config",
        "show vlan brief",
        "show interfaces status",
        "show interfaces trunk",
        "show mac address-table",
        "clear mac address-table dynamic",
        "write memory",
        "copy running-config startup-config",
      ];
    }
    if (this.mode === "global") {
      return [...base, "interface range", ...this.networkSwitch.portInterfaceIds.map((id) =>
        `interface ${this.networkSwitch.getPortName(id)}`)];
    }
    if (this.mode === "interface") {
      return [
        ...base,
        "switchport mode access",
        "switchport mode trunk",
        "switchport access vlan",
        "switchport trunk native vlan",
        "switchport trunk allowed vlan",
        "no shutdown",
      ];
    }
    return base;
  }

  private incomplete(): SwitchTerminalResult {
    return this.error("% Incomplete command.");
  }

  private invalid(): SwitchTerminalResult {
    return this.error("% Invalid input detected at '^' marker.");
  }

  private stpUnavailable(): SwitchTerminalResult {
    return this.error("% STP is not implemented. This command makes no configuration changes.");
  }

  private error(output: string): SwitchTerminalResult {
    return { output, tone: "error" };
  }

  private info(output: string): SwitchTerminalResult {
    return { output, tone: "info" };
  }

  private normal(output: string): SwitchTerminalResult {
    return { output, tone: "normal" };
  }
}

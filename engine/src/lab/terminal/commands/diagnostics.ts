import { normalizeIPv4Address } from "../../../protocols/ipv4/address.js";
import type { TerminalCommandDefinition } from "../types.js";
import { line, writeLines } from "../output.js";

const arp: TerminalCommandDefinition = {
  name: "arp",
  syntax: "arp -a | arp -d <adresse IPv4>",
  description: "Affiche ou supprime une entrée du cache ARP simulé.",
  async *execute(context, arguments_, signal) {
    const option = arguments_[0]?.toLowerCase();
    if (option === "-a" && arguments_.length === 1) {
      const entries = context.simulation.getArpEntries(context.deviceId);
      const lines = ["Interface : cache ARP"];
      if (!entries.length) {
        lines.push("Aucune entrée ARP apprise pour le moment.");
      } else {
        lines.push("Adresse Internet       Adresse physique      Type");
        entries.forEach((entry) => lines.push(
          `${entry.ipAddress.padEnd(22)} ${entry.macAddress.padEnd(21)} dynamique`,
        ));
      }
      yield* writeLines(context, lines, signal);
      return;
    }
    if (option === "-d" && arguments_.length === 2) {
      let address: string;
      try {
        address = normalizeIPv4Address(arguments_[1]);
      } catch (error) {
        yield line(`Adresse IPv4 invalide : ${error instanceof Error ? error.message : "format non reconnu"}`, "error");
        return;
      }
      const deleted = context.simulation.clearArpEntry(context.deviceId, address);
      yield line(
        deleted
          ? `Entrée ARP ${address} supprimée.`
          : `Aucune entrée ARP pour ${address}.`,
        deleted ? "success" : "info",
      );
      return;
    }
    yield line("Syntaxe : arp -a | arp -d <adresse IPv4>", "error");
  },
};

const netstat: TerminalCommandDefinition = {
  name: "netstat",
  syntax: "netstat [-an]",
  description: "Indique l’état des connexions de transport simulées.",
  async *execute(context, arguments_, signal) {
    if (arguments_.length && !(arguments_.length === 1 && arguments_[0].toLowerCase() === "-an")) {
      yield line("Syntaxe : netstat [-an]", "error");
      return;
    }
    yield* writeLines(context, [
      arguments_.length ? "Connexions actives (adresses numériques)" : "Connexions actives",
      "Proto   Adresse locale   Adresse distante   État",
      "Aucune connexion TCP/UDP : les protocoles de transport ne sont pas simulés.",
    ], signal, "info");
  },
};

const route: TerminalCommandDefinition = {
  name: "route",
  syntax: "route print",
  description: "Affiche les routes connectées et la passerelle configurée.",
  async *execute(context, arguments_, signal) {
    if (arguments_.length !== 1 || arguments_[0].toLowerCase() !== "print") {
      yield line(
        arguments_[0]?.toLowerCase() === "add" || arguments_[0]?.toLowerCase() === "delete"
          ? "La modification des routes n’est pas encore simulée. Seule la commande « route print » est disponible."
          : "Syntaxe : route print",
        "error",
      );
      return;
    }
    const routes = context.simulation.getRouteEntries(context.deviceId);
    if (!routes.length) {
      yield line("Aucune route IPv4 active : configurez une interface réseau.", "info");
      return;
    }
    const lines = [
      "Table de routage IPv4",
      "Destination      Masque           Passerelle       Interface       Métrique",
    ];
    routes.forEach((entry) => lines.push(
      `${entry.destination.padEnd(17)}${entry.netmask.padEnd(17)}${entry.gateway.padEnd(17)}${entry.interfaceName.padEnd(16)}${entry.metric}`,
    ));
    yield* writeLines(context, lines, signal);
  },
};

const nslookup: TerminalCommandDefinition = {
  name: "nslookup",
  syntax: "nslookup <nom>",
  description: "Le service DNS simulé n’est pas encore disponible.",
  async *execute(_context, arguments_, signal) {
    if (arguments_.length !== 1) {
      yield line("Syntaxe : nslookup <nom>", "error");
      return;
    }
    yield line("Échec de la requête : aucun serveur DNS n’est simulé dans PocketNet.", "error");
    if (!signal.aborted) yield line(`Nom demandé : ${arguments_[0]}`, "info");
  },
};

export function createDiagnosticCommands(): readonly TerminalCommandDefinition[] {
  return [arp, netstat, route, nslookup];
}

import type { TerminalCommandDefinition, TerminalCommandContext } from "../types.js";
import { connectedInterfaceIds, line, writeLines } from "../output.js";

function ipConfiguration(context: TerminalCommandContext, showAll: boolean): string[] {
  const connected = connectedInterfaceIds(context);
  const lines = [
    "Configuration IP PocketNet",
    "",
  ];
  context.computer.interfaces.forEach((networkInterface) => {
    const isConnected = connected.has(networkInterface.id);
    lines.push(
      `Carte Ethernet ${networkInterface.name} :`,
      `   Description . . . . . . . . . . . : ${context.computer.name} ${networkInterface.name}`,
      `   Adresse physique . . . . . . . . . : ${networkInterface.macAddress}`,
      `   Adresse IPv4 . . . . . . . . . . : ${
        context.computer.dhcpEnabled
          ? "Non attribuée"
          : networkInterface.ipv4Address || "Non configurée"
      }`,
      `   Masque de sous-réseau . . . . . . : ${
        context.computer.dhcpEnabled
          ? "Non disponible"
          : networkInterface.subnetMask || "Non configuré"
      }`,
      `   Passerelle par défaut . . . . . . : ${
        context.computer.dhcpEnabled
          ? "En attente d’un bail DHCP"
          : context.computer.defaultGateway || "Aucune"
      }`,
      `   État du média . . . . . . . . . . : ${
        !networkInterface.enabled ? "Désactivé" : isConnected ? "Connecté" : "Déconnecté"
      }`,
    );
    if (showAll) {
      lines.push(
        `   DHCP activé . . . . . . . . . . . : ${
          context.computer.dhcpEnabled ? "Oui (aucun serveur simulé)" : "Non"
        }`,
        `   Serveur DNS . . . . . . . . . . . : ${
          context.computer.dhcpEnabled
            ? "En attente d’un bail DHCP"
            : context.computer.dnsServer || "Aucun"
        }`,
      );
    }
    lines.push("");
  });
  return lines;
}

export function createSystemCommands(
  commandDefinitions: readonly TerminalCommandDefinition[],
): readonly TerminalCommandDefinition[] {
  const hostname: TerminalCommandDefinition = {
    name: "hostname",
    syntax: "hostname",
    description: "Affiche le nom de cet ordinateur.",
    async *execute(context, arguments_, signal) {
      if (arguments_.length) {
        yield line("Syntaxe : hostname", "error");
        return;
      }
      yield* writeLines(context, [context.computer.name], signal);
    },
  };
  const ipconfig: TerminalCommandDefinition = {
    name: "ipconfig",
    syntax: "ipconfig [/all | /flushdns | /release | /renew]",
    description: "Affiche la configuration IP ou l’état des services associés.",
    async *execute(context, arguments_, signal) {
      const option = arguments_[0]?.toLowerCase();
      if (!option) {
        yield* writeLines(context, ipConfiguration(context, false), signal);
        return;
      }
      if (arguments_.length !== 1) {
        yield line("Syntaxe : ipconfig [/all | /flushdns | /release | /renew]", "error");
        return;
      }
      if (option === "/all") {
        yield* writeLines(context, ipConfiguration(context, true), signal);
        return;
      }
      if (option === "/flushdns") {
        yield line("Le cache DNS n’est pas implémenté dans cette simulation ; aucune entrée n’a été modifiée.", "info");
        return;
      }
      if (option === "/release" || option === "/renew") {
        const action = option === "/release" ? "libérer" : "renouveler";
        yield line(
          context.computer.dhcpEnabled
            ? `Impossible de ${action} le bail : aucun serveur DHCP n’est présent dans cette topologie.`
            : `DHCP n’est pas activé sur ${context.computer.name}.`,
          "error",
        );
        return;
      }
      yield line("Option inconnue. Syntaxe : ipconfig [/all | /flushdns | /release | /renew]", "error");
    },
  };
  const getmac: TerminalCommandDefinition = {
    name: "getmac",
    syntax: "getmac",
    description: "Affiche les adresses MAC des interfaces de cet ordinateur.",
    async *execute(context, arguments_, signal) {
      if (arguments_.length) {
        yield line("Syntaxe : getmac", "error");
        return;
      }
      const connected = connectedInterfaceIds(context);
      const lines = ["Adresse physique      Nom du transport"];
      context.computer.interfaces.forEach((networkInterface) => {
        lines.push(
          `${networkInterface.macAddress}    ${networkInterface.name} (${
            connected.has(networkInterface.id) ? "connecté" : "déconnecté"
          })`,
        );
      });
      yield* writeLines(context, lines, signal);
    },
  };
  const help: TerminalCommandDefinition = {
    name: "help",
    syntax: "help",
    description: "Affiche les commandes disponibles et leurs limites.",
    async *execute(context, arguments_, signal) {
      if (arguments_.length) {
        yield line("Syntaxe : help", "error");
        return;
      }
      const lines = ["Commandes PocketNet :"];
      commandDefinitions.forEach((command) => {
        lines.push(`  ${command.syntax.padEnd(30)} ${command.description}`);
      });
      yield* writeLines(context, lines, signal);
    },
  };
  const clear: TerminalCommandDefinition = {
    name: "cls",
    syntax: "cls",
    description: "Efface l’affichage du terminal.",
    async *execute(_context, arguments_) {
      if (arguments_.length) {
        yield line("Syntaxe : cls", "error");
        return;
      }
      yield { kind: "clear" };
    },
  };
  const version: TerminalCommandDefinition = {
    name: "ver",
    syntax: "ver",
    description: "Affiche la version du moteur PocketNet.",
    async *execute(context, arguments_, signal) {
      if (arguments_.length) {
        yield line("Syntaxe : ver", "error");
        return;
      }
      yield* writeLines(context, ["PocketNet Network Simulator version 0.1.0"], signal, "info");
    },
  };
  return [hostname, ipconfig, getmac, help, clear, version];
}

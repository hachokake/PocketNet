import { line, wait } from "../output.js";
function isBlockingFailure(events) {
    return events.some((event) => event.type === "interface-down"
        || event.type === "icmp-destination-unreachable"
        || event.type === "icmp-time-exceeded"
        || event.type === "duplicate-ip-address");
}
function parsePingArguments(arguments_) {
    let count = 4;
    let continuous = false;
    let countSpecified = false;
    let initialTtl;
    let ttlSpecified = false;
    let index = 0;
    while (index < arguments_.length && arguments_[index].startsWith("-")) {
        const option = arguments_[index].toLowerCase();
        if (option === "-n" && !countSpecified && !continuous) {
            const requestedCount = Number(arguments_[index + 1]);
            if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 1000) {
                return "Syntaxe : ping [-n <nombre 1-1000> | -t] [-i <TTL 1-255>] <adresse IPv4>";
            }
            count = requestedCount;
            countSpecified = true;
            index += 2;
            continue;
        }
        if (option === "-t" && !continuous && !countSpecified) {
            continuous = true;
            count = Number.POSITIVE_INFINITY;
            index += 1;
            continue;
        }
        if (option === "-i" && !ttlSpecified) {
            const requestedTtl = Number(arguments_[index + 1]);
            if (!Number.isInteger(requestedTtl) || requestedTtl < 1 || requestedTtl > 255) {
                return "Syntaxe : ping [-n <nombre 1-1000> | -t] [-i <TTL 1-255>] <adresse IPv4>";
            }
            initialTtl = requestedTtl;
            ttlSpecified = true;
            index += 2;
            continue;
        }
        return "Syntaxe : ping [-n <nombre 1-1000> | -t] [-i <TTL 1-255>] <adresse IPv4>";
    }
    if (arguments_.length - index !== 1) {
        return "Syntaxe : ping [-n <nombre 1-1000> | -t] [-i <TTL 1-255>] <adresse IPv4>";
    }
    return {
        destinationIp: arguments_[index],
        count,
        continuous,
        ...(initialTtl === undefined ? {} : { initialTtl }),
    };
}
const ping = {
    name: "ping",
    syntax: "ping [-n <nombre> | -t] [-i <TTL>] <adresse IPv4>",
    description: "Envoie des requêtes ICMP via la topologie simulée.",
    async *execute(context, arguments_, signal) {
        const parsed = parsePingArguments(arguments_);
        if (typeof parsed === "string") {
            yield line(parsed, "error");
            return;
        }
        yield line(`Envoi d’une requête vers ${parsed.destinationIp} avec 32 octets de données :`, "info");
        let sent = 0;
        let received = 0;
        while (sent < parsed.count && !signal.aborted) {
            const result = context.simulation.ping(context.deviceId, parsed.destinationIp, parsed.initialTtl);
            sent += 1;
            if (result.events.length)
                yield { kind: "events", events: result.events };
            if (result.success && result.responseTtl !== undefined) {
                received += 1;
                yield line(`Réponse de ${result.destinationIp} : octets=32 temps=simulation TTL=${result.responseTtl}`, "success");
            }
            else if (result.success) {
                yield line("Réponse ICMP invalide : le paquet reçu ne contient pas de TTL.", "error");
            }
            else {
                yield line(`Délai d’attente dépassé : ${result.message}`, "error");
            }
            if (parsed.continuous && !result.success && isBlockingFailure(result.events))
                break;
            if (sent < parsed.count && !(await wait(context.pingIntervalMs, signal)))
                break;
        }
        if (!signal.aborted) {
            yield line("");
            yield line(`Statistiques Ping pour ${parsed.destinationIp} :`, "info");
            yield line(`Paquets envoyés = ${sent}, reçus = ${received}, perdus = ${sent - received}`);
        }
        else {
            yield line(`Paquets envoyés = ${sent}, reçus = ${received}, perdus = ${sent - received}`, "info");
        }
    },
};
const tracert = {
    name: "tracert",
    syntax: "tracert [-d] <adresse IPv4>",
    description: "Suit les réponses TTL-expired des routeurs réellement présents.",
    async *execute(context, arguments_, signal) {
        let destinationIp;
        let suppressNameResolution = false;
        if (arguments_.length === 1) {
            destinationIp = arguments_[0];
        }
        else if (arguments_.length === 2 && arguments_[0].toLowerCase() === "-d") {
            suppressNameResolution = true;
            destinationIp = arguments_[1];
        }
        if (!destinationIp) {
            yield line("Syntaxe : tracert [-d] <adresse IPv4>", "error");
            return;
        }
        if (!suppressNameResolution) {
            yield line("La résolution des noms DNS n’est pas disponible ; les sauts seront affichés par adresse IP.", "info");
        }
        yield line(`Détermination de l’itinéraire vers ${destinationIp} :`, "info");
        for (let ttl = 1; ttl <= 30 && !signal.aborted; ttl += 1) {
            const result = context.simulation.traceProbe(context.deviceId, destinationIp, ttl);
            if (result.events.length)
                yield { kind: "events", events: result.events };
            if (result.responseType === "time-exceeded" && result.responseIp) {
                yield line(`${String(ttl).padStart(2)}    réponse TTL-expired    ${result.responseIp}`, "info");
            }
            else if (result.success) {
                yield line(`${String(ttl).padStart(2)}    destination atteinte    ${result.responseIp ?? destinationIp}`, "success");
                yield line("Itinéraire terminé.");
                return;
            }
            else {
                yield line(`${String(ttl).padStart(2)}    * * *    ${result.message}`, "error");
                return;
            }
            if (!(await wait(context.pingIntervalMs, signal)))
                return;
        }
        if (!signal.aborted)
            yield line("Limite de 30 sauts atteinte.", "error");
    },
};
export function createNetworkCommands() {
    return [ping, tracert];
}

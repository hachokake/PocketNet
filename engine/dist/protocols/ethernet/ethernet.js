export const DEFAULT_IPV4_TTL = 128;
export function validateIPv4Ttl(ttl) {
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 255) {
        throw new Error("Le TTL IPv4 doit être un entier compris entre 1 et 255.");
    }
    return ttl;
}

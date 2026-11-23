import { SimulationError } from "../../domain/SimulationError.js";
export function normalizeIPv4Address(address) {
    const octets = address.split(".");
    if (octets.length !== 4
        || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) {
        throw new SimulationError("invalid-ipv4-address", `Adresse IPv4 invalide : ${address}.`);
    }
    return octets.map(Number).join(".");
}
function addressToNumber(address) {
    return normalizeIPv4Address(address)
        .split(".")
        .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}
function maskToNumber(mask) {
    const value = addressToNumber(mask);
    const inverted = (~value) >>> 0;
    if (((inverted + 1) & inverted) !== 0) {
        throw new SimulationError("invalid-subnet-mask", `Masque de sous-réseau non contigu : ${mask}.`);
    }
    return value;
}
function numberToAddress(value) {
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}
export function validateIPv4Configuration(configuration) {
    const address = normalizeIPv4Address(configuration.address);
    const subnetMask = normalizeIPv4Address(configuration.subnetMask);
    maskToNumber(subnetMask);
    return { address, subnetMask };
}
export function getNetworkAddress(address, subnetMask) {
    const mask = maskToNumber(subnetMask);
    return numberToAddress((addressToNumber(address) & mask) >>> 0);
}
export function getSubnetPrefixLength(subnetMask) {
    return maskToNumber(subnetMask).toString(2).replace(/0/g, "").length;
}
export function isSameSubnet(firstAddress, secondAddress, subnetMask) {
    const mask = maskToNumber(subnetMask);
    return (addressToNumber(firstAddress) & mask) === (addressToNumber(secondAddress) & mask);
}

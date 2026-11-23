import { SimulationError } from "../../domain/SimulationError.js";

export interface IPv4Configuration {
  readonly address: string;
  readonly subnetMask: string;
}

export function normalizeIPv4Address(address: string): string {
  const octets = address.split(".");
  if (
    octets.length !== 4
    || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    throw new SimulationError("invalid-ipv4-address", `Adresse IPv4 invalide : ${address}.`);
  }
  return octets.map(Number).join(".");
}

function addressToNumber(address: string): number {
  return normalizeIPv4Address(address)
    .split(".")
    .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function maskToNumber(mask: string): number {
  const value = addressToNumber(mask);
  const inverted = (~value) >>> 0;
  if (((inverted + 1) & inverted) !== 0) {
    throw new SimulationError("invalid-subnet-mask", `Masque de sous-réseau non contigu : ${mask}.`);
  }
  return value;
}

function numberToAddress(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function validateIPv4Configuration(configuration: IPv4Configuration): IPv4Configuration {
  const address = normalizeIPv4Address(configuration.address);
  const subnetMask = normalizeIPv4Address(configuration.subnetMask);
  maskToNumber(subnetMask);
  return { address, subnetMask };
}

export function getNetworkAddress(address: string, subnetMask: string): string {
  const mask = maskToNumber(subnetMask);
  return numberToAddress((addressToNumber(address) & mask) >>> 0);
}

export function getSubnetPrefixLength(subnetMask: string): number {
  return maskToNumber(subnetMask).toString(2).replace(/0/g, "").length;
}

export function isSameSubnet(
  firstAddress: string,
  secondAddress: string,
  subnetMask: string,
): boolean {
  const mask = maskToNumber(subnetMask);
  return (addressToNumber(firstAddress) & mask) === (addressToNumber(secondAddress) & mask);
}

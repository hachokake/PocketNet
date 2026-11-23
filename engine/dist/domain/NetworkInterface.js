export class NetworkInterface {
    id;
    deviceId;
    name;
    macAddress;
    constructor(id, deviceId, name, macAddress) {
        this.id = id;
        this.deviceId = deviceId;
        this.name = name;
        this.macAddress = macAddress;
    }
}

export class Packet {
    id;
    sourceInterfaceId;
    destinationInterfaceId;
    payload;
    createdAt;
    constructor(options) {
        this.id = options.id;
        this.sourceInterfaceId = options.sourceInterfaceId;
        this.destinationInterfaceId = options.destinationInterfaceId;
        this.payload = new Uint8Array(options.payload);
        this.createdAt = options.createdAt;
    }
}

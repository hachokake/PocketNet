export class NetworkConnection {
    id;
    firstInterfaceId;
    secondInterfaceId;
    constructor(id, firstInterfaceId, secondInterfaceId) {
        this.id = id;
        this.firstInterfaceId = firstInterfaceId;
        this.secondInterfaceId = secondInterfaceId;
    }
    includesInterface(interfaceId) {
        return this.firstInterfaceId === interfaceId
            || this.secondInterfaceId === interfaceId;
    }
}

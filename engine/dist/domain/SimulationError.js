export class SimulationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "SimulationError";
    }
}

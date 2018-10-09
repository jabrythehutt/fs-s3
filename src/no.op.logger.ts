import {Logger} from "./logger";

export class NoOpLogger implements Logger {
    debug(message: string): void {
    }

    error(message: string): void {
    }

    info(message: string): void {
    }

}

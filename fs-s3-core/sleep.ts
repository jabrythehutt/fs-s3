export function sleep(period: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, period));
}
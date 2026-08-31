/** Single injectable clock seam for timestamps and future time-based rules. */
let source: () => Date = () => new Date();
export const now = () => source();
export function setClockForTests(next?: () => Date): void { source = next ?? (() => new Date()); }

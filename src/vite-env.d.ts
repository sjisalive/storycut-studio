/// <reference types="vite/client" />
declare module 'gifenc' {
  export function GIFEncoder(): { writeFrame(index: Uint8Array, w: number, h: number, opts?: any): void; finish(): void; bytes(): Uint8Array };
  export function quantize(rgba: Uint8ClampedArray | Uint8Array, maxColors: number, opts?: any): number[][];
  export function applyPalette(rgba: Uint8ClampedArray | Uint8Array, palette: number[][], format?: string): Uint8Array;
}

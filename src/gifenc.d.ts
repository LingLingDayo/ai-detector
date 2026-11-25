declare module "gifenc" {
  export function quantize(data: Uint8ClampedArray, maxColors: number): number[][];
  export function applyPalette(data: Uint8ClampedArray, palette: number[][]): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(data: Uint8Array, width: number, height: number, options: { palette?: number[][]; delay: number; repeat?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}

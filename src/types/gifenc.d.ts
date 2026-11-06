/** gifenc 未随包提供类型声明，这里按官方 README 与 dist 导出补最小可用签名 */
declare module "gifenc" {
    export type RGB = [number, number, number];

    export interface FrameOptions {
        palette?: RGB[];
        /** 帧停留时间，单位毫秒 */
        delay?: number;
        /** 循环次数，0 为无限循环，-1 为不写循环扩展 */
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        colorDepth?: number;
        first?: boolean;
    }

    export interface GIFEncoderInstance {
        writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void;
        finish(): void;
        bytes(): Uint8Array;
        bytesView(): Uint8Array;
        reset(): void;
    }

    export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance;

    export function quantize(
        rgba: Uint8Array | Uint8ClampedArray,
        maxColors: number,
        options?: { format?: "rgb565" | "rgb444" | "rgba4444"; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaColor?: number; clearAlphaThreshold?: number }
    ): RGB[];

    export function applyPalette(
        rgba: Uint8Array | Uint8ClampedArray,
        palette: RGB[],
        format?: "rgb565" | "rgb444" | "rgba4444"
    ): Uint8Array;
}

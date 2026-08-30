declare module "jpeg-js" {
  export interface RawImageData {
    width: number;
    height: number;
    data: Uint8Array;
    comments?: string[];
  }
  export interface DecodeOptions {
    useTArray?: boolean;
    colorTransform?: boolean;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
    maxResolutionInMP?: number;
    maxMemoryUsageInMB?: number;
  }
  export function decode(data: Uint8Array | Buffer, opts?: DecodeOptions): RawImageData;
  export function encode(
    imgData: { data: Uint8Array | Buffer; width: number; height: number },
    quality?: number
  ): { data: Uint8Array; width: number; height: number };
  const _default: { decode: typeof decode; encode: typeof encode };
  export default _default;
}

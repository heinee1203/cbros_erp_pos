/**
 * Minimal ambient types for `dom-to-image-more`. The package ships JS only.
 *
 * Only the methods we actually call are typed. Add to this if other call sites
 * need toJpeg / toCanvas / toSvg / toPixelData later.
 */
declare module "dom-to-image-more" {
  export interface DomToImageOptions {
    /** CSS background color, default "transparent" */
    bgcolor?: string;
    /** Output width in px (used with style.transform for retina capture) */
    width?: number;
    /** Output height in px */
    height?: number;
    /** Inline styles applied to the cloned root before serialization */
    style?: Partial<CSSStyleDeclaration> | Record<string, string>;
    /** JPEG/PNG quality 0..1 */
    quality?: number;
    /** Optional filter — return false to drop the node from the clone */
    filter?: (node: Node) => boolean;
    /** Hook to mutate cloned nodes before rendering */
    adjustClonedNode?: (node: Node, clonedNode: Node, isAfter?: boolean) => void;
    /** Allow extra options the typings don't yet cover */
    [key: string]: unknown;
  }

  export function toBlob(node: HTMLElement, options?: DomToImageOptions): Promise<Blob>;
  export function toPng(node: HTMLElement, options?: DomToImageOptions): Promise<string>;
  export function toJpeg(node: HTMLElement, options?: DomToImageOptions): Promise<string>;
  export function toSvg(node: HTMLElement, options?: DomToImageOptions): Promise<string>;
  export function toCanvas(node: HTMLElement, options?: DomToImageOptions): Promise<HTMLCanvasElement>;

  const domtoimage: {
    toBlob: typeof toBlob;
    toPng: typeof toPng;
    toJpeg: typeof toJpeg;
    toSvg: typeof toSvg;
    toCanvas: typeof toCanvas;
  };
  export default domtoimage;
}

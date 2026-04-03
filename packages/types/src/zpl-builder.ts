/**
 * ZPL Builder — generates ZPL II command strings for Zebra thermal printers.
 * All positions/sizes are in DOTS. At 8 dpmm (203 DPI): 1mm = 8 dots.
 *
 * Usage:
 *   const zpl = new ZplBuilder({ widthMm: 50, heightMm: 30, dpmm: 8 })
 *     .startLabel()
 *     .text(2, 2, "Brake Pad Set", { fontHeight: 30, fontWidth: 30 })
 *     .barcode128(2, 12, "BP-12345", { height: 60 })
 *     .endLabel()
 *     .build();
 */

export interface ZplLabelConfig {
  /** Label width in mm */
  widthMm: number;
  /** Label height in mm */
  heightMm: number;
  /** Dots per mm — 8 = 203dpi, 12 = 300dpi */
  dpmm: number;
  /** Print darkness 0-30 */
  darkness?: number;
  /** Print speed 2-14 (inches/sec) */
  speed?: number;
  /** Print quantity */
  quantity?: number;
}

export class ZplBuilder {
  private commands: string[] = [];
  private config: ZplLabelConfig;

  constructor(config: ZplLabelConfig) {
    this.config = config;
  }

  /** Convert mm to dots */
  private mm(value: number): number {
    return Math.round(value * this.config.dpmm);
  }

  /** Start a new label */
  startLabel(): this {
    this.commands.push("^XA");
    this.commands.push("^CI28"); // UTF-8 encoding

    const widthDots = this.mm(this.config.widthMm);
    const heightDots = this.mm(this.config.heightMm);
    this.commands.push(`^PW${widthDots}`);
    this.commands.push(`^LL${heightDots}`);

    if (this.config.darkness !== undefined) {
      this.commands.push(`~SD${this.config.darkness}`);
    }
    if (this.config.speed !== undefined) {
      this.commands.push(`^PR${this.config.speed}`);
    }
    return this;
  }

  /** End the label and set print quantity */
  endLabel(): this {
    const qty = this.config.quantity ?? 1;
    this.commands.push(`^PQ${qty}`);
    this.commands.push("^XZ");
    return this;
  }

  /** Add text field */
  text(
    xMm: number,
    yMm: number,
    text: string,
    options?: {
      fontHeight?: number;
      fontWidth?: number;
      font?: string;
      orientation?: "N" | "R" | "I" | "B";
      maxWidth?: number; // mm — for field block (word wrap)
      maxLines?: number;
      alignment?: "L" | "C" | "R" | "J";
    },
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const fh = options?.fontHeight ?? 30;
    const fw = options?.fontWidth ?? 30;
    const font = options?.font ?? "0";
    const orient = options?.orientation ?? "N";

    this.commands.push(`^FO${x},${y}`);
    this.commands.push(`^A${font}${orient},${fh},${fw}`);

    if (options?.maxWidth) {
      const mw = this.mm(options.maxWidth);
      const ml = options?.maxLines ?? 1;
      const align = options?.alignment ?? "L";
      this.commands.push(`^FB${mw},${ml},0,${align},0`);
    }

    const escaped = text.replace(/\^/g, "\\^").replace(/~/g, "\\~");
    this.commands.push(`^FD${escaped}^FS`);
    return this;
  }

  /** Add Code 128 barcode */
  barcode128(
    xMm: number,
    yMm: number,
    data: string,
    options?: {
      height?: number;
      moduleWidth?: number;
      showText?: boolean;
      orientation?: "N" | "R" | "I" | "B";
    },
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const h = options?.height ?? 80;
    const mw = options?.moduleWidth ?? 2;
    const showTxt = (options?.showText ?? true) ? "Y" : "N";
    const orient = options?.orientation ?? "N";

    this.commands.push(`^FO${x},${y}`);
    this.commands.push(`^BY${mw}`);
    this.commands.push(`^BC${orient},${h},${showTxt},N,N`);
    this.commands.push(`^FD${data}^FS`);
    return this;
  }

  /** Add EAN-13 barcode (for 12-13 digit numeric barcodes) */
  ean13(
    xMm: number,
    yMm: number,
    data: string,
    options?: {
      height?: number;
      moduleWidth?: number;
      showText?: boolean;
      orientation?: "N" | "R" | "I" | "B";
    },
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const h = options?.height ?? 80;
    const mw = options?.moduleWidth ?? 2;
    const showTxt = (options?.showText ?? true) ? "Y" : "N";
    const orient = options?.orientation ?? "N";

    // EAN-13: pass only first 12 digits — printer calculates check digit
    const eanData = data.slice(0, 12);

    this.commands.push(`^FO${x},${y}`);
    this.commands.push(`^BY${mw}`);
    this.commands.push(`^BE${orient},${h},${showTxt},N`);
    this.commands.push(`^FD${eanData}^FS`);
    return this;
  }

  /** Add UPC-A barcode (for 11-12 digit numeric barcodes) */
  upcA(
    xMm: number,
    yMm: number,
    data: string,
    options?: {
      height?: number;
      moduleWidth?: number;
      showText?: boolean;
      orientation?: "N" | "R" | "I" | "B";
    },
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const h = options?.height ?? 80;
    const mw = options?.moduleWidth ?? 2;
    const showTxt = (options?.showText ?? true) ? "Y" : "N";
    const orient = options?.orientation ?? "N";

    this.commands.push(`^FO${x},${y}`);
    this.commands.push(`^BY${mw}`);
    this.commands.push(`^BU${orient},${h},${showTxt},N,Y`);
    this.commands.push(`^FD${data}^FS`);
    return this;
  }

  /** Add QR Code */
  qrCode(
    xMm: number,
    yMm: number,
    data: string,
    options?: {
      magnification?: number;
      errorCorrection?: "H" | "Q" | "M" | "L";
    },
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const mag = options?.magnification ?? 4;
    const ec = options?.errorCorrection ?? "M";

    this.commands.push(`^FO${x},${y}`);
    this.commands.push(`^BQN,2,${mag}`);
    this.commands.push(`^FDMM,A${ec}${data}^FS`);
    return this;
  }

  /** Add horizontal line / divider */
  line(xMm: number, yMm: number, widthMm: number, thickness?: number): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const w = this.mm(widthMm);
    const t = thickness ?? 2;

    this.commands.push(`^FO${x},${y}^GB${w},${t},${t}^FS`);
    return this;
  }

  /** Add box / rectangle */
  box(
    xMm: number,
    yMm: number,
    widthMm: number,
    heightMm: number,
    borderThickness?: number,
  ): this {
    const x = this.mm(xMm);
    const y = this.mm(yMm);
    const w = this.mm(widthMm);
    const h = this.mm(heightMm);
    const t = borderThickness ?? 2;

    this.commands.push(`^FO${x},${y}^GB${w},${h},${t}^FS`);
    return this;
  }

  /** Add raw ZPL commands (escape hatch) */
  raw(zpl: string): this {
    this.commands.push(zpl);
    return this;
  }

  /** Build the final ZPL string */
  build(): string {
    return this.commands.join("\n");
  }

  /** Reset for building a new label */
  reset(): this {
    this.commands = [];
    return this;
  }
}

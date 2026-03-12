/**
 * ESC/POS command builder for thermal receipt printers.
 * Supports 58mm (32 chars/line) and 80mm (48 chars/line).
 */
export class ESCPOSBuilder {
  private buffer: number[] = [];
  private lineWidth: number;

  constructor(paperWidth: '58mm' | '80mm' = '80mm') {
    this.lineWidth = paperWidth === '58mm' ? 32 : 48;
  }

  /** ESC @ — Initialize printer */
  initialize(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** ESC a 1 — Center align */
  alignCenter(): this {
    this.buffer.push(0x1b, 0x61, 0x01);
    return this;
  }

  /** ESC a 0 — Left align */
  alignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0x00);
    return this;
  }

  /** ESC E n — Bold on/off */
  bold(on: boolean): this {
    this.buffer.push(0x1b, 0x45, on ? 0x01 : 0x00);
    return this;
  }

  /** GS ! n — Font size (1 = normal, 2 = double height+width) */
  fontSize(size: 1 | 2): this {
    const n = size === 2 ? 0x11 : 0x00;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  /** Print a line of text */
  text(line: string): this {
    const bytes = this.encodeText(line + '\n');
    this.buffer.push(...bytes);
    return this;
  }

  /** Print two columns: left-aligned and right-aligned */
  columns(left: string, right: string): this {
    const gap = this.lineWidth - left.length - right.length;
    const padding = gap > 0 ? ' '.repeat(gap) : ' ';
    return this.text(left + padding + right);
  }

  /** Print three columns */
  threeColumns(left: string, center: string, right: string): this {
    const totalContent = left.length + center.length + right.length;
    const totalGap = this.lineWidth - totalContent;
    const leftGap = Math.floor(totalGap / 2);
    const rightGap = totalGap - leftGap;
    const padL = leftGap > 0 ? ' '.repeat(leftGap) : ' ';
    const padR = rightGap > 0 ? ' '.repeat(rightGap) : ' ';
    return this.text(left + padL + center + padR + right);
  }

  /** Print separator line */
  separator(char: string = '-'): this {
    return this.text(char.repeat(this.lineWidth));
  }

  /** LF — Empty line */
  newline(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  /** GS V 66 — Partial cut */
  cut(): this {
    this.newline(3);
    this.buffer.push(0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  /** ESC p 0 — Open cash drawer */
  openDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /** Build final byte array */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  private encodeText(text: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      bytes.push(code > 127 ? 0x3f : code); // Replace non-ASCII with ?
    }
    return bytes;
  }
}

/** Format a number as PHP currency for receipt printing */
export function fmtPHP(amount: number): string {
  return amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

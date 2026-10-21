const encoder = new TextEncoder();

export function byteToUtf16(source: string, offset: number): number {
  const target = Math.max(0, offset);
  let bytes = 0;
  let utf16 = 0;
  for (const character of source) {
    const nextBytes = bytes + encoder.encode(character).length;
    if (nextBytes > target) return utf16;
    bytes = nextBytes;
    utf16 += character.length;
  }
  return utf16;
}

export function utf16ToByte(source: string, offset: number): number {
  const target = Math.max(0, offset);
  let bytes = 0;
  let utf16 = 0;
  for (const character of source) {
    const nextUtf16 = utf16 + character.length;
    if (nextUtf16 > target) return bytes;
    utf16 = nextUtf16;
    bytes += encoder.encode(character).length;
  }
  return bytes;
}

export interface PositionIndex {
  byteToUtf16(offset: number): number;
  utf16ToByte(offset: number): number;
}

export function createPositionIndex(source: string): PositionIndex {
  const bytes = [0];
  const utf16 = [0];
  let byteOffset = 0;
  let utf16Offset = 0;
  for (const character of source) {
    const point = character.codePointAt(0)!;
    byteOffset += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    utf16Offset += character.length;
    bytes.push(byteOffset);
    utf16.push(utf16Offset);
  }
  return {
    byteToUtf16: (offset) => utf16[boundaryAtOrBefore(bytes, Math.max(0, offset))],
    utf16ToByte: (offset) => bytes[boundaryAtOrBefore(utf16, Math.max(0, offset))],
  };
}

function boundaryAtOrBefore(boundaries: number[], target: number): number {
  let low = 0;
  let high = boundaries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (boundaries[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return Math.max(0, low - 1);
}

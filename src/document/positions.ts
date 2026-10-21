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

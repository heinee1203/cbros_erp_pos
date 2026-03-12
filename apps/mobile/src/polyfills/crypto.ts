/**
 * Polyfill for crypto.getRandomValues() on Hermes.
 * Uses Math.random() — sufficient for uuid v4 cart line IDs,
 * NOT for cryptographic purposes.
 */
if (typeof global.crypto === 'undefined') {
  (global as any).crypto = {};
}

if (typeof global.crypto.getRandomValues === 'undefined') {
  (global.crypto as any).getRandomValues = function getRandomValues<
    T extends ArrayBufferView,
  >(array: T): T {
    if (
      !(
        array instanceof Uint8Array ||
        array instanceof Uint16Array ||
        array instanceof Uint32Array ||
        array instanceof Int8Array ||
        array instanceof Int16Array ||
        array instanceof Int32Array
      )
    ) {
      throw new TypeError('Expected an integer array');
    }
    const bytes = array as unknown as Uint8Array;
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

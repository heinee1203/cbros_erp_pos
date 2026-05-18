export function buildTestLabelZpl(now = new Date()): string {
  return `^XA
^CI28
^PW400
^LL240
^FO10,20^A0N,30,30^FDCBROS POS^FS
^FO10,60^A0N,22,22^FDTest Label^FS
^FO10,100^A0N,18,18^FD${now.toISOString().slice(0, 19)}^FS
^FO20,140^BY2,2,60^BCN,60,Y,N,N^FD1234567890^FS
^XZ
`;
}

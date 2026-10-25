import { dividirEnPartes, NUM_PARTES_QR, PREFIJO_QR, reensamblarPartes } from './qrPartes';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function main(): void {
  const datos = btoa(JSON.stringify({ token: 'abc12345', sdp: { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel' } }));
  const partes = dividirEnPartes(datos);

  assert(partes.length === NUM_PARTES_QR, 'divide en 3 partes');
  assert(partes.every((p) => p.startsWith(PREFIJO_QR)), 'cada parte lleva el prefijo MZ3/');
  assert(partes[0].startsWith(`${PREFIJO_QR}1/3|`), 'la primera parte se identifica como 1/3');
  assert(partes[2].startsWith(`${PREFIJO_QR}3/3|`), 'la última parte se identifica como 3/3');
  assert(
    partes.map((p) => p.slice(p.indexOf('|') + 1)).join('') === datos,
    'las partes concatenadas reconstruyen el payload original',
  );

  assert(reensamblarPartes(partes.join('\n')) === datos, 'reensambla partes separadas por saltos de línea');
  assert(reensamblarPartes(partes.join(' ')) === datos, 'reensambla partes separadas por espacios');
  assert(reensamblarPartes(partes.join('\r\n')) === datos, 'reensambla partes con CRLF');
  assert(reensamblarPartes(datos) === datos, 'un payload antiguo sin cabeceras se conserva tal cual');
  assert(reensamblarPartes(`  ${datos}  `) === datos, 'recorta espacios de un payload antiguo');
  assert(
    reensamblarPartes(partes[0]) === partes[0].trim(),
    'con una sola parte no inventa un payload: devuelve el texto recortado',
  );

  const base64ConSignos = 'abc+/def==';
  const partesSignos = dividirEnPartes(base64ConSignos);
  assert(reensamblarPartes(partesSignos.join('\n')) === base64ConSignos, 'preserva +, / y = del base64');

  const vacio = dividirEnPartes('');
  assert(vacio.length === 3, 'un payload vacío también produce 3 cabeceras');
  assert(reensamblarPartes(vacio.join('\n')) === vacio.join('\n').trim(), 'un payload vacío no se reensambla a basura');

  console.log(`${ok}/${total} ok`);
}

main();

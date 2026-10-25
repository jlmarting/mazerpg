import { extraerSdpManual } from './manualSdp';

let ok = 0;
let total = 0;

function assert(condicion: boolean, mensaje: string): void {
  total++;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  ok++;
  console.log(`ok ${total} - ${mensaje}`);
}

function main(): void {
  const wrapped = extraerSdpManual({
    token: 'abc12345',
    sdp: { type: 'answer', sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel' },
  });
  assert(wrapped !== null && wrapped.token === 'abc12345', 'wrapper nuevo: extrae el token');
  assert(wrapped?.sdp.type === 'answer' && wrapped.sdp.sdp.startsWith('v=0'), 'wrapper nuevo: extrae el SDP');

  const legacyAnswer = extraerSdpManual({
    type: 'answer',
    sdp: 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  });
  assert(legacyAnswer !== null && legacyAnswer.token === null, 'legacy: SDP plano sin token');
  assert(legacyAnswer?.sdp.type === 'answer', 'legacy: conserva el type answer');

  const legacyOffer = extraerSdpManual({
    type: 'offer',
    sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1',
  });
  assert(legacyOffer?.sdp.type === 'offer', 'legacy: conserva el type offer');

  const wrappedSinToken = extraerSdpManual({
    sdp: { type: 'offer', sdp: 'v=0' },
  });
  assert(wrappedSinToken !== null && wrappedSinToken.token === null, 'wrapper sin token: token null');

  const tokenNoString = extraerSdpManual({
    token: 123,
    sdp: { type: 'answer', sdp: 'v=0' },
  });
  assert(tokenNoString !== null && tokenNoString.token === null, 'token no-string se degrada a null');

  assert(extraerSdpManual(null) === null, 'null no es un payload');
  assert(extraerSdpManual('texto') === null, 'string no es un payload');
  assert(extraerSdpManual({}) === null, 'objeto sin sdp/type no es un payload');
  assert(extraerSdpManual({ sdp: { sdp: 'v=0' } }) === null, 'sdp envuelto sin type no es válido');
  assert(extraerSdpManual({ type: 'offer', sdp: 123 }) === null, 'sdp no-string no es válido');

  console.log(`${ok}/${total} ok`);
}

main();

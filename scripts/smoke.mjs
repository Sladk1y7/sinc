import { io } from 'socket.io-client';

const base = 'http://127.0.0.1:4000';

async function req(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} ${response.status} ${text}`);
  return json;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(base, { reconnection: false, transports: ['websocket'], auth: { token } });
    const events = [];
    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', (error) => reject(error));
    socket.on('event', (event) => events.push(event));
  });
}

const health = await req('/health');
if (health.persistence !== 'memory') throw new Error('expected memory persistence');

const anya = await req('/api/auth/guest', { method: 'POST', body: { name: 'Аня' } });
const max = await req('/api/auth/guest', { method: 'POST', body: { name: 'Макс' } });

let drmRejected = false;
try {
  await req('/api/rooms', {
    method: 'POST',
    token: anya.token,
    body: { sourceType: 'native', drm: { provider: 'widevine' }, sourceUrl: 'https://cdn.example.com/a.mp4' },
  });
} catch (error) {
  drmRejected = String(error.message).includes('DRM');
}

let catalogueRejected = false;
try {
  await req('/api/rooms', {
    method: 'POST',
    token: anya.token,
    body: { sourceType: 'native', sourceUrl: 'https://www.kinopoisk.ru/film/1' },
  });
} catch {
  catalogueRejected = true;
}

const room = await req('/api/rooms', {
  method: 'POST',
  token: anya.token,
  body: {
    sourceType: 'native',
    sourceUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    externalTitle: 'Big Buck Bunny',
  },
});
await req('/api/rooms/join', { method: 'POST', token: max.token, body: { code: room.state.code } });

const host = await connect(anya.token);
const guest = await connect(max.token);
host.socket.emit('event', { type: 'room.join', roomId: room.state.roomId, userId: anya.user.id });
guest.socket.emit('event', { type: 'room.join', roomId: room.state.roomId, userId: max.user.id });
await new Promise((resolve) => setTimeout(resolve, 400));
host.socket.emit('event', { type: 'playback.play', positionSec: 12 });
host.socket.emit('event', { type: 'chat.message', text: 'привет' });
host.socket.emit('event', { type: 'chat.message', text: 'это пиздец' });
await new Promise((resolve) => setTimeout(resolve, 500));

const play = guest.events.find((event) => event.type === 'playback.command');
const hello = guest.events.find((event) => event.type === 'chat.message');
const insult = host.events.find((event) => event.type === 'error' && event.code === 'rejected');

const external = await req('/api/rooms', {
  method: 'POST',
  token: anya.token,
  body: { sourceType: 'external_service', service: 'okko', externalTitle: 'Дюна', externalWebUrl: 'https://okko.tv/movie' },
});
const externalSocket = await connect(anya.token);
externalSocket.socket.emit('event', { type: 'room.join', roomId: external.state.roomId, userId: anya.user.id });
await new Promise((resolve) => setTimeout(resolve, 300));
externalSocket.socket.emit('event', { type: 'playback.seek', positionSec: 4350 });
externalSocket.socket.emit('event', { type: 'playback.play', positionSec: 4350 });
await new Promise((resolve) => setTimeout(resolve, 400));
const commands = externalSocket.events.filter((event) => event.type === 'playback.command').map((event) => event.command);

let overflow = '';
for (const name of ['Кира', 'Лев', 'Нора']) {
  const person = await req('/api/auth/guest', { method: 'POST', body: { name } });
  try {
    await req('/api/rooms/join', { method: 'POST', token: person.token, body: { code: room.state.code } });
  } catch (error) {
    overflow = String(error.message);
  }
}

host.socket.close();
guest.socket.close();
externalSocket.socket.close();

const seek = commands.find((command) => command.action === 'seek_manual');
const countdown = commands.find((command) => command.action === 'countdown_play');
if (!drmRejected || !catalogueRejected || play?.command.action !== 'play' || hello?.message.text !== 'привет' || !insult || seek?.label !== 'Перемотайте на 01:12:30' || countdown?.countdownSec !== 3 || !overflow.includes('403')) {
  console.error(JSON.stringify({ drmRejected, catalogueRejected, play, hello, insult, seek, countdown, overflow }, null, 2));
  process.exit(1);
}
console.log('SMOKE OK', room.state.code);

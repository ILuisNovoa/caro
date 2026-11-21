import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';

test('MySQL, two password accounts, private media, author colors and ownership', async () => {
  const php = process.env.PHP_BINARY || 'php';
  const env = { ...process.env, DB_NAME: `book_test_${randomBytes(8).toString('hex')}`, APP_SETUP_KEY: randomBytes(32).toString('hex') };
  execFileSync(php, ['tests/mysql-fixture.php'], { env });
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(php, ['-d', 'upload_max_filesize=10M', '-d', 'post_max_size=12M', '-S', `127.0.0.1:${port}`, '-t', 'dist'], { env, stdio: 'ignore' });
  const call = (route, { method = 'GET', cookie, data, form, setup, foreign } = {}) => {
    const headers = { Origin: foreign ? 'https://other.example.test' : origin };
    if (cookie) headers.Cookie = cookie;
    if (data) headers['Content-Type'] = 'application/json';
    if (setup) headers['X-Setup-Key'] = env.APP_SETUP_KEY;
    return fetch(`${origin}/api/index.php?route=${encodeURIComponent(route)}`, {
      method, headers, body: form || (data ? JSON.stringify(data) : undefined)
    });
  };
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { const r = await call('session'); if (r.status === 200) { ready = true; break; } } catch {}
      await setTimeout(100);
    }
    assert.ok(ready, 'PHP and MySQL start successfully');
    assert.equal((await call('memories')).status, 401);
    assert.equal((await call('legacy/fotos/capitulo-1/priemra.jpg')).status, 401);
    const credentials = {
      blue: { username: 'luis_test', name: 'Mi nombre', password: 'Una clave azul 123' },
      pink: { username: 'amor_test', name: 'El nombre que ella quiera', password: 'Una clave rosa 456' }
    };
    assert.equal((await call('setup', { method: 'POST', data: credentials })).status, 403);
    const setup = await call('setup', { method: 'POST', data: credentials, setup: true });
    assert.equal(setup.status, 201, await setup.text());
    let blue = setup.headers.get('Set-Cookie').split(';')[0];
    assert.ok(setup.headers.get('Set-Cookie').includes('HttpOnly'));
    assert.equal((await call('setup', { method: 'POST', data: credentials, setup: true })).status, 409);
    const loggedIn = await call('login', { method: 'POST', data: credentials.pink });
    assert.equal(loggedIn.status, 200);
    const pink = loggedIn.headers.get('Set-Cookie').split(';')[0];
    const photo = new FormData();
    photo.set('title', 'Un día juntos');
    photo.set('body', 'Texto con tildes y <script> literal.');
    photo.set('color', 'pink');
    photo.set('photo', new File([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGQAAAABJRU5ErkJggg==', 'base64')], 'foto.png', { type: 'image/png' }));
    const created = await call('memories', { method: 'POST', cookie: blue, form: photo });
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const text = new FormData();
    text.set('title', 'El recuerdo de ella');
    text.set('body', 'Escrito por ella');
    assert.equal((await call('memories', { method: 'POST', cookie: pink, form: text })).status, 201);
    const memories = (await (await call('memories', { cookie: pink })).json()).memories;
    assert.equal(memories.length, 2);
    assert.equal(memories.find(item => item.id === id).color, 'blue');
    assert.equal(memories.find(item => item.title === 'El recuerdo de ella').color, 'pink');
    assert.equal((await call(`memories/${id}/photo`)).status, 401);
    assert.equal((await call(`memories/${id}/photo`, { cookie: pink })).headers.get('Content-Type'), 'image/png');
    assert.equal((await call(`memories/${id}`, { method: 'DELETE', cookie: pink })).status, 403);
    assert.equal((await call('profile', { method: 'PATCH', cookie: pink, data: { name: 'Nombre elegido por ella' } })).status, 200);
    assert.equal((await (await call('session', { cookie: pink })).json()).user.name, 'Nombre elegido por ella');
    assert.equal((await call('profile', { method: 'PATCH', cookie: blue, foreign: true, data: { name: 'Otro' } })).status, 403);
    const password = await call('password', { method: 'POST', cookie: blue, data: { currentPassword: credentials.blue.password, password: 'Una nueva clave 789' } });
    assert.equal(password.status, 200);
    const newBlue = password.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await call('memories', { cookie: blue })).status, 401);
    blue = newBlue;
    assert.equal((await call(`memories/${id}`, { method: 'DELETE', cookie: blue })).status, 200);
    assert.equal((await call(`memories/${id}/photo`, { cookie: blue })).status, 404);
    const fake = new FormData();
    fake.set('title', 'Archivo inválido');
    fake.set('photo', new File(['<html>'], 'foto.jpg', { type: 'image/jpeg' }));
    assert.equal((await call('memories', { method: 'POST', cookie: blue, form: fake })).status, 400);
    assert.equal((await call('logout', { method: 'POST', cookie: pink })).status, 200);
    assert.equal((await call('memories', { cookie: pink })).status, 401);
  } finally {
    server.kill();
    execFileSync(php, ['tests/mysql-fixture.php', 'drop'], { env });
  }
});

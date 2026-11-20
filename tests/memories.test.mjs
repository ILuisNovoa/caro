import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.mjs';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_recuerdos.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const files = new Map();
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...parameters) { values = parameters; return this; },
        first() { return sqlite.prepare(sql).get(...values) || null; },
        all() { return { results: sqlite.prepare(sql).all(...values) }; },
        run() { return sqlite.prepare(sql).run(...values); }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { DB, OWNER_EMAIL: 'owner@example.test', BUCKET: {
    async put(key, bytes) { files.set(key, bytes); },
    async get(key) { return files.has(key) ? { body: files.get(key) } : null; },
    async delete(key) { files.delete(key); }
  }, ASSETS: { fetch: () => new Response('asset') }, files };
}

const origin = 'https://book.example.test';
function request(path, { method = 'GET', data, cookie, owner, form, foreignOrigin } = {}) {
  const headers = { Origin: foreignOrigin ? 'https://other.example.test' : origin };
  if (cookie) headers.Cookie = cookie;
  if (owner) {
    headers['oai-authenticated-user-id'] = 'owner-site-id';
    headers['oai-authenticated-user-email'] = 'owner@example.test';
  }
  if (data) headers['Content-Type'] = 'application/json';
  return new Request(origin + path, { method, headers, body: form || (data ? JSON.stringify(data) : undefined) });
}

test('two authenticated authors persist memories with server-assigned colors and private photos', async () => {
  const env = environment();
  const call = (path, options) => worker.fetch(request(path, options), env);
  const credentials = {
    blue: { username: 'luis', name: 'Luis', password: 'Una clave azul 123' },
    pink: { username: 'amor', name: 'El nombre de ella', password: 'Una clave rosa 456' }
  };
  assert.equal((await call('/api/memories')).status, 401);
  assert.equal((await call('/fotos/capitulo-1/priemra.jpg')).status, 401);
  assert.equal((await call('/api/setup', { method: 'POST', data: credentials })).status, 403);
  const setup = await call('/api/setup', { method: 'POST', data: credentials, owner: true });
  assert.equal(setup.status, 201);
  let blueCookie = setup.headers.get('Set-Cookie').split(';')[0];
  assert.ok(setup.headers.get('Set-Cookie').includes('HttpOnly; Secure; SameSite=Lax'));
  assert.equal((await call('/api/setup', { method: 'POST', data: credentials, owner: true })).status, 409);
  assert.equal((await call('/api/login', { method: 'POST', data: { username: 'amor', password: 'wrong' } })).status, 401);
  const login = await call('/api/login', { method: 'POST', data: credentials.pink });
  const pinkCookie = login.headers.get('Set-Cookie').split(';')[0];
  const photo = new FormData();
  photo.set('title', 'Nuestro primer recuerdo');
  photo.set('body', 'Un texto con tildes y un <script> literal.');
  photo.set('color', 'pink');
  photo.set('photo', new File([new Uint8Array([255,216,255,224,0,16,74,70,73,70])], 'foto.jpg', { type: 'image/jpeg' }));
  const created = await call('/api/memories', { method: 'POST', cookie: blueCookie, form: photo });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const pinkText = new FormData();
  pinkText.set('title', 'Mi recuerdo');
  pinkText.set('body', 'Una página escrita por ella.');
  assert.equal((await call('/api/memories', { method: 'POST', cookie: pinkCookie, form: pinkText })).status, 201);
  const memories = (await (await call('/api/memories', { cookie: pinkCookie })).json()).memories;
  assert.equal(memories.length, 2);
  assert.equal(memories.find(item => item.id === id).color, 'blue');
  assert.equal(memories.find(item => item.title === 'Mi recuerdo').color, 'pink');
  assert.equal((await call(`/api/memories/${id}/photo`)).status, 401);
  assert.equal((await call(`/api/memories/${id}/photo`, { cookie: pinkCookie })).headers.get('Content-Type'), 'image/jpeg');
  assert.equal((await call(`/api/memories/${id}`, { method: 'DELETE', cookie: pinkCookie })).status, 403);
  assert.equal((await call('/api/profile', { method: 'PATCH', cookie: pinkCookie, data: { name: 'Mi nombre elegido' } })).status, 200);
  assert.equal((await (await call('/api/session', { cookie: pinkCookie })).json()).user.name, 'Mi nombre elegido');
  assert.equal((await call('/api/profile', { method: 'PATCH', cookie: blueCookie, foreignOrigin: true, data: { name: 'Otro' } })).status, 403);
  assert.equal((await call('/api/password', { method: 'POST', cookie: blueCookie,
    data: { currentPassword: credentials.blue.password, password: 'Nueva clave azul 789' } })).status, 200);
  assert.equal((await call('/api/memories', { cookie: blueCookie })).status, 401);
  const relogin = await call('/api/login', { method: 'POST', data: { username: 'luis', password: 'Nueva clave azul 789' } });
  blueCookie = relogin.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await call(`/api/memories/${id}`, { method: 'DELETE', cookie: blueCookie })).status, 200);
  assert.equal(env.files.size, 0);
  const fake = new FormData();
  fake.set('title', 'Archivo incorrecto');
  fake.set('photo', new File(['<html>'], 'fake.jpg', { type: 'image/jpeg' }));
  assert.equal((await call('/api/memories', { method: 'POST', cookie: blueCookie, form: fake })).status, 400);
  assert.equal((await call('/api/logout', { method: 'POST', cookie: pinkCookie })).status, 200);
  assert.equal((await call('/api/memories', { cookie: pinkCookie })).status, 401);
});

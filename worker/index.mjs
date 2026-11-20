const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', ...headers
  } });
}

function problem(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function passwordHash(password, salt = crypto.randomUUID()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256);
  return `${salt}:${hex(hash)}`;
}

async function passwordMatches(password, stored) {
  const actual = await passwordHash(password, stored.split(':')[0]);
  let difference = actual.length ^ stored.length;
  for (let i = 0; i < stored.length; i++) difference |= stored.charCodeAt(i) ^ (actual.charCodeAt(i) || 0);
  return difference === 0;
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
    problem('Usa una contraseña de entre 10 y 200 caracteres.');
  }
}

function cookie(value, maxAge = SESSION_SECONDS) {
  return `book_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function session(request, env) {
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)book_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return env.DB.prepare('SELECT p.role,p.username,p.display_name AS name FROM sessions s JOIN profiles p ON p.role=s.author_role WHERE s.token_hash=? AND s.expires_at>?')
    .bind(await digest(token), Date.now()).first();
}

async function startSession(env, role) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessions(token_hash,author_role,expires_at) VALUES (?,?,?)')
      .bind(await digest(token), role, Date.now() + SESSION_SECONDS * 1000)
  ]);
  return cookie(token);
}

async function readJson(request) {
  const blob = await readLimited(request, 16384);
  try { return JSON.parse(await blob.text()); } catch { problem('No pudimos leer los datos. Vuelve a intentarlo.'); }
}

function verifyOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    problem('Vuelve a abrir el libro para guardar los cambios.', 403);
  }
}

async function readLimited(request, limit) {
  if (Number(request.headers.get('Content-Length') || 0) > limit) problem('El archivo o texto es demasiado grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) problem('La publicación está vacía.');
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      problem('El archivo o texto es demasiado grande.', 413);
    }
    chunks.push(value);
  }
  return new Blob(chunks);
}

function accountInput(data) {
  const username = String(data.username || '').trim().toLowerCase();
  const name = String(data.name || '').trim();
  if (!/^[a-z0-9_.-]{3,40}$/.test(username)) problem('El usuario necesita entre 3 y 40 letras sin tildes, números, puntos o guiones.');
  if (!name || name.length > 60) problem('Escribe un nombre de hasta 60 caracteres.');
  checkPassword(data.password);
  return { username, name, password: data.password };
}

function setupOwner(request, env) {
  return request.headers.get('oai-authenticated-user-email')?.toLowerCase() === env.OWNER_EMAIL?.toLowerCase()
    && Boolean(request.headers.get('oai-authenticated-user-id'));
}

async function authentication(request, env, url) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM profiles').first();
  if (url.pathname === '/api/session' && request.method === 'GET') {
    return json({ user: await session(request, env), initialized: count.count === 2,
      setupAvailable: count.count === 0 && Boolean(setupOwner(request, env)) });
  }
  if (url.pathname === '/api/setup' && request.method === 'POST') {
    if (!setupOwner(request, env)) problem('Entra con la cuenta propietaria del enlace para configurar el libro.', 403);
    if (count.count !== 0) problem('Las dos cuentas ya están creadas.', 409);
    const data = await readJson(request);
    const blue = accountInput(data.blue || {});
    const pink = accountInput(data.pink || {});
    if (blue.username === pink.username) problem('Elige un usuario diferente para cada uno.');
    // Both accounts are inserted atomically. The schema permits exactly two roles.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO profiles(role,username,display_name,password_hash) VALUES (?,?,?,?)')
        .bind('blue', blue.username, blue.name, await passwordHash(blue.password)),
      env.DB.prepare('INSERT INTO profiles(role,username,display_name,password_hash) VALUES (?,?,?,?)')
        .bind('pink', pink.username, pink.name, await passwordHash(pink.password))
    ]);
    return json({ saved: true }, 201, { 'Set-Cookie': await startSession(env, 'blue') });
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const data = await readJson(request);
    const username = String(data.username || '').trim().toLowerCase().slice(0, 40);
    const password = String(data.password || '').slice(0, 201);
    const window = Math.floor(Date.now() / 900000);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const key = await digest(`${ip}:${window}`);
    await env.DB.prepare('DELETE FROM login_limits WHERE expires_at < ?').bind(Date.now()).run();
    const limit = await env.DB.prepare('INSERT INTO login_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts')
      .bind(key, (window + 1) * 900000).first();
    if (limit.attempts > 30) problem('Demasiados intentos. Espera 15 minutos y vuelve a intentar.', 429);
    const profile = await env.DB.prepare('SELECT role,password_hash FROM profiles WHERE username=? COLLATE NOCASE').bind(username).first();
    if (!profile || !await passwordMatches(password, profile.password_hash)) problem('Revisa tu usuario y contraseña.', 401);
    return json({ signedIn: true }, 200, { 'Set-Cookie': await startSession(env, profile.role) });
  }
  return null;
}

function imageType(bytes) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)) return 'image/png';
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith('RIFF') && text.slice(8) === 'WEBP') return 'image/webp';
  return null;
}

async function createMemory(request, env, user) {
  const blob = await readLimited(request, MAX_PHOTO_BYTES + 65536);
  const form = await new Response(blob, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
  const title = String(form.get('title') || '').trim();
  const body = String(form.get('body') || '').trim();
  const file = form.get('photo');
  if (!title || title.length > 120) problem('Escribe un título de hasta 120 caracteres.');
  if (body.length > 8000) problem('El texto puede tener hasta 8000 caracteres.');
  if (!body && !(file instanceof File && file.size)) problem('Añade una foto o escribe el recuerdo.');
  const id = crypto.randomUUID();
  let key = null;
  let type = null;
  if (file instanceof File && file.size) {
    if (file.size > MAX_PHOTO_BYTES) problem('La foto supera los 10 MB.', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    type = imageType(bytes);
    if (!type) problem('Elige una foto JPG, PNG o WEBP.');
    key = `memories/${user.role}/${id}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  }
  try {
    await env.DB.prepare('INSERT INTO memories(id,author_role,title,body,photo_key,photo_type,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, user.role, title, body, key, type, new Date().toISOString()).run();
  } catch (error) {
    if (key) await env.BUCKET.delete(key);
    throw error;
  }
  return json({ id }, 201);
}

async function protectedApi(request, env, url, user) {
  if (url.pathname === '/api/logout' && request.method === 'POST') {
    const token = request.headers.get('Cookie')?.match(/book_session=([a-f0-9]{64})/)?.[1];
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    return json({ signedOut: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (url.pathname === '/api/profile' && request.method === 'PATCH') {
    const data = await readJson(request);
    const name = String(data.name || '').trim();
    if (!name || name.length > 60) problem('Escribe un nombre de hasta 60 caracteres.');
    await env.DB.prepare('UPDATE profiles SET display_name=? WHERE role=?').bind(name, user.role).run();
    return json({ saved: true });
  }
  if (url.pathname === '/api/password' && request.method === 'POST') {
    const data = await readJson(request);
    checkPassword(data.password);
    const current = await env.DB.prepare('SELECT password_hash FROM profiles WHERE role=?').bind(user.role).first();
    if (!await passwordMatches(String(data.currentPassword || ''), current.password_hash)) problem('La contraseña actual no coincide.', 401);
    await env.DB.batch([
      env.DB.prepare('UPDATE profiles SET password_hash=? WHERE role=?').bind(await passwordHash(data.password), user.role),
      env.DB.prepare('DELETE FROM sessions WHERE author_role=?').bind(user.role)
    ]);
    return json({ saved: true }, 200, { 'Set-Cookie': await startSession(env, user.role) });
  }
  if (url.pathname === '/api/memories' && request.method === 'GET') {
    const result = await env.DB.prepare('SELECT m.id,m.author_role AS color,m.title,m.body,m.created_at,p.display_name AS author,m.photo_key IS NOT NULL AS has_photo FROM memories m JOIN profiles p ON p.role=m.author_role ORDER BY m.created_at,m.id').all();
    return json({ memories: result.results });
  }
  if (url.pathname === '/api/memories' && request.method === 'POST') return createMemory(request, env, user);
  const match = url.pathname.match(/^\/api\/memories\/([a-f0-9-]{36})(\/photo)?$/);
  if (!match) return json({ error: 'No encontramos esta página.' }, 404);
  const memory = await env.DB.prepare('SELECT * FROM memories WHERE id=?').bind(match[1]).first();
  if (!memory) problem('Este recuerdo ya no está disponible.', 404);
  if (match[2] && ['GET', 'HEAD'].includes(request.method)) {
    if (!memory.photo_key) problem('Este recuerdo no tiene foto.', 404);
    const file = await env.BUCKET.get(memory.photo_key);
    if (!file) problem('No encontramos la foto.', 404);
    return new Response(request.method === 'HEAD' ? null : file.body, { headers: {
      'Content-Type': memory.photo_type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
    } });
  }
  if (!match[2] && request.method === 'DELETE') {
    if (memory.author_role !== user.role) problem('Puedes eliminar tus propios recuerdos.', 403);
    await env.DB.prepare('DELETE FROM memories WHERE id=? AND author_role=?').bind(memory.id, user.role).run();
    if (memory.photo_key) await env.BUCKET.delete(memory.photo_key);
    return json({ deleted: true });
  }
  return json({ error: 'Acción no disponible.' }, 405);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) verifyOrigin(request);
        const auth = await authentication(request, env, url);
        if (auth) return auth;
        const user = await session(request, env);
        if (!user) problem('Inicia sesión para ver nuestros recuerdos.', 401);
        return await protectedApi(request, env, url, user);
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Acción no disponible.' }, 405);
      if (/^\/(fotos|canciones)\//.test(url.pathname) && !await session(request, env)) problem('Inicia sesión para ver nuestros recuerdos.', 401);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error('book_request_failed', error.message);
      return json({ error: status >= 500 ? 'No pudimos guardar o cargar los recuerdos. Inténtalo de nuevo.' : error.message }, status);
    }
  }
};

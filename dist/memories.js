(() => {
  if (location.protocol === 'file:') return;

  const setupKey = new URL(location.href).searchParams.get('setup') || '';
  if (setupKey) history.replaceState(null, '', location.pathname);
  window.bookEndpoint = path => {
    const url = new URL('api/index.php', document.baseURI);
    url.searchParams.set('route', path.replace(/^\/api\//, ''));
    return url.href;
  };

  const access = document.createElement('section');
  access.id = 'bookAccess';
  access.className = 'book-access';
  access.innerHTML = `
    <p class="hand">Un lugar para los dos.</p>
    <h1>Nuestra historia</h1>
    <form id="loginForm" class="book-form" hidden>
      <h2>Volvamos a nuestros recuerdos</h2>
      <label>Usuario<input name="username" autocomplete="username" required maxlength="40"></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required maxlength="72"></label>
      <button class="primary" type="submit">Entrar a nuestro libro</button>
      <p class="form-status" role="status"></p>
    </form>
    <form id="setupForm" class="book-form" hidden>
      <h2>Preparemos nuestras dos cuentas</h2>
      <p>Cada uno podrá cambiar su nombre y su contraseña desde su perfil.</p>
      <fieldset class="account-blue"><legend>Tu cuenta · azul pastel</legend>
        <label>Tu nombre<input name="blueName" required maxlength="60" autocomplete="nickname"></label>
        <label>Usuario<input name="blueUsername" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9_.-]+" autocomplete="off"></label>
        <label>Contraseña<input name="bluePassword" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      </fieldset>
      <fieldset class="account-pink"><legend>La cuenta de ella · rosado pastel</legend>
        <label>Su nombre<input name="pinkName" required maxlength="60" autocomplete="off"></label>
        <label>Usuario<input name="pinkUsername" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9_.-]+" autocomplete="off"></label>
        <label>Contraseña<input name="pinkPassword" type="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      </fieldset>
      <small>Usen contraseñas de al menos 10 caracteres.</small>
      <button class="primary" type="submit">Crear nuestras cuentas</button>
      <p class="form-status" role="status"></p>
    </form>
    <div id="setupOwner" hidden><p>Abre el enlace privado de configuración que genera la instalación para preparar las dos cuentas.</p>
      </div>
    <p id="connectionStatus" role="status">Abriendo nuestro libro…</p>
    <button id="retryConnection" class="quiet" hidden>Volver a intentar</button>`;
  document.querySelector('main').before(access);

  const tools = document.createElement('section');
  tools.className = 'book-tools';
  tools.hidden = true;
  tools.innerHTML = `
    <span id="currentAuthor"></span>
    <div><button id="newMemory" class="small-action">Nuevo recuerdo</button>
      <button id="refreshMemories" class="quiet">Actualizar</button>
      <button id="profileToggle" class="quiet">Mi perfil</button>
      <button id="logoutBook" class="quiet">Salir</button></div>`;
  access.after(tools);

  const composer = document.createElement('section');
  composer.id = 'memoryComposer';
  composer.className = 'memory-composer';
  composer.hidden = true;
  composer.innerHTML = `
    <form id="memoryForm" class="book-form">
      <h2>Una nueva página para nosotros</h2>
      <label>Título<input name="title" required maxlength="120" placeholder="Un día que quiero recordar"></label>
      <label>Lo que quieres contar<textarea name="body" rows="5" maxlength="8000" placeholder="Escribe tu recuerdo…"></textarea></label>
      <label class="photo-picker">Foto<input name="photo" id="newPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <small>JPG, PNG o WEBP, hasta 10 MB.</small>
      <img id="newPhotoPreview" alt="Vista previa de la foto elegida" hidden>
      <div class="form-actions"><button class="primary" type="submit">Guardar en nuestro libro</button>
        <button id="cancelMemory" class="quiet" type="button">Cancelar</button></div>
      <p class="form-status" role="status"></p>
    </form>`;
  tools.after(composer);

  const profile = document.createElement('section');
  profile.className = 'profile-settings';
  profile.hidden = true;
  profile.innerHTML = `
    <form id="profileForm" class="book-form"><h2>Mi nombre en el libro</h2>
      <label>Nombre<input name="name" required maxlength="60" autocomplete="nickname"></label>
      <button class="small-action" type="submit">Guardar nombre</button><p class="form-status" role="status"></p></form>
    <form id="passwordForm" class="book-form"><h2>Cambiar contraseña</h2>
      <label>Contraseña actual<input type="password" name="currentPassword" required maxlength="72" autocomplete="current-password"></label>
      <label>Nueva contraseña<input type="password" name="password" required minlength="10" maxlength="72" autocomplete="new-password"></label>
      <button class="small-action" type="submit">Guardar contraseña</button><p class="form-status" role="status"></p></form>`;
  composer.after(profile);

  const deleteButton = document.createElement('button');
  deleteButton.id = 'deleteMemory';
  deleteButton.className = 'quiet delete-memory';
  deleteButton.textContent = 'Eliminar este recuerdo';
  deleteButton.hidden = true;
  document.querySelector('.navigation').after(deleteButton);

  let chosenFile = null;
  let previewUrl = null;
  let saving = false;
  let draftId = crypto.randomUUID();
  document.body.classList.add('needs-login');

  async function api(path, options = {}) {
    const response = await fetch(window.bookEndpoint(path), { credentials: 'same-origin', ...options,
      headers: { ...options.headers, ...(setupKey ? { 'X-Setup-Key': setupKey } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && window.bookUser && path !== '/api/password') await loadSession();
      throw new Error(data.error || 'No pudimos conectar. Vuelve a intentarlo.');
    }
    return data;
  }

  async function jsonApi(path, method, value) {
    return api(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  }

  function setUser(user) {
    window.bookUser = user;
    document.body.classList.toggle('needs-login', !user);
    access.hidden = Boolean(user);
    tools.hidden = !user;
    composer.hidden = true;
    profile.hidden = true;
    if (user) {
      tools.dataset.author = user.role;
      composer.dataset.author = user.role;
      document.querySelector('#currentAuthor').textContent = user.name;
      profile.querySelector('[name=name]').value = user.name;
    } else {
      document.querySelector('#audio').pause();
    }
  }

  async function loadMemories() {
    const { memories } = await api('/api/memories');
    window.bookApi.refresh(memories);
  }

  async function loadSession() {
    const status = document.querySelector('#connectionStatus');
    document.querySelector('#retryConnection').hidden = true;
    try {
      const state = await api('/api/session');
      setUser(state.user);
      document.querySelector('#loginForm').hidden = !state.initialized;
      document.querySelector('#setupForm').hidden = !state.setupAvailable;
      document.querySelector('#setupOwner').hidden = state.initialized || state.setupAvailable;
      status.textContent = '';
      if (state.user) await loadMemories();
    } catch (error) {
      status.textContent = error.message;
      if (window.bookUser) toast(error.message);
      document.querySelector('#retryConnection').hidden = false;
    }
  }

  function handleForm(id, action) {
    const form = document.querySelector(id);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('[type=submit]');
      const status = form.querySelector('.form-status');
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = 'Guardando…';
      try {
        await action(new FormData(form), form);
        status.textContent = '';
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    });
  }

  handleForm('#loginForm', async data => {
    await jsonApi('/api/login', 'POST', Object.fromEntries(data));
    document.querySelector('#loginForm').reset();
    await loadSession();
  });
  handleForm('#setupForm', async data => {
    await jsonApi('/api/setup', 'POST', {
      blue: { name: data.get('blueName'), username: data.get('blueUsername'), password: data.get('bluePassword') },
      pink: { name: data.get('pinkName'), username: data.get('pinkUsername'), password: data.get('pinkPassword') }
    });
    document.querySelector('#setupForm').reset();
    await loadSession();
  });
  handleForm('#profileForm', async data => {
    await jsonApi('/api/profile', 'PATCH', Object.fromEntries(data));
    await loadSession();
    toast('Tu nombre quedó guardado.');
  });
  handleForm('#passwordForm', async (data, form) => {
    await jsonApi('/api/password', 'POST', Object.fromEntries(data));
    form.reset();
    toast('Tu contraseña quedó actualizada.');
  });
  handleForm('#memoryForm', async (data, form) => {
    saving = true;
    try {
      if (chosenFile) data.set('photo', chosenFile);
      data.set('requestId', draftId);
      const { id } = await api('/api/memories', { method: 'POST', body: data });
      form.reset();
      setPhoto(null);
      composer.hidden = true;
      draftId = crypto.randomUUID();
      await loadMemories();
      await window.bookApi.show(id);
      toast('Un recuerdo más en nuestra historia.');
    } finally { saving = false; }
  });

  function setPhoto(file) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    chosenFile = file || null;
    previewUrl = file ? URL.createObjectURL(file) : null;
    const image = document.querySelector('#newPhotoPreview');
    image.hidden = !file;
    if (file) image.src = previewUrl;
    else image.removeAttribute('src');
  }

  window.openMemoryComposer = file => {
    if (!window.bookUser) return;
    profile.hidden = true;
    composer.hidden = false;
    if (file) setPhoto(file);
    composer.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
    composer.querySelector('[name=title]').focus({ preventScroll: true });
  };
  document.querySelector('#newPhoto').onchange = event => {
    const file = event.target.files[0];
    if (file && file.size > 10 * 1024 * 1024) {
      toast('Elige una foto de hasta 10 MB.');
      event.target.value = '';
      setPhoto(null);
      return;
    }
    setPhoto(file);
  };
  document.querySelector('#newMemory').onclick = () => window.openMemoryComposer();
  document.querySelector('#cancelMemory').onclick = () => {
    if (saving) return;
    composer.hidden = true;
    document.querySelector('#memoryForm').reset();
    setPhoto(null);
  };
  document.querySelector('#profileToggle').onclick = () => {
    profile.hidden = !profile.hidden;
    composer.hidden = true;
  };
  document.querySelector('#retryConnection').onclick = loadSession;
  document.querySelector('#refreshMemories').onclick = async () => {
    try { await loadMemories(); toast('Ya estás al día.'); } catch (error) { toast(error.message); }
  };
  document.querySelector('#logoutBook').onclick = async () => {
    try { await api('/api/logout', { method: 'POST' }); location.reload(); }
    catch (error) { toast(error.message); }
  };
  deleteButton.onclick = async () => {
    if (!confirm('¿Eliminar este recuerdo de nuestro libro?')) return;
    deleteButton.disabled = true;
    try {
      await api(`/api/memories/${deleteButton.dataset.id}`, { method: 'DELETE' });
      await loadMemories();
      toast('El recuerdo se eliminó.');
    } catch (error) { toast(error.message); }
    finally { deleteButton.disabled = false; }
  };
  loadSession();
})();

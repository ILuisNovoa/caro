const $=s=>document.querySelector(s);let chapter=0,selected=-1,tracks=[...(window.CANCIONES||[])],photos={...(window.FOTOS||{})};const audio=$('#audio');audio.volume=.6;
const chapters = [
  {
    title: 'Y entonces, llegaste tú.',
    caption: 'Donde empezó todo...',
    text: [
      'Hay días que parecen uno más, hasta que alguien llega y lo cambia todo.',
      'Aquí irá la historia de cómo nos conocimos: esa primera conversación, los nervios y el momento en que empezamos a ser nosotros.'
    ]
  },
  {
    title: 'Mi plan favorito eres tú.',
    caption: 'Contigo, cualquier lugar.',
    text: [
      'No siempre hace falta un viaje enorme. A veces basta una caminata, algo rico y tu mano junto a la mía.',
      'Aquí guardaremos nuestra primera salida y esos detalles que todavía nos hacen sonreír.'
    ]
  }
];
const introductionCount = chapters.length;
// El comienzo del 23 de octubre, en la zona horaria de Bogotá.
const togetherSince = Date.parse('2026-10-23T00:00:00-05:00');
function updateTogetherCounter() {
  const seconds = Math.max(0, Math.floor((Date.now() - togetherSince) / 1000));
  $('#togetherDays').textContent = String(Math.floor(seconds / 86400));
  $('#togetherHours').textContent = String(Math.floor(seconds / 3600) % 24).padStart(2, '0');
  $('#togetherMinutes').textContent = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
  $('#togetherSeconds').textContent = String(seconds % 60).padStart(2, '0');
}
updateTogetherCounter();
setInterval(updateTogetherCounter, 1000);
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function render() {
 const current = chapters[chapter];
 const spread = $('#spread');
 spread.dataset.author = current.color || '';
 $('#chapterLabel').textContent = current.author ? `Un recuerdo de ${current.author}` : `CAPÍTULO ${chapter + 1}`;
 $('#chapterTitle').textContent = current.title;
 $('#chapterText').replaceChildren(...current.text.map(text => {
   const paragraph = document.createElement('p');
   paragraph.textContent = text;
   return paragraph;
 }));
 $('#photoCaption').textContent = current.caption;
 $('#chapterCount').textContent = `${chapter + 1} / ${chapters.length}`;
 $('#pageNumber').textContent = String((chapter + 1) * 2).padStart(2, '0');
 $('#prev').disabled = chapter === 0;
 $('#next').disabled = chapter === chapters.length - 1;
 const photo = current.id ? current.photo : photos[chapter];
 $('#memoryImage').hidden = !photo;
 $('#photoEmpty').hidden = Boolean(photo);
 if (photo) $('#memoryImage').src = photo;
 else $('#memoryImage').removeAttribute('src');
 $('#photoEmpty b').textContent = current.id ? 'Un recuerdo para guardar' : 'Una foto, mil recuerdos';
 $('#photoEmpty small').textContent = current.id ? current.author : 'Toca para poner una foto de ustedes';
 const remove = $('#deleteMemory');
 if (remove) {
   remove.hidden = !current.id || current.color !== window.bookUser?.role;
   remove.dataset.id = current.id || '';
 }
 $('#dots').replaceChildren(...chapters.map((item, index) => {
   const button = document.createElement('button');
   button.className = index === chapter ? 'active' : '';
   button.ariaLabel = `Ir a ${item.title}`;
   button.setAttribute('aria-current', index === chapter ? 'page' : 'false');
   button.onclick = () => go(index);
   return button;
 }));
}
let busy=false;
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
async function go(i){
 if(busy||i<0||i>=chapters.length||i===chapter)return;
 const spread=$('#spread'),forward=i>chapter,mobile=window.matchMedia('(max-width:700px)').matches;
 if(reducedMotion()||!spread.animate){chapter=i;render();return}
 busy=true;spread.setAttribute('aria-busy','true');
 const sheet=document.createElement('div');sheet.className='turn-sheet '+(forward?'forward':'backward');sheet.setAttribute('aria-hidden','true');sheet.inert=true;
 sheet.style.setProperty('--paper',getComputedStyle(spread).getPropertyValue('--paper'));
 const old=(mobile?spread:$(forward?'.story-page':'.photo-page')).cloneNode(true);
 old.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));old.removeAttribute('id');old.classList.remove('spread');old.classList.add('sheet-content');sheet.append(old);
 chapter=i;render();spread.append(sheet);
 try{await sheet.animate([{transform:'rotateY(0deg)',filter:'brightness(1)'},{transform:`rotateY(${forward?-85:85}deg)`,filter:'brightness(.78)',offset:.6},{transform:`rotateY(${forward?-170:170}deg)`,filter:'brightness(.97)'}],{duration:850,easing:'cubic-bezier(.3,.05,.2,1)',fill:'forwards'}).finished}catch{}finally{sheet.remove();spread.removeAttribute('aria-busy');busy=false}
}
async function cover(){if(busy)return;busy=true;const reader=$('#reader');if(!reader.hidden&&!reducedMotion()&&reader.animate){try{await $('#spread').animate([{transform:'perspective(1600px) rotateY(0deg)'},{transform:'perspective(1600px) rotateY(14deg) scale(.94)',opacity:0}],{duration:400,easing:'ease-in'}).finished}catch{}}reader.hidden=true;$('#coverView').hidden=false;busy=false;window.scrollTo({top:0,behavior:reducedMotion()?'instant':'smooth'})}
$('#open').onclick=async()=>{if(busy)return;busy=true;const book=$('.cover');if(!reducedMotion()&&book.animate){try{await book.animate([{transform:'perspective(1400px) rotate(-3deg) rotateY(0deg)'},{transform:'perspective(1400px) rotate(-3deg) rotateY(-110deg)',opacity:0}],{duration:700,easing:'cubic-bezier(.4,0,.2,1)'}).finished}catch{}}$('#coverView').hidden=true;$('#reader').hidden=false;render();window.scrollTo({top:0,behavior:'instant'});if(!reducedMotion()&&$('#spread').animate)$('#spread').animate([{transform:'perspective(1600px) rotateX(7deg) scale(.94)',opacity:.5},{transform:'perspective(1600px) rotateX(0deg) scale(1)',opacity:1}],{duration:600,easing:'cubic-bezier(.16,1,.3,1)'});busy=false};$('#close').onclick=cover;$('#home').onclick=e=>{e.preventDefault();cover()};$('#prev').onclick=()=>go(chapter-1);$('#next').onclick=()=>go(chapter+1);document.addEventListener('keydown',e=>{if($('#reader').hidden||/INPUT|BUTTON/.test(e.target.tagName))return;if(e.key==='ArrowRight')go(chapter+1);if(e.key==='ArrowLeft')go(chapter-1)});$('#about').onclick=()=>toast('Una primera versión para llenar de sus fotos, canciones y recuerdos.');
let touchStart=null;$('#spread').addEventListener('touchstart',e=>{if(e.target.closest('button,label,input'))return;touchStart={x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY}},{passive:true});$('#spread').addEventListener('touchend',e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)go(chapter+(dx<0?1:-1))},{passive:true});
$('#photoInput').onchange=e=>{let file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/'))return toast('Elige un archivo de imagen.');if(photos[chapter])URL.revokeObjectURL(photos[chapter]);photos[chapter]=URL.createObjectURL(file);render();e.target.value=''};
function renderTracks(){$('#tracks').replaceChildren(...tracks.map((t,i)=>{let b=document.createElement('button');b.className='track'+(selected===i?' active':'');b.textContent=`${selected===i?'♪':String(i+1).padStart(2,'0')}   ${t.name}`;b.onclick=()=>select(i);return b}));$('#shuffle').disabled=!tracks.length}
async function select(i){selected=i;audio.src=tracks[i].url;$('#nowPlaying').textContent=tracks[i].name;$('#player');$('.player').hidden=false;renderTracks();try{await audio.play()}catch{toast('Toca reproducir para escuchar la canción.')}}
$('#audioFiles').onchange=e=>{const files=[...e.target.files].filter(f=>f.type.startsWith('audio/'));files.forEach(f=>tracks.push({name:f.name.replace(/\.[^.]+$/,''),url:URL.createObjectURL(f)}));if(!files.length)return toast('Elige archivos de audio para añadir canciones.');renderTracks();toast('Canciones añadidas para esta visita.');e.target.value=''};$('#shuffle').onclick=()=>{let options=tracks.map((_,i)=>i).filter(i=>i!==selected);select(options.length?options[Math.floor(Math.random()*options.length)]:0)};$('#play').onclick=()=>{if(audio.paused)audio.play().catch(()=>toast('No se pudo reproducir este archivo. Prueba con otro.'));else audio.pause()};audio.onplay=()=>{$('#play').textContent='Ⅱ';$('#play').ariaLabel='Pausar canción';$('#record').classList.add('playing')};audio.onpause=()=>{$('#play').textContent='▷';$('#play').ariaLabel='Reproducir canción';$('#record').classList.remove('playing')};audio.onerror=()=>toast('No se pudo leer la canción. Prueba con otro archivo de audio.');audio.onended=()=>{if(tracks.length>1)select((selected+1)%tracks.length)};$('#volume').oninput=e=>audio.volume=e.target.value;render();

if(tracks.length){renderTracks();document.querySelector('.local-note').textContent='Nuestra banda sonora, para volver a estos momentos.';}


window.bookApi = {
  refresh(memories) {
    const selectedId = chapters[chapter]?.id;
    chapters.splice(introductionCount, chapters.length - introductionCount, ...memories.map(memory => ({
      id: memory.id,
      color: memory.color,
      author: memory.author,
      title: memory.title,
      text: memory.body.split(/\n\s*\n/).filter(Boolean),
      caption: memory.author,
      photo: memory.has_photo ? window.bookEndpoint(`/api/memories/${memory.id}/photo`) : null
    })));
    const index = chapters.findIndex(item => item.id === selectedId);
    chapter = selectedId && index >= 0 ? index : Math.min(chapter, chapters.length - 1);
    render();
  },
  async show(id) {
    if ($('#reader').hidden) await $('#open').onclick();
    const index = chapters.findIndex(item => item.id === id);
    if (index >= 0) go(index);
  }
};

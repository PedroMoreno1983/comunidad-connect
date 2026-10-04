export function viewerHtml(session, PUBLIC_BASE_PATH = '') {
  const vncPath = `${PUBLIC_BASE_PATH.replace(/^\//, '')}/browser/${session.id}/websockify`;
  // Lower JPEG quality reduces screen traffic over residential connections.
  // Keep compression moderate to avoid trading bandwidth for excessive CPU.
  const vncUrl = `${PUBLIC_BASE_PATH}/browser/${session.id}/vnc.html?autoconnect=1&resize=off&view_clip=0&reconnect=1&quality=4&compression=2&path=${encodeURIComponent(vncPath)}`;
  const sessionPath = `${PUBLIC_BASE_PATH}/session/${session.id}`;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Carro seguro · ${session.store}</title>
  <style>
    :root{color-scheme:light;--ink:#17221d;--muted:#5d6b64;--line:#d9e2dd;--green:#176b45;--cream:#f4f1e8;--white:#fff;--danger:#a2382c}
    *{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto 1fr;background:var(--cream);color:var(--ink);font:15px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
    header{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,520px) auto;gap:18px;align-items:center;padding:12px 18px;background:var(--white);border-bottom:1px solid var(--line);box-shadow:0 2px 10px rgba(23,34,29,.08);z-index:2}
    .brand{display:flex;align-items:center;gap:10px;font-weight:800}.brand svg{width:30px;height:30px;color:var(--green)}.store{color:var(--green)}
    .status{min-width:0}.status-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px}.detail{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}.missing{margin-top:4px;font-size:12px;color:var(--amber,#b45309);white-space:normal}.host{font-size:11px;color:var(--muted);font-weight:400}progress{display:block;width:100%;height:8px;accent-color:var(--green)}
    .actions{display:flex;gap:8px}button{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--white);color:var(--ink);font:inherit;font-weight:750;cursor:pointer}button.primary{display:none;border-color:var(--green);background:var(--green);color:#fff}button.danger{color:var(--danger)}button:disabled{cursor:wait;opacity:.6}
    body{grid-template-rows:auto auto minmax(0,1fr) auto;height:100dvh}
    .view-controls{display:flex;gap:8px;align-items:center;padding:6px 12px;background:var(--white);flex-wrap:wrap}.view-controls button{padding:6px 10px;font-size:14px}.view-controls button[aria-pressed="true"]{background:var(--green);color:#fff}.view-hint{font-size:12px;color:var(--muted)}
    main{min-height:0;padding:0;display:flex}iframe{width:100%;height:100%;border:0;background:#e8ece9}
    .privacy{padding:5px 12px;background:var(--white);color:var(--muted);font-size:11px;border-top:1px solid var(--line)}
    @media(max-width:800px){header{grid-template-columns:1fr auto;gap:6px;padding:8px 12px}.status{grid-column:1/-1;grid-row:2}.brand span:first-of-type{display:none}.actions button{padding:8px}.detail{white-space:normal;max-height:42px}.view-hint{display:none}}
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h2l2.2 11.1a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L21 8H6"/></svg>
      <span>Carro seguro</span><span class="store">${session.store}</span>
      <!--
        En modo kiosco Chrome no muestra su barra de direcciones, asi que el
        dominio se muestra aca. Es mejor senal de confianza que la del navegador:
        esta cabecera es nuestra y la pagina de la tienda no puede falsificarla.
      -->
      <span class="host">${(session.config?.hosts || [])[0] || ''}</span>
    </div>
    <div class="status" aria-live="polite">
      <div class="status-row"><strong id="state">Iniciando…</strong><span id="counter">0 / ${session.total}</span></div>
      <div id="detail" class="detail">${session.detail}</div>
      <div id="missing" class="missing" hidden></div>
      <progress id="progress" max="${Math.max(1, session.total)}" value="0"></progress>
    </div>
    <div class="actions">
      <button id="resume" class="primary" type="button">Ya lo resolví · continuar</button>
      <button id="close" class="danger" type="button">Cerrar sesión</button>
    </div>
  </header>
  <nav class="view-controls" aria-label="Tamaño del navegador">
    <button id="actual" type="button" aria-pressed="true">Tamaño real</button>
    <button id="fit" type="button" aria-pressed="false">Ajustar a pantalla</button>
    <button id="fullscreen" type="button">Pantalla completa</button>
    <span class="view-hint">En tamaño real puedes desplazarte para ver el resto de la página.</span>
  </nav>
  <main><iframe id="browser" title="Navegador de compra de ${session.store}" src="${vncUrl}" allow="fullscreen; clipboard-read; clipboard-write"></iframe></main>
  <div class="privacy">Sesión temporal: Convive no registra tus teclas, contraseña ni datos de pago. Revisa productos y cantidades antes de pagar.</div>
  <script>
    const endpoint = ${JSON.stringify(sessionPath)};
    const state = document.querySelector('#state');
    const detail = document.querySelector('#detail');
    const missing = document.querySelector('#missing');
    const counter = document.querySelector('#counter');
    const progress = document.querySelector('#progress');
    const resume = document.querySelector('#resume');
    const close = document.querySelector('#close');
    const browser = document.querySelector('#browser');
    const actual = document.querySelector('#actual');
    const fit = document.querySelector('#fit');
    const fullscreen = document.querySelector('#fullscreen');
    function setView(mode){
      const url = new URL(browser.src);
      if(url.searchParams.get('resize')!==mode){url.searchParams.set('resize',mode);browser.src=url.toString();}
      actual.setAttribute('aria-pressed',String(mode==='off'));
      fit.setAttribute('aria-pressed',String(mode==='scale'));
    }
    actual.addEventListener('click',()=>setView('off'));
    fit.addEventListener('click',()=>setView('scale'));
    fullscreen.addEventListener('click',async()=>{
      try{
        if(document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      }catch{detail.textContent='Tu navegador no permite pantalla completa. Usa Tamaño real para leer sin reducir la página.';}
    });
    document.addEventListener('fullscreenchange',()=>{fullscreen.textContent=document.fullscreenElement?'Salir de pantalla completa':'Pantalla completa';});
    const labels = {starting:'Iniciando navegador',loading:'Cargando productos',needs_user:'Necesita tu ayuda',ready:'Carro listo',partial:'Revisión pendiente',failed:'No se pudo completar',closed:'Sesión cerrada'};
    async function refresh(){
      try{
        const response=await fetch(endpoint+'/status',{cache:'no-store'});
        if(!response.ok){state.textContent='Sesión finalizada';detail.textContent='La sesión expiró o se cerró. Vuelve a Convive y carga el carro otra vez.';resume.style.display='none';return;}
        const data=await response.json();
        state.textContent=labels[data.status]||data.status;
        // El total sale del carro de la tienda, no de nuestra estimacion: es el
        // numero que la persona va a pagar y conviene que lo vea antes.
        detail.textContent=(data.detail||'')+(data.cartTotal
          ?' · La tienda cobra $'+Number(data.cartTotal).toLocaleString('es-CL')
          :'');
        counter.textContent=String(data.current)+' / '+String(data.total)+' procesados';
        // Un carro con menos productos de los pedidos tiene que decir cuales
        // faltan. Callarlo obliga a la persona a contar en la caja.
        const faltan=Array.isArray(data.missingItems)?data.missingItems:[];
        missing.hidden=faltan.length===0;
        missing.textContent=faltan.length
          ?'Pendientes de verificar (producto o cantidad): '+faltan.join(', ')+'. Revisa el carro antes de continuar.'
          :'';
        progress.max=Math.max(1,data.total);progress.value=data.current;
        resume.style.display=data.status==='needs_user'?'inline-block':'none';
      }catch{detail.textContent='Reconectando con el navegador seguro…'}
    }
    resume.addEventListener('click',async()=>{resume.disabled=true;await fetch(endpoint+'/resume',{method:'POST'}).catch(()=>null);resume.disabled=false;refresh()});
    close.addEventListener('click',async()=>{close.disabled=true;await fetch(endpoint+'/close',{method:'POST'}).catch(()=>null);window.close();state.textContent='Sesión cerrada';detail.textContent='Ya puedes cerrar esta pestaña.'});
    refresh();setInterval(refresh,1500);
  </script>
</body>
</html>`;
}


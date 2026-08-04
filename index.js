// ESCUDOS GLOBALES ANTI-CRASH
process.on('uncaughtException', (err) => console.log('Error global evitado:', err.message));
process.on('unhandledRejection', (err) => console.log('Promesa rechazada evitada:', err.message));

const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');
const agente = require('./agente.js');

const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

agente.iniciar(db).catch(console.error);

const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

// ==========================================
// 🧠 MEMORIA Y ESTADOS DEL SISTEMA
// ==========================================
const pagosPendientes = new Map(); 
const intencionCompra = new Map(); 
const adminEstados = new Map(); 
const userEstados = new Map(); 
const baneados = new Set(); 

// Cargar baneados al iniciar
db.collection('blacklist').get().then(snap => snap.forEach(doc => baneados.add(parseInt(doc.id)))).catch(()=>{});

// --- SALUDO DINÁMICO ---
function obtenerSaludo() {
  const hora = parseInt(new Date().toLocaleString("es-VE", { timeZone: "America/Caracas", hour: '2-digit', hour12: false }));
  if (hora >= 5 && hora < 12) return "🌤️ ¡Buenos días";
  if (hora >= 12 && hora < 19) return "☀️ ¡Buenas tardes";
  return "🌙 ¡Buenas noches";
}

// ==========================================
// 🛡️ MIDDLEWARE: SOPORTE ESPEJO Y BLACKLIST
// ==========================================
botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder a este cliente", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `💬 *NUEVO MENSAJE DE SOPORTE*\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n\n*Dice:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(console.log);
    await ctx.deleteMessage().catch(()=>{}); // Efecto fantasma
    return ctx.reply('✅ _Tu mensaje fue enviado a la administración. Recibirás respuesta por aquí._', { parse_mode: 'Markdown' }).catch(()=>{});
  }
  return next();
});

// ==========================================
// 🛒 BOT TIENDA - MÓDULO DE USUARIOS
// ==========================================
const menuPrincipalUsuario = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Compras", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mis Suscripciones", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }, { text: "❓ Preguntas Frecuentes", callback_data: "menu_faq" }],
    [{ text: "🎧 Hablar con Administración", callback_data: "activar_soporte" }]
  ]
};

botTienda.start(async (ctx) => {
  userEstados.delete(ctx.from.id);
  intencionCompra.delete(ctx.from.id);
  
  try {
    const userRef = db.collection('usuarios').doc(ctx.from.id.toString());
    const doc = await userRef.get();
    if (!doc.exists) {
      await botAdmin.telegram.sendMessage(MI_ID, `🌟 *¡NUEVO CLIENTE EN LA TIENDA!*\n👤 Nombre: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🔗 @${ctx.from.username || 'SinUser'}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
    await userRef.set({ id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString() }, { merge: true });
  } catch (e) {}

  await ctx.deleteMessage().catch(()=>{});
  const bienvenida = `${obtenerSaludo()}, ${ctx.from.first_name}!* 👋\n\nBienvenido a tu tienda premium. 🚀\nOfrecemos servicios de alta calidad con garantía y soporte rápido.\n\nSelecciona una opción del menú para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(console.log);
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.delete(ctx.from.id);
  intencionCompra.delete(ctx.from.id);
  await ctx.editMessageText(`🏠 *Menú Principal*\nSelecciona la acción que deseas realizar:`, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_faq', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > ❓ *Preguntas Frecuentes*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n🔹 *¿Cuánto tarda la entrega?*\nR: Una vez envíes el comprobante, validamos tu pago y entregamos en un lapso de 5 a 15 minutos.\n\n🔹 *¿Qué pasa si mi pantalla deja de funcionar?*\nR: Escribe a nuestro soporte. Tienes garantía total durante tus 30 días, te la repondremos.\n\n🔹 *¿Puedo pagar desde otro banco?*\nR: Sí, vía Pago Móvil aceptamos transferencias desde cualquier banco nacional.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > 📜 *POLÍTICAS Y GARANTÍAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n1️⃣ **Soporte Total:** Garantía válida por los días exactos contratados.\n2️⃣ **Prohibiciones:** Queda ESTRICTAMENTE PROHIBIDO cambiar correos, contraseñas o perfiles. Si lo haces, pierdes la garantía inmediatamente.\n3️⃣ **Entrega:** Las cuentas se entregan solo tras la confirmación del pago por parte del administrador.\n\n_Al comprar, aceptas automáticamente estos términos._`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú Principal", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`🏠 Inicio > 👤 *MI PERFIL*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🪪 *Nombre:* ${ctx.from.first_name}\n🔑 *ID Sistema:* \`${ctx.from.id}\`\n\nConsulta tus compras realizadas:`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "🧾 Ver Mi Historial de Pagos", callback_data: "historial_pagos" }], 
      [{ text: "🔙 Volver al Menú Principal", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery('Buscando pagos...').catch(()=>{});
  let msj = `🏠 Inicio > 👤 Perfil > 🧾 *TU HISTORIAL DE COMPRAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `Aún no has realizado ninguna compra.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const fecha = new Date(p.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' });
        msj += `✅ *${p.servicio}* | 📅 ${fecha}\n💵 Costo: ${parseFloat(p.monto).toFixed(2)} ${p.moneda}\n\n`;
      });
    }
  } catch(e) { msj += `Error al cargar base de datos.`; }
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Regresar a Mi Perfil", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery('Cargando cuentas y vigencias...').catch(()=>{});
  let msj = `🏠 Inicio > ⭐ *MIS CUENTAS ACTIVAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) {
      msj += `No tienes servicios activos.\n¡Visita el catálogo y adquiere tu primer servicio!`;
    } else { 
      const hoy = new Date();
      snap.forEach(doc => { 
        const sub = doc.data(); 
        const fechaCorte = new Date(sub.fecha_corte);
        const diasRestantes = Math.ceil((fechaCorte - hoy) / (1000 * 60 * 60 * 24));
        
        let semaforo = '🟢';
        if (diasRestantes <= 3 && diasRestantes > 0) semaforo = '🟡 *(¡Pronto a vencer!)*';
        if (diasRestantes <= 0) semaforo = '🔴 *(Vencido)*';

        msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n⏳ *Vigencia:* ${semaforo} ${diasRestantes > 0 ? diasRestantes + ' días restantes' : ''}\n〰️〰️〰️〰️〰️〰️〰️〰️\n`; 
      }); 
    }
  } catch (error) { msj += `Error de red. Intenta más tarde.`; }
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🏠 Inicio > 🎧 *MODO SOPORTE ACTIVADO*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\nTodo lo que escribas aquí será enviado a la administración.\n\n_Escribe tu mensaje en el chat:_`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cancelar y Cerrar Chat", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const tUSDT = agente.tasas.usdt.toFixed(2);
  const tEUR = agente.tasas.euro.toFixed(2);
  const tBCV = agente.tasas.bcv.toFixed(2);

  let msj = `🏠 Inicio > 🛒 *CATÁLOGO DE SERVICIOS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  msj += `📈 *TASAS DEL DÍA (Referencia de 1$):*\n• USDT: ${tUSDT} Bs\n• EURO: ${tEUR} Bs\n• BCV: ${tBCV} Bs\n\n`;
  msj += `👇 *Selecciona el servicio que deseas:*`;

  let botones = [];
  for (let i = 0; i < agente.servicios.length; i += 2) {
    let fila = [{ text: agente.servicios[i].nombre, callback_data: `item_${agente.servicios[i].id}` }];
    if (agente.servicios[i + 1]) fila.push({ text: agente.servicios[i + 1].nombre, callback_data: `item_${agente.servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]);
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } }).catch(()=>{});
});

agente.servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    
    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const txt = `🏠 Inicio > 🛒 Catálogo > *${servicio.nombre}*\n〰️〰️〰️〰️〰️〰️〰️〰️\n⏳ *Duración:* ${servicio.duracion}\n\n` +
      `💵 *INVERSIÓN POR MONEDA:*\n` +
      `• BCV (Pago Móvil): *$${servicio.precio_bcv.toFixed(2)}* ➔ (${pBCV} Bs)\n` +
      `• USDT (Binance): *$${servicio.precio_usdt.toFixed(2)}* ➔ (${pUSDT} Bs)\n` +
      `• EURO (Zinli): *$${servicio.precio_euro.toFixed(2)}* ➔ (${pEUR} Bs)\n\n` +
      `Si deseas continuar, elige "Iniciar Pago":`;

    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "💳 Iniciar Pago", callback_data: `pago_${servicio.id}` }],
      [{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt, precio_euro: servicio.precio_euro, precio_bcv: servicio.precio_bcv,
    });
    
    await ctx.editMessageText(`🏠 Inicio > 💳 *MÉTODO DE PAGO*\n〰️〰️〰️〰️〰️〰️〰️〰️\nServicio: *${servicio.nombre}*\n\nSelecciona con qué moneda pagarás:`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `USDT TRC20`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
        [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Cancelar y Atrás", callback_data: `item_${servicio.id}` }]
      ]}
    }).catch(()=>{});
  });
});

botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  await ctx.answerCbQuery().catch(()=>{});
  let compra = intencionCompra.get(ctx.from.id);
  
  if (!compra) return ctx.editMessageText("❌ Sesión agotada. Inicia la compra de nuevo.", { reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] }}).catch(()=>{});
  
  compra.moneda = moneda;
  let montoBs = 0, montoDivisa = compra[`precio_${moneda.toLowerCase()}`];
  compra.venta = montoDivisa;
  compra.ganancia = (compra.venta - compra.costo).toFixed(2);

  // TEXTOS DE PAGO: SIEMPRE SE MUESTRA PAGO MÓVIL TAMBIÉN
  let textoPago = `🧾 *RESUMEN DE FACTURACIÓN*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🛒 *Servicio:* ${compra.servicio}\n\n_(Toca los datos bancarios para copiarlos)_\n\n`;
  const datosPagoMovil = `\n🏦 *Datos de Pago Móvil (Alternativa en BCV)*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\``;
  
  if (moneda === 'USDT') { 
    montoBs = (montoDivisa * agente.tasas.usdt).toFixed(2); 
    textoPago += `*PAGO EN USDT (Red TRC20)*\nDirección:\n\`TNCFjTLYp63k2ocAooAnTUJbodaWLrRQhh\`\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa.toFixed(2)} USDT*\n\n${datosPagoMovil}\n🇻🇪 *(Equivalente: ${montoBs} Bs)*`; 
  }
  if (moneda === 'EURO') { 
    montoBs = (montoDivisa * agente.tasas.euro).toFixed(2); 
    textoPago += `*PAGO EN ZINLI (EURO)*\nUsuario/Correo: \`wilmergabriellucenacrespo\`\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa.toFixed(2)} €*\n\n${datosPagoMovil}\n🇻🇪 *(Equivalente: ${montoBs} Bs)*`; 
  }
  if (moneda === 'BCV') { 
    montoBs = (montoDivisa * agente.tasas.bcv).toFixed(2); 
    textoPago += `*PAGO MÓVIL PRINCIPAL*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\`\n\n🇻🇪 *MONTO EXACTO A TRANSFERIR: ${montoBs} Bs*`; 
  }

  intencionCompra.set(ctx.from.id, compra);
  await ctx.editMessageText(`${textoPago}\n〰️〰️〰️〰️〰️〰️〰️〰️\n1️⃣ Realiza el pago exacto.\n2️⃣ Presiona el botón de abajo para subir el comprobante.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📤 Ya pagué (Subir Comprobante)", callback_data: "subir_pago" }],
      [{ text: "🔙 Elegir Otra Moneda", callback_data: `pago_${compra.id_servicio}` }],
      [{ text: "🏠 Cancelar Operación", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Enviar Comprobante*\n\nPor favor, adjunta y envía la foto de tu comprobante de pago en este chat ahora mismo.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar Compra", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// RECEPCIÓN DE COMPROBANTES 
botTienda.on('photo', async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  
  const compraData = intencionCompra.get(ctx.from.id);
  if (!compraData) {
    return ctx.reply("❌ *No tienes compras pendientes.*\nSelecciona un servicio en el catálogo primero.", { parse_mode: 'Markdown' }).catch(()=>{});
  }

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {});
  
  pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, fileId });

  await ctx.reply('✅ *Comprobante recibido con éxito.*\n\nNuestra administración lo está verificando. Tus datos de acceso llegarán por aquí en breve.', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú Principal", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});

  // Iconografía de Monedas
  let iconoMoneda = '🇻🇪';
  if(compraData.moneda === 'USDT') iconoMoneda = '🟢';
  if(compraData.moneda === 'EURO') iconoMoneda = '💶';

  const fichaAdmin = `🚨 *¡NUEVA ORDEN DE COMPRA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${iconoMoneda} ${compraData.moneda}\n💰 Ganancia Esperada: $${compraData.ganancia}`;
  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  }).catch(e => console.log("Fallo al enviar recibo al admin:", e.message));
  
  intencionCompra.delete(ctx.from.id);
});


// ==========================================
// 💼 BOT ADMINISTRADOR - PANEL MAESTRO (TODO RESTAURADO)
// ==========================================
function obtenerMenuAdmin() {
  return {
    inline_keyboard: [
      [{ text: "👥 Base de Clientes", callback_data: "admin_clientes" }, { text: "📊 Reportes de Ventas", callback_data: "admin_reportes" }],
      [{ text: "📦 Inventario", callback_data: "admin_inventario" }, { text: "⏳ Radar Vencimientos", callback_data: "admin_radar" }],
      [{ text: "📢 Difusión Masiva", callback_data: "admin_difusion" }, { text: "🛑 Banear Usuario", callback_data: "admin_banear" }],
      [{ text: "🔄 Tasas API", callback_data: "admin_tasas" }, { text: "✏️ Configurar Tasa Manual", callback_data: "admin_tasas_manual" }]
    ]
  };
}

const btnVolverAdmin = { inline_keyboard: [[{ text: "🔙 Volver al Panel de Control", callback_data: "admin_inicio" }]] };

botAdmin.start(async (ctx) => {
  if (ctx.from.id !== MI_ID) return;
  adminEstados.clear();
  await ctx.reply('👑 *PANEL DE CONTROL ADMINISTRATIVO*\n\nElige qué deseas gestionar hoy:', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  await ctx.editMessageText('👑 *PANEL DE CONTROL ADMINISTRATIVO*\n\nElige qué deseas gestionar hoy:', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

// --- FICHA DE CLIENTES ---
botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery('Consultando Firebase...').catch(()=>{});
  try {
    const snapshot = await db.collection('usuarios').orderBy('ultimo_inicio', 'desc').limit(5).get();
    
    let botonesClientes = [];
    snapshot.forEach(doc => {
      const u = doc.data(); 
      botonesClientes.push([{ text: `👤 ${u.nombre}`, callback_data: `ficha_${u.id}` }]);
    });
    botonesClientes.push([{ text: "🔙 Volver", callback_data: "admin_inicio" }]);

    await ctx.editMessageText(`👥 *BASE DE CLIENTES*\n\nTotal registrados: *${snapshot.size}* (Mostrando últimos 5)\nSelecciona un usuario para ver su ficha y contactarlo:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botonesClientes } }).catch(()=>{});
  } catch (error) { ctx.editMessageText('❌ Error al consultar.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
});

botAdmin.action(/ficha_(.+)/, async (ctx) => {
  const uId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  
  let msj = `👤 *FICHA DEL CLIENTE*\n🆔 ID: \`${uId}\`\n\n*Últimas Compras:*\n`;
  try {
    const snap = await db.collection('usuarios').doc(uId).collection('pagos').orderBy('fecha', 'desc').limit(3).get();
    if(snap.empty) msj += `_Sin compras registradas._\n`;
    else snap.forEach(doc => { msj += `• ${doc.data().servicio} (${doc.data().moneda})\n`; });
  } catch(e) {}

  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: "💬 Enviar Mensaje Directo", callback_data: `soporte_res_${uId}` }],
    [{ text: "🔙 Volver a Clientes", callback_data: "admin_clientes" }]
  ]}}).catch(()=>{});
});

// --- REPORTES FINANCIEROS (RESTAURADO) ---
botAdmin.action('admin_reportes', async (ctx) => {
  await ctx.answerCbQuery('Calculando base de datos...').catch(()=>{});
  let totalV = 0, totalG = 0, cantidad = 0;
  try {
    const snap = await db.collection('ventas').get();
    snap.forEach(doc => { const v = doc.data(); totalV += parseFloat(v.venta_usd||0); totalG += parseFloat(v.ganancia_usd||0); cantidad++; });
    await ctx.editMessageText(`📊 *GANANCIAS HISTÓRICAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🛒 Ventas Totales: *${cantidad}*\n💵 Ingresos Brutos: *$${totalV.toFixed(2)}*\n💎 Ganancia Neta: *$${totalG.toFixed(2)}*`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  } catch(e) { await ctx.editMessageText('❌ Error al cargar reportes.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
});

// --- TASAS ---
botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando Motor...').catch(()=>{});
  await agente.actualizarTasas();
  await ctx.editMessageText(`✅ *Tasas Actualizadas*\n\nUSDT: ${agente.tasas.usdt} Bs\nEURO: ${agente.tasas.euro} Bs\nBCV: ${agente.tasas.bcv} Bs`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_tasas_manual', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`✏️ *FIJAR TASA MANUALMENTE*\n\nEnvía un mensaje normal aquí con este formato (usa puntos):\n\n\`TASA BCV 40.50\`\n\`TASA USDT 42.10\`\n\`TASA EURO 45.00\``, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- HERRAMIENTAS ADICIONALES (RESTAURADO) ---
botAdmin.action('admin_inventario', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📦 *INVENTARIO PRECARGADO*\n\n_Módulo en construcción. Permitirá cargar cuentas para entrega automática al aprobar pagos._', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_radar', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('⏳ *RADAR DE VENCIMIENTOS*\n\n_Módulo en construcción. Escaneará Firebase y alertará clientes con cuentas por vencer en 3 días._', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_banear', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BANEADO');
  await ctx.editMessageText('🛑 *SISTEMA DE BLACKLIST*\n\nEnvía el ID numérico del usuario para bloquearlo. Para salir, envía CANCELAR.', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_difusion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DIFUSION');
  await ctx.editMessageText('📢 *DIFUSIÓN MASIVA*\n\nEscribe el mensaje que llegará a toda tu base de datos. Para salir, envía CANCELAR.', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- LÓGICA DE APROBACIÓN DE PAGOS (MEJORADA CON +30 DÍAS AUTOMÁTICOS) ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue aprobada o rechazada.', { show_alert: true }).catch(()=>{});

  adminEstados.set('ENTREGANDO', orden);

  // BORRA LA FOTO PARA NO HACER SPAM Y DEJA EL ESPACIO LIMPIO
  await ctx.deleteMessage().catch(()=>{});

  const plantilla = `Correo: \nClave: \nPin: `;
  const msg = `✅ *PAGO APROBADO (#${ordenId})*\n\n✍️ *Paso Final:* Copia la plantilla abajo, llénala y envíala. *El bot calculará automáticamente los 30 días de vigencia y lo añadirá al mensaje final.*\n\n\`${plantilla}\``;
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar Entrega", callback_data: "admin_inicio" }]] } }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden ya procesada.', { show_alert: true }).catch(()=>{});
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHubo un problema al verificar tu pago. Comunícate con Soporte desde el Menú Principal.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.deleteMessage().catch(()=>{}); 
  
  pagosPendientes.delete(ordenId);
  await ctx.answerCbQuery('Orden Rechazada exitosamente.').catch(()=>{}); // Toast Alert
});

botAdmin.action(/soporte_res_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('RESPONDIENDO_SOPORTE', targetId);
  await ctx.editMessageText(`✍️ *MODO RESPUESTA*\n\nEscribe el mensaje para el usuario.\n(Escribe CANCELAR para salir)`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});


// ==========================================
// 🛠️ MOTOR CEREBRAL DEL ADMIN (ESCUCHADOR DE TEXTOS COMPLETO)
// ==========================================
botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id !== MI_ID) return next();
  const texto = ctx.message.text;
  await ctx.deleteMessage().catch(()=>{}); // Borra el comando del admin para limpieza
  const estadoActual = adminEstados.get('accion');

  // 1️⃣ TASAS MANUAL 
  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valorStr = partes[2].replace(',', '.');
      const valor = parseFloat(valorStr);
      if (valor > 0 && ['BCV', 'USDT', 'EURO'].includes(moneda)) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *TASA ACTUALIZADA*\n${moneda} ha sido fijada en **${valor.toFixed(2)}**.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
      }
    }
    return ctx.reply('❌ Formato incorrecto. Ejemplo: `TASA BCV 40.50`', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // 2️⃣ DIFUSIÓN MASIVA (RESTAURADO)
  if (estadoActual === 'DIFUSION') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Acción cancelada.', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    const snap = await db.collection('usuarios').get();
    let enviados = 0;
    await ctx.reply('⏳ Enviando masivo...').catch(()=>{});
    for (let doc of snap.docs) {
      try { await botTienda.telegram.sendMessage(doc.id, `📢 *Anuncio Oficial*\n\n${texto}`, { parse_mode: 'Markdown' }); enviados++; } catch(e){}
    }
    return ctx.reply(`✅ Mensaje enviado a ${enviados} usuarios registrados.`, { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // 3️⃣ BANEOS (RESTAURADO)
  if (estadoActual === 'BANEADO') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    baneados.add(parseInt(texto));
    await db.collection('blacklist').doc(texto).set({ fecha: new Date().toISOString() }).catch(()=>{});
    return ctx.reply(`✅ Usuario con ID \`${texto}\` ha sido baneado permanentemente.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // 4️⃣ RESPONDER SOPORTE 
  if (adminEstados.has('RESPONDIENDO_SOPORTE')) {
    const targetId = adminEstados.get('RESPONDIENDO_SOPORTE');
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Respuesta cancelada.', { reply_markup: btnVolverAdmin }); }
    
    await botTienda.telegram.sendMessage(targetId, `👨‍💻 *Respuesta de Administración:*\n\n${texto}`, { parse_mode: 'Markdown' }).catch(()=>{});
    adminEstados.clear();
    return ctx.reply('✅ Respuesta enviada al cliente exitósamente.', { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // 5️⃣ ENVIAR DATOS DE LA CUENTA Y GENERAR HISTORIAL (+30 DÍAS)
  if (adminEstados.has('ENTREGANDO')) {
    if (texto.toUpperCase() === 'CANCELAR') {
      adminEstados.clear();
      return ctx.reply('❌ Entrega cancelada. El comprobante de la orden fue cerrado.', { reply_markup: btnVolverAdmin }).catch(()=>{});
    }

    const orden = adminEstados.get('ENTREGANDO');
    
    // Fechas dinámicas (+30 días automáticos)
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + 30);
    const strVencimiento = fechaVencimiento.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' });
    
    // Enviar mensaje hermoso al cliente
    const msjCliente = `🎉 *¡TU PAGO HA SIDO VERIFICADO Y APROBADO!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAquí tienes los accesos para tu cuenta de *${orden.compraData.servicio}*:\n\n${texto}\n\n⏳ *Válido hasta:* ${strVencimiento}\n\n💡 _Tip: Recuerda renovar 2 días antes de tu fecha de corte para no perder el servicio._\n\n_¡Gracias por preferirnos!_`;
    
    await botTienda.telegram.sendMessage(orden.userId, msjCliente, { parse_mode: 'Markdown' }).catch(()=>{});

    // Guardar en Firebase en la Ficha del Usuario
    const hoyISO = fechaActual.toISOString();
    const vencimientoISO = fechaVencimiento.toISOString();
    
    await db.collection('usuarios').doc(orden.userId.toString()).collection('suscripciones').add({ servicio: orden.compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, fecha_corte: vencimientoISO, estado: 'Activo' }).catch(()=>{});
    await db.collection('usuarios').doc(orden.userId.toString()).collection('pagos').add({ servicio: orden.compraData.servicio, monto: orden.compraData.venta, moneda: orden.compraData.moneda, fecha: hoyISO }).catch(()=>{});
    
    // Guardar en Ventas Globales para los Reportes
    await db.collection('ventas').doc(orden.ordenId).set({ ordenId: orden.ordenId, clienteId: orden.userId, servicio: orden.compraData.servicio, venta_usd: parseFloat(orden.compraData.venta), ganancia_usd: parseFloat(orden.compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    pagosPendientes.delete(orden.ordenId);
    return ctx.reply(`✅ *Cuenta Entregada Exitosamente.*\nTodos los historiales y reportes de base de datos fueron actualizados.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  return next();
});

// Iniciadores del sistema (Añadimos el Botón Menú Fijo de Telegram)
botTienda.launch().then(async () => {
  await botTienda.telegram.setMyCommands([{ command: 'start', description: 'Abrir Tienda / Menú Principal' }]).catch(()=>{});
  console.log("Tienda Premium Iniciada.");
}).catch(console.error);

botAdmin.launch().then(() => console.log("Panel Admin Iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Total Operativo'); });
server.listen(process.env.PORT || 3000);

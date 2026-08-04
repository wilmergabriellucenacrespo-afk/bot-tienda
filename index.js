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
let modoMantenimiento = false; // Variable global para Mantenimiento

// Cargar baneados al iniciar
db.collection('blacklist').get().then(snap => snap.forEach(doc => baneados.add(parseInt(doc.id)))).catch(()=>{});

function obtenerSaludo() {
  const hora = parseInt(new Date().toLocaleString("es-VE", { timeZone: "America/Caracas", hour: '2-digit', hour12: false }));
  if (hora >= 5 && hora < 12) return "🌤️ ¡Buenos días";
  if (hora >= 12 && hora < 19) return "☀️ ¡Buenas tardes";
  return "🌙 ¡Buenas noches";
}

// ==========================================
// 🛡️ MIDDLEWARE: MANTENIMIENTO, SOPORTE Y BLACKLIST
// ==========================================
botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder a este cliente", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `💬 *NUEVO MENSAJE DE SOPORTE*\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n\n*Dice:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(console.log);
    await ctx.deleteMessage().catch(()=>{}); 
    return ctx.reply('✅ _Tu mensaje fue enviado a la administración. Recibirás respuesta por aquí._', { parse_mode: 'Markdown' }).catch(()=>{});
  }

  // Recepción de Referencia Bancaria (TEXTO) en lugar de Foto
  if (ctx.message && ctx.message.text && intencionCompra.has(ctx.from.id) && !ctx.message.text.startsWith('/')) {
    const compraData = intencionCompra.get(ctx.from.id);
    const referencia = ctx.message.text;
    const ordenId = Math.floor(Math.random() * 100000).toString();
    await ctx.deleteMessage().catch(() => {});
    
    pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, refTexto: referencia });

    await ctx.reply('✅ *Referencia de Pago Recibida*\n\nNuestra administración está validando tu número de referencia. Tus accesos llegarán pronto.', {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú Principal", callback_data: "menu_inicio" }]] }
    }).catch(()=>{});

    let iconoMoneda = compraData.moneda === 'USDT' ? '🟢' : (compraData.moneda === 'EURO' ? '💶' : '🇻🇪');
    const fichaAdmin = `🚨 *ORDEN CON REFERENCIA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${iconoMoneda} ${compraData.moneda}\n💰 Ganancia: $${compraData.ganancia}\n\n📝 *NRO REFERENCIA / BILLETERA ENVIADA:*\n\`${referencia}\``;

    await botAdmin.telegram.sendMessage(MI_ID, fichaAdmin, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [
        [{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }],
        [{ text: "❌ Rechazar Pago", callback_data: `rechazar_${ordenId}` }]
      ]}
    }).catch(()=>{});
    
    intencionCompra.delete(ctx.from.id);
    return;
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
      await botAdmin.telegram.sendMessage(MI_ID, `🌟 *¡NUEVO CLIENTE REGISTRADO!*\n👤 Nombre: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🔗 @${ctx.from.username || 'SinUser'}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
    await userRef.set({ id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString() }, { merge: true });
  } catch (e) {}

  const bienvenida = `${obtenerSaludo()}, *${ctx.from.first_name}!* 👋\n\nBienvenido a tu tienda premium. 🚀\nOfrecemos servicios de alta calidad con garantía y soporte rápido.\n\nSelecciona una opción del menú para comenzar:`;
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
  const msj = `🏠 Inicio > ❓ *Preguntas Frecuentes*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n🔹 *¿Cuánto tarda la entrega?*\nR: Lapso de 5 a 15 minutos tras verificar pago.\n\n🔹 *¿Pantalla caída?*\nR: Escribe a soporte. Tienes garantía total.\n\n🔹 *¿Aceptan Pago Móvil desde otros bancos?*\nR: Sí, desde cualquier banco nacional.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > 📜 *POLÍTICAS Y GARANTÍAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n1️⃣ **Soporte Total:** Garantía válida por días exactos.\n2️⃣ **Prohibiciones:** NO cambiar correos, claves ni perfiles. Anula garantía.\n3️⃣ **Entrega:** Solo tras confirmación de pago.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`🏠 Inicio > 👤 *MI PERFIL*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🪪 *Nombre:* ${ctx.from.first_name}\n🔑 *ID Sistema:* \`${ctx.from.id}\``, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "🧾 Historial de Pagos", callback_data: "historial_pagos" }], 
      [{ text: "🔙 Volver", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery('Buscando...').catch(()=>{});
  let msj = `🏠 Inicio > 👤 Perfil > 🧾 *HISTORIAL DE COMPRAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `Aún no hay compras.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const fecha = new Date(p.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short' });
        msj += `✅ *${p.servicio}* | 📅 ${fecha}\n💵 Costo: ${parseFloat(p.monto).toFixed(2)} ${p.moneda}\n\n`;
      });
    }
  } catch(e) {}
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Regresar", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery('Cargando vigencias...').catch(()=>{});
  let msj = `🏠 Inicio > ⭐ *MIS CUENTAS ACTIVAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) msj += `No tienes servicios activos.`;
    else { 
      const hoy = new Date();
      snap.forEach(doc => { 
        const sub = doc.data(); 
        const diasRestantes = Math.ceil((new Date(sub.fecha_corte) - hoy) / (1000 * 60 * 60 * 24));
        let semaforo = diasRestantes <= 3 ? '🟡 (Por Vencer)' : '🟢';
        if (diasRestantes <= 0) semaforo = '🔴 (Vencido)';

        msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n⏳ *Vigencia:* ${semaforo} ${diasRestantes > 0 ? diasRestantes + ' días restantes' : ''}\n〰️〰️〰️〰️〰️〰️〰️〰️\n`; 
      }); 
    }
  } catch (error) {}
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🏠 Inicio > 🎧 *MODO SOPORTE ACTIVADO*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\nTodo lo que escribas aquí será enviado a la administración.\n_Escribe tu mensaje:_`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cancelar Chat", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  if(modoMantenimiento) {
    return ctx.editMessageText(`🚧 *TIENDA EN MANTENIMIENTO*\n\nEstamos reabasteciendo inventario o actualizando el sistema. Vuelve más tarde.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
  }

  const tUSDT = agente.tasas.usdt.toFixed(2);
  const tEUR = agente.tasas.euro.toFixed(2);
  const tBCV = agente.tasas.bcv.toFixed(2);

  let msj = `🏠 Inicio > 🛒 *CATÁLOGO*\n〰️〰️〰️〰️〰️〰️〰️〰️\n📈 *TASAS DEL DÍA (1$):*\n• USDT: ${tUSDT} Bs\n• EURO: ${tEUR} Bs\n• BCV: ${tBCV} Bs\n\n👇 *Selecciona:*`;

  let botones = [];
  for (let i = 0; i < agente.servicios.length; i += 2) {
    let fila = [{ text: agente.servicios[i].nombre, callback_data: `item_${agente.servicios[i].id}` }];
    if (agente.servicios[i + 1]) fila.push({ text: agente.servicios[i + 1].nombre, callback_data: `item_${agente.servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🔙 Volver", callback_data: "menu_inicio" }]);
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } }).catch(()=>{});
});

agente.servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const txt = `🏠 Inicio > 🛒 Catálogo > *${servicio.nombre}*\n〰️〰️〰️〰️〰️〰️〰️〰️\n⏳ *Duración:* ${servicio.duracion}\n\n` +
      `📈 *VALOR DE 1 DÓLAR HOY:*\n• BCV: ${agente.tasas.bcv.toFixed(2)} Bs\n• USDT: ${agente.tasas.usdt.toFixed(2)} Bs\n• EURO: ${agente.tasas.euro.toFixed(2)} Bs\n\n` +
      `💵 *INVERSIÓN TOTAL:*\n• BCV (Pago Móvil): *$${servicio.precio_bcv.toFixed(2)}* ➔ (${pBCV} Bs)\n• USDT (Binance): *$${servicio.precio_usdt.toFixed(2)}* ➔ (${pUSDT} Bs)\n• EURO (Zinli): *$${servicio.precio_euro.toFixed(2)}* ➔ (${pEUR} Bs)\n\n` +
      `Si deseas continuar, elige "Iniciar Pago":`;

    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "💳 Iniciar Pago", callback_data: `pago_${servicio.id}` }],
      [{ text: "🔙 Catálogo", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt, precio_euro: servicio.precio_euro, precio_bcv: servicio.precio_bcv,
    });
    
    await ctx.editMessageText(`💳 *MÉTODO DE PAGO*\n\nSelecciona con qué moneda pagarás *${servicio.nombre}*:`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `USDT TRC20 / Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
        [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Atrás", callback_data: `item_${servicio.id}` }]
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

  let textoPago = `🧾 *RESUMEN DE FACTURACIÓN*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🛒 *Servicio:* ${compra.servicio}\n\n_(Toca los datos bancarios para copiarlos)_\n\n`;
  const datosPagoMovil = `\n🏦 *Datos de Pago Móvil (Alternativa BCV)*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\``;
  
  if (moneda === 'USDT') { 
    montoBs = (montoDivisa * agente.tasas.usdt).toFixed(2); 
    textoPago += `*USDT (Red TRC20)*\nDirección:\n\`TNCFjTLYp63k2ocAooAnTUJbodaWLrRQhh\`\n\n💵 *MONTO EXACTO: ${montoDivisa.toFixed(2)} USDT*\n${datosPagoMovil}\n🇻🇪 *(Equivale: ${montoBs} Bs)*`; 
  }
  if (moneda === 'EURO') { 
    montoBs = (montoDivisa * agente.tasas.euro).toFixed(2); 
    textoPago += `*ZINLI (EURO)*\nCorreo: \`wilmergabriellucenacrespo\`\n\n💵 *MONTO EXACTO: ${montoDivisa.toFixed(2)} €*\n${datosPagoMovil}\n🇻🇪 *(Equivale: ${montoBs} Bs)*`; 
  }
  if (moneda === 'BCV') { 
    montoBs = (montoDivisa * agente.tasas.bcv).toFixed(2); 
    textoPago += `*PAGO MÓVIL PRINCIPAL*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\`\n\n🇻🇪 *MONTO EXACTO: ${montoBs} Bs*`; 
  }

  intencionCompra.set(ctx.from.id, compra);
  await ctx.editMessageText(`${textoPago}\n〰️〰️〰️〰️〰️〰️〰️〰️\n1️⃣ Realiza el pago exacto.\n2️⃣ Presiona abajo para subir comprobante o escribe tu número de referencia.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📤 Subir Comprobante Foto", callback_data: "subir_pago" }],
      [{ text: "🔙 Elegir Otra Moneda", callback_data: `pago_${compra.id_servicio}` }],
      [{ text: "🏠 Cancelar Operación", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Enviar Comprobante*\n\nAdjunta y envía la foto de tu pago en este chat. Si no tienes foto, escribe tu número de referencia.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// RECEPCIÓN FOTO
botTienda.on('photo', async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  const compraData = intencionCompra.get(ctx.from.id);
  if (!compraData) return ctx.reply("❌ *No tienes compras pendientes.*", { parse_mode: 'Markdown' }).catch(()=>{});

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {});
  
  pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, fileId });

  await ctx.reply('✅ *Comprobante recibido*\n\nAdministración verificando. Tus accesos se anclarán aquí pronto.', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú Principal", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});

  let iconoMoneda = compraData.moneda === 'USDT' ? '🟢' : (compraData.moneda === 'EURO' ? '💶' : '🇻🇪');
  const fichaAdmin = `🚨 *¡NUEVA ORDEN DE COMPRA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${iconoMoneda} ${compraData.moneda}\n💰 Ganancia: $${compraData.ganancia}`;

  try {
    const linkFoto = await ctx.telegram.getFileLink(fileId);
    await botAdmin.telegram.sendPhoto(MI_ID, { url: linkFoto.href }, {
      caption: fichaAdmin, parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }], [{ text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
    });
  } catch (e) {
    await botAdmin.telegram.sendMessage(MI_ID, fichaAdmin + "\n⚠️ *(Foto en chat de tienda)*", {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }], [{ text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
    }).catch(()=>{});
  }
  intencionCompra.delete(ctx.from.id);
});

// ==========================================
// 💼 BOT ADMINISTRADOR - PANEL TOTAL
// ==========================================
function obtenerMenuAdmin() {
  return {
    inline_keyboard: [
      [{ text: "👥 Clientes (Pag.)", callback_data: "admin_clientes_0" }, { text: "🔍 Buscar Cliente", callback_data: "admin_buscar_inicio" }],
      [{ text: "📊 Reportes y Contabilidad", callback_data: "admin_menu_reportes" }],
      [{ text: "⏳ Radar de Vencimientos", callback_data: "admin_radar" }, { text: `🚧 Mantenimiento: ${modoMantenimiento?'ON':'OFF'}`, callback_data: "admin_mantenimiento" }],
      [{ text: "📢 Difusión Masiva", callback_data: "admin_difusion" }, { text: "🛑 Menú Baneos", callback_data: "admin_menu_baneos" }],
      [{ text: "🔄 Tasas API", callback_data: "admin_tasas" }, { text: "✏️ Tasas Manual", callback_data: "admin_tasas_manual" }]
    ]
  };
}
const btnVolverAdmin = { inline_keyboard: [[{ text: "🔙 Volver al Menú Central", callback_data: "admin_inicio" }]] };

botAdmin.start(async (ctx) => {
  if (ctx.from.id !== MI_ID) return;
  adminEstados.clear();
  await ctx.reply('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  await ctx.editMessageText('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

// --- MANTENIMIENTO Y BUSCADOR ---
botAdmin.action('admin_mantenimiento', async (ctx) => {
  modoMantenimiento = !modoMantenimiento;
  await ctx.answerCbQuery(`Mantenimiento ${modoMantenimiento ? 'Activado' : 'Desactivado'}`).catch(()=>{});
  await ctx.editMessageText('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

botAdmin.action('admin_buscar_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BUSCAR_CLIENTE');
  await ctx.editMessageText(`🔍 *BUSCADOR DE CLIENTES*\n\nEnvía el ID numérico del cliente para localizar su ficha al instante.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- CLIENTES CON PAGINADO ---
botAdmin.action(/admin_clientes_(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const limit = 10;
  await ctx.answerCbQuery('Consultando BD...').catch(()=>{});
  try {
    const snapshot = await db.collection('usuarios').orderBy('ultimo_inicio', 'desc').offset(page).limit(limit).get();
    let botonesClientes = [];
    snapshot.forEach(doc => { const u = doc.data(); botonesClientes.push([{ text: `👤 ${u.nombre}`, callback_data: `ficha_${u.id}` }]); });
    let navRow = [];
    if (page > 0) navRow.push({ text: "⬅️ Ant.", callback_data: `admin_clientes_${Math.max(0, page - limit)}` });
    if (snapshot.size === limit) navRow.push({ text: "Sig. ➡️", callback_data: `admin_clientes_${page + limit}` });
    if (navRow.length > 0) botonesClientes.push(navRow);
    botonesClientes.push([{ text: "🔙 Volver", callback_data: "admin_inicio" }]);

    await ctx.editMessageText(`👥 *BASE DE CLIENTES*\nPagina: ${Math.floor(page/limit)+1}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botonesClientes } }).catch(()=>{});
  } catch (error) { ctx.editMessageText('❌ Error al consultar.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
});

botAdmin.action(/ficha_(.+)/, async (ctx) => {
  const uId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `👤 *FICHA TÉCNICA DEL CLIENTE*\n🆔 ID: \`${uId}\`\n\n⭐ *Suscripciones Actuales:*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(uId).collection('suscripciones').orderBy('fecha_corte', 'desc').limit(5).get();
    if(snap.empty) msj += `_Sin suscripciones._\n`;
    else {
      snap.forEach(doc => { 
        const sub = doc.data();
        const fIn = new Date(sub.fecha_compra).toLocaleDateString('es-VE');
        const fCo = new Date(sub.fecha_corte).toLocaleDateString('es-VE');
        msj += `📺 *${sub.servicio}* (${sub.estado})\n📅 Inició: ${fIn} | ⌛ Vence: ${fCo}\n`; 
      });
    }
  } catch(e) {}
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💬 Enviar Mensaje", callback_data: `soporte_res_${uId}` }], [{ text: "🔙 Clientes", callback_data: "admin_clientes_0" }]]}}).catch(()=>{});
});

// --- MENÚ DE REPORTES AVANZADO ---
botAdmin.action('admin_menu_reportes', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const botonesRep = { inline_keyboard: [
    [{ text: "📊 Reporte Histórico Total", callback_data: "rep_historico" }, { text: "💵 Corte Diario (Hoy)", callback_data: "rep_hoy" }],
    [{ text: "🔥 Top Clientes VIP", callback_data: "rep_vip" }, { text: "📈 Rentabilidad por Serv.", callback_data: "rep_renta" }],
    [{ text: "📥 Exportar Ventas a CSV", callback_data: "rep_csv" }, { text: "💾 Respaldar BD (JSON)", callback_data: "rep_json" }],
    [{ text: "🔙 Volver al Menú Central", callback_data: "admin_inicio" }]
  ]};
  await ctx.editMessageText(`📊 *ÁREA CONTABLE Y REPORTES*\nSelecciona el análisis que deseas ver:`, { parse_mode: 'Markdown', reply_markup: botonesRep }).catch(()=>{});
});

botAdmin.action('rep_historico', async (ctx) => {
  await ctx.answerCbQuery('Calculando...').catch(()=>{});
  let totalV = 0, totalG = 0, count = 0;
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { totalV += doc.data().venta_usd; totalG += doc.data().ganancia_usd; count++; });
  await ctx.editMessageText(`📊 *HISTÓRICO TOTAL*\n🛒 Ventas: ${count}\n💵 Bruto: $${totalV.toFixed(2)}\n💎 Neta: $${totalG.toFixed(2)}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_hoy', async (ctx) => {
  await ctx.answerCbQuery('Calculando...').catch(()=>{});
  let totalV = 0, totalG = 0, count = 0;
  const hoyStr = new Date().toISOString().split('T')[0];
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { 
    if(doc.data().fecha_venta.startsWith(hoyStr)) { totalV += doc.data().venta_usd; totalG += doc.data().ganancia_usd; count++; }
  });
  await ctx.editMessageText(`💵 *CORTE DE CAJA (HOY)*\n🛒 Ventas Hoy: ${count}\n💵 Ingreso Hoy: $${totalV.toFixed(2)}\n💎 Ganancia Hoy: $${totalG.toFixed(2)}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_vip', async (ctx) => {
  await ctx.answerCbQuery('Escaneando clientes...').catch(()=>{});
  let clientes = {};
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); clientes[v.clienteId] = (clientes[v.clienteId] || 0) + v.venta_usd; });
  const sorted = Object.entries(clientes).sort((a,b) => b[1] - a[1]).slice(0, 5);
  let msj = `🔥 *TOP 5 CLIENTES VIP*\n`;
  sorted.forEach((c, i) => { msj += `${i+1}️⃣ ID: \`${c[0]}\` - Gastó: $${c[1].toFixed(2)}\n`; });
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_renta', async (ctx) => {
  await ctx.answerCbQuery('Calculando rentabilidad...').catch(()=>{});
  let rent = {};
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); rent[v.servicio] = (rent[v.servicio] || 0) + v.ganancia_usd; });
  const sorted = Object.entries(rent).sort((a,b) => b[1] - a[1]);
  let msj = `📈 *RENTABILIDAD POR SERVICIO*\n`;
  sorted.forEach(c => { msj += `• *${c[0]}*: $${c[1].toFixed(2)} Neta\n`; });
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_csv', async (ctx) => {
  await ctx.answerCbQuery('Generando Excel...').catch(()=>{});
  let csv = 'OrdenID,ClienteID,Servicio,MontoUSD,GananciaUSD,Fecha\n';
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); csv += `${v.ordenId},${v.clienteId},${v.servicio},${v.venta_usd},${v.ganancia_usd},${v.fecha_venta}\n`; });
  await botAdmin.telegram.sendDocument(MI_ID, { source: Buffer.from(csv), filename: 'Reporte_Ventas.csv' }, { caption: "📥 Archivo Excel Generado" }).catch(()=>{});
});

botAdmin.action('rep_json', async (ctx) => {
  await ctx.answerCbQuery('Respaldando...').catch(()=>{});
  const snap = await db.collection('usuarios').get();
  let obj = [];
  snap.forEach(doc => { obj.push(doc.data()); });
  await botAdmin.telegram.sendDocument(MI_ID, { source: Buffer.from(JSON.stringify(obj, null, 2)), filename: 'Respaldo_Usuarios.json' }, { caption: "💾 Respaldo BD Generado" }).catch(()=>{});
});

// --- RADAR DE VENCIMIENTOS ---
botAdmin.action('admin_radar', async (ctx) => {
  await ctx.answerCbQuery('Escaneando cuentas...').catch(()=>{});
  let msj = `⏳ *RADAR DE VENCIMIENTOS (<= 3 DÍAS)*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  let hayCuentas = false;
  try {
    const users = await db.collection('usuarios').get();
    for (let user of users.docs) {
      const subs = await user.ref.collection('suscripciones').where('estado', '==', 'Activo').get();
      subs.forEach(docSub => {
        const sub = docSub.data();
        const dias = Math.ceil((new Date(sub.fecha_corte) - new Date()) / (1000 * 60 * 60 * 24));
        if(dias <= 3 && dias > 0) {
          msj += `⚠️ *${sub.servicio}* (Vence en ${dias} días)\n👤 Cliente ID: \`${user.id}\`\n\n`;
          hayCuentas = true;
        }
      });
    }
    if(!hayCuentas) msj += `No hay cuentas a punto de vencer.`;
  } catch(e) {}
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- MENU BANEOS ---
botAdmin.action('admin_menu_baneos', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('🛑 *SISTEMA DE BLACKLIST*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: "🚫 Banear Cliente", callback_data: "admin_banear" }, { text: "🔓 Desbanear", callback_data: "admin_unban" }],
    [{ text: "🔙 Volver", callback_data: "admin_inicio" }]
  ] } }).catch(()=>{});
});

botAdmin.action('admin_banear', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BANEADO');
  await ctx.editMessageText('🚫 Envía el ID numérico del usuario para BLOQUEARLO.', { reply_markup: btnVolverAdmin }).catch(()=>{});
});
botAdmin.action('admin_unban', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DESBANEAR');
  await ctx.editMessageText('🔓 Envía el ID numérico del usuario para PERDONARLO.', { reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_difusion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DIFUSION');
  await ctx.editMessageText('📢 Escribe el mensaje masivo (O envía CANCELAR).', { reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando Motor...').catch(()=>{});
  await agente.actualizarTasas();
  await ctx.editMessageText(`✅ *Tasas Actualizadas*\nUSDT: ${agente.tasas.usdt}\nEURO: ${agente.tasas.euro}\nBCV: ${agente.tasas.bcv}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});
botAdmin.action('admin_tasas_manual', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`✏️ Formato: \`TASA BCV 40.50\``, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- APROBACIÓN DE ÓRDENES ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue aprobada/rechazada.', { show_alert: true }).catch(()=>{});
  adminEstados.set('ENTREGANDO', orden);
  await ctx.deleteMessage().catch(()=>{});
  const msg = `✅ *APROBANDO ORDEN #${ordenId}*\n\nCopia, llena y envía:\n\n\`Correo: \nClave: \nPin: \``;
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar Entrega", callback_data: "admin_inicio" }]] } }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden ya procesada.', { show_alert: true }).catch(()=>{});
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nVerifica tu pago y contacta a Soporte.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.deleteMessage().catch(()=>{}); 
  pagosPendientes.delete(ordenId);
  await ctx.answerCbQuery('Rechazada exitosamente.').catch(()=>{}); 
});

botAdmin.action(/soporte_res_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('RESPONDIENDO_SOPORTE', targetId);
  await ctx.editMessageText(`✍️ Escribe tu respuesta para el cliente.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// ==========================================
// 🛠️ MOTOR CEREBRAL DEL ADMIN (TEXTOS)
// ==========================================
botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id !== MI_ID) return next();
  const texto = ctx.message.text;
  await ctx.deleteMessage().catch(()=>{}); 
  const estadoActual = adminEstados.get('accion');

  // BUSCADOR CLIENTE
  if (estadoActual === 'BUSCAR_CLIENTE') {
    adminEstados.clear();
    const uId = texto.trim();
    const doc = await db.collection('usuarios').doc(uId).get();
    if(!doc.exists) return ctx.reply(`❌ Cliente ID no encontrado.`, { reply_markup: btnVolverAdmin }).catch(()=>{});
    
    let msj = `👤 *FICHA DEL CLIENTE*\n🆔 ID: \`${uId}\`\n🪪 Nombre: ${doc.data().nombre}\n`;
    const snap = await db.collection('usuarios').doc(uId).collection('suscripciones').orderBy('fecha_corte', 'desc').limit(2).get();
    if(!snap.empty) snap.forEach(d => { msj += `• ${d.data().servicio} (${d.data().estado})\n`; });
    
    return ctx.reply(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💬 Enviar Mensaje Directo", callback_data: `soporte_res_${uId}` }], [{ text: "🔙 Volver", callback_data: "admin_inicio" }]]}}).catch(()=>{});
  }

  // TASA MANUAL
  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valor = parseFloat(partes[2].replace(',', '.'));
      if (valor > 0 && ['BCV', 'USDT', 'EURO'].includes(moneda)) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *TASA FIJADA:* ${moneda} = ${valor}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
      }
    }
  }

  // DIFUSIÓN
  if (estadoActual === 'DIFUSION') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Acción cancelada.', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    const snap = await db.collection('usuarios').get();
    let enviados = 0;
    await ctx.reply('⏳ Enviando...').catch(()=>{});
    for (let doc of snap.docs) { try { await botTienda.telegram.sendMessage(doc.id, `📢 *Anuncio*\n\n${texto}`, { parse_mode: 'Markdown' }); enviados++; } catch(e){} }
    return ctx.reply(`✅ Mensaje enviado a ${enviados} usuarios.`, { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // BANEAR / DESBANEAR
  if (estadoActual === 'BANEADO' || estadoActual === 'DESBANEAR') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    const cleanId = parseInt(texto);
    if(estadoActual === 'BANEADO') {
      baneados.add(cleanId);
      await db.collection('blacklist').doc(texto).set({ fecha: new Date().toISOString() }).catch(()=>{});
      return ctx.reply(`✅ Usuario \`${texto}\` BANEADO.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
    } else {
      baneados.delete(cleanId);
      await db.collection('blacklist').doc(texto).delete().catch(()=>{});
      return ctx.reply(`✅ Usuario \`${texto}\` DESBANEADO.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
    }
  }

  // SOPORTE
  if (adminEstados.has('RESPONDIENDO_SOPORTE')) {
    const targetId = adminEstados.get('RESPONDIENDO_SOPORTE');
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado.', { reply_markup: btnVolverAdmin }); }
    await botTienda.telegram.sendMessage(targetId, `👨‍💻 *Respuesta de Administración:*\n\n${texto}`, { parse_mode: 'Markdown' }).catch(()=>{});
    adminEstados.clear();
    return ctx.reply('✅ Respuesta enviada.', { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // ENTREGA Y ANCLAJE
  if (adminEstados.has('ENTREGANDO')) {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Entrega cancelada.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
    const orden = adminEstados.get('ENTREGANDO');
    
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + 30);
    
    const strInicio = fechaActual.toLocaleDateString('es-VE');
    const strVencimiento = fechaVencimiento.toLocaleDateString('es-VE');
    
    const msjCliente = `🎉 *¡TU PAGO HA SIDO APROBADO!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAquí están los accesos de tu cuenta de *${orden.compraData.servicio}*:\n\n${texto}\n\n📅 *Inicio:* ${strInicio}\n⌛ *Corte:* ${strVencimiento}\n⏳ *RESTANTE:* 30 Días 🟢\n\n_¡Gracias por tu compra! Este mensaje quedará anclado aquí._`;
    
    let sentMsg = await botTienda.telegram.sendMessage(orden.userId, msjCliente, { parse_mode: 'Markdown' }).catch(()=>{});
    if (sentMsg) await botTienda.telegram.pinChatMessage(orden.userId, sentMsg.message_id).catch(()=>{});

    const hoyISO = fechaActual.toISOString();
    const vencimientoISO = fechaVencimiento.toISOString();
    const msgIdParaGuardar = sentMsg ? sentMsg.message_id : null;
    
    await db.collection('usuarios').doc(orden.userId.toString()).collection('suscripciones').add({ servicio: orden.compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, fecha_corte: vencimientoISO, estado: 'Activo', pinned_msg_id: msgIdParaGuardar }).catch(()=>{});
    await db.collection('usuarios').doc(orden.userId.toString()).collection('pagos').add({ servicio: orden.compraData.servicio, monto: orden.compraData.venta, moneda: orden.compraData.moneda, fecha: hoyISO }).catch(()=>{});
    await db.collection('ventas').doc(orden.ordenId).set({ ordenId: orden.ordenId, clienteId: orden.userId, servicio: orden.compraData.servicio, venta_usd: parseFloat(orden.compraData.venta), ganancia_usd: parseFloat(orden.compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    pagosPendientes.delete(orden.ordenId);
    return ctx.reply(`✅ *Cuenta Entregada y Mensaje Anclado.*`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }
  return next();
});

// ==========================================
// ⏱️ ACTUALIZADOR DIARIO DE CUENTAS REGRESIVAS
// ==========================================
async function actualizarCuentasRegresivas() {
  try {
    const usersSnap = await db.collection('usuarios').get();
    for (let userDoc of usersSnap.docs) {
      const subsSnap = await userDoc.ref.collection('suscripciones').where('estado', '==', 'Activo').get();
      for (let docSub of subsSnap.docs) {
        const sub = docSub.data();
        if (sub.pinned_msg_id) {
          const diasRestantes = Math.ceil((new Date(sub.fecha_corte) - new Date()) / (1000 * 60 * 60 * 24));
          if (diasRestantes > 0) {
            let semaforo = diasRestantes <= 3 ? '🟡 (Por Vencer)' : '🟢';
            const strIn = new Date(sub.fecha_compra).toLocaleDateString('es-VE');
            const strVn = new Date(sub.fecha_corte).toLocaleDateString('es-VE');
            const msj = `🎉 *¡SUSCRIPCIÓN ACTIVA!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAccesos de *${sub.servicio}*:\n\n${sub.datos_acceso}\n\n📅 *Inicio:* ${strIn}\n⌛ *Corte:* ${strVn}\n⏳ *RESTANTE:* ${diasRestantes} Días ${semaforo}`;
            await botTienda.telegram.editMessageText(userDoc.id, sub.pinned_msg_id, null, msj, { parse_mode: 'Markdown' }).catch(()=>{});
          } else {
            await docSub.ref.update({ estado: 'Vencido' }).catch(()=>{});
            await botTienda.telegram.unpinChatMessage(userDoc.id, sub.pinned_msg_id).catch(()=>{});
            await botTienda.telegram.sendMessage(userDoc.id, `⚠️ *Suscripción Vencida*\nTu servicio de *${sub.servicio}* ha expirado.`, { parse_mode: 'Markdown' }).catch(()=>{});
          }
        }
      }
    }
  } catch (e) {}
}
setInterval(actualizarCuentasRegresivas, 6 * 60 * 60 * 1000);

// Iniciadores del sistema
botTienda.launch().then(async () => {
  await botTienda.telegram.setMyCommands([{ command: 'start', description: '🏠 Abrir Tienda Principal' }]).catch(()=>{});
  console.log("Tienda Premium Iniciada.");
}).catch(console.error);

botAdmin.launch().then(() => console.log("Panel Admin Iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Total Operativo'); });
server.listen(process.env.PORT || 3000);

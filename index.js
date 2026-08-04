// ESCUDOS GLOBALES
process.on('uncaughtException', (err) => console.log('Error global evitado:', err.message));
process.on('unhandledRejection', (err) => console.log('Promesa rechazada evitada:', err.message));

const { Telegraf, Markup } = require('telegraf');
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
db.collection('blacklist').get().then(snap => snap.forEach(doc => baneados.add(parseInt(doc.id))));

// ==========================================
// 🛡️ MIDDLEWARE: SISTEMA DE BANEOS Y SOPORTE ESPEJO
// ==========================================
botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder al Cliente", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `💬 *SOPORTE NUEVO*\n👤 Cliente: ${ctx.from.first_name} (@${ctx.from.username || 'SinUser'})\n🆔 ID: \`${ctx.from.id}\`\n\n*Mensaje:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(()=>{});
    return ctx.reply('✅ _Mensaje enviado a administración. Te responderemos por aquí mismo en breve._', { parse_mode: 'Markdown' }).catch(()=>{});
  }
  return next();
});

// ==========================================
// 🛒 BOT TIENDA
// ==========================================
const menuPrincipal = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Precios", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mis Suscripciones", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas", callback_data: "menu_politicas" }],
    [{ text: "🎧 Chat de Soporte Directo", callback_data: "activar_soporte" }]
  ]
};

botTienda.start(async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  userEstados.delete(ctx.from.id);
  
  const userRef = db.collection('usuarios').doc(ctx.from.id.toString());
  const doc = await userRef.get();
  
  // ALERTA DE NUEVO USUARIO
  if (!doc.exists) {
    await botAdmin.telegram.sendMessage(MI_ID, `🌟 *¡NUEVO CLIENTE REGISTRADO!*\n👤 Nombre: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🔗 Usuario: @${ctx.from.username || 'SinUser'}`, { parse_mode: 'Markdown' }).catch(()=>{});
  }

  await userRef.set({
    id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString()
  }, { merge: true }).catch(()=>{});

  const bienvenida = `👋 ¡Hola ${ctx.from.first_name}! Bienvenido a tu proveedor de confianza.\n\nSelecciona una opción para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipal }).catch(()=>{});
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.delete(ctx.from.id);
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal }).catch(()=>{});
});

// --- PERFIL E HISTORIAL DE PAGOS (EL QUE PEDISTE) ---
botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`👤 *MI PERFIL*\n\n*Nombre:* ${ctx.from.first_name}\n*ID Sistema:* \`${ctx.from.id}\`\n*Estado:* Activo ✅`, {
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [
      [{ text: "🧾 Ver Mi Historial de Pagos", callback_data: "historial_pagos" }], 
      [{ text: "🔙 Volver", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `🧾 *TU HISTORIAL DE PAGOS*\n\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `No tienes pagos registrados aún.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
        const fecha = new Date(p.fecha).toLocaleString('es-VE', opcionesFecha);
        msj += `✅ *${p.servicio}* | ${fecha}\nMonto: ${p.monto} ${p.moneda}\n\n`;
      });
    }
  } catch(e) { msj += `Error al cargar historial.`; }
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

// --- SOPORTE ---
botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🎧 *CHAT DE SOPORTE*\n\nHas entrado al chat directo. Todo lo que escribas a partir de ahora será leído por un administrador.\n\n_Escribe tu mensaje o duda abajo:_`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cerrar Chat y Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

// --- SUSCRIPCIONES ---
botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `⭐ *MIS SUSCRIPCIONES*\n\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) msj += `Actualmente no posees servicios activos.`;
    else {
      snap.forEach(doc => {
        const sub = doc.data();
        msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n_Vence: ${sub.vence || 'No definida'}_\n\n`;
      });
    }
  } catch (error) { msj += `Error al cargar datos.`; }
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// --- CATÁLOGO ---
botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let botones = [];
  for (let i = 0; i < agente.servicios.length; i += 2) {
    let fila = [{ text: agente.servicios[i].nombre, callback_data: `item_${agente.servicios[i].id}` }];
    if (agente.servicios[i + 1]) fila.push({ text: agente.servicios[i + 1].nombre, callback_data: `item_${agente.servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]);
  await ctx.editMessageText('📺 *Catálogo de Servicios Premium*\n\nSelecciona el servicio que deseas adquirir:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } }).catch(()=>{});
});

agente.servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const txt = `*${servicio.nombre}*\n⏳ *Duración:* ${servicio.duracion}\n\n💵 *PRECIO DEL SERVICIO:*\n• Pago Móvil: *${pBCV} Bs*\n• Binance: *${pUSDT} Bs*\n• Zinli: *${pEUR} Bs*\n\nSi deseas adquirir este servicio, presiona "Realizar Pago":`;
    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "💳 Realizar Pago", callback_data: `pago_${servicio.id}` }],
      [{ text: "🔙 Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt, precio_euro: servicio.precio_euro, precio_bcv: servicio.precio_bcv,
    });
    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `USDT Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
        [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Atrás", callback_data: `item_${servicio.id}` }, { text: "🏠 Menú Principal", callback_data: "menu_inicio" }]
      ]}
    }).catch(()=>{});
  });
});

botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  await ctx.answerCbQuery().catch(()=>{});
  let compra = intencionCompra.get(ctx.from.id);
  
  if (!compra) return ctx.editMessageText("Sesión agotada. Por favor vuelve al catálogo.", { reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] }}).catch(()=>{});
  
  compra.moneda = moneda;
  let montoBs = 0, montoDivisa = compra[`precio_${moneda.toLowerCase()}`];
  compra.venta = montoDivisa;
  compra.ganancia = (compra.venta - compra.costo).toFixed(2);

  let textoPago = `🏦 *DATOS PARA PAGO EN ${moneda}*\n\n`;
  if (moneda === 'BCV') { montoBs = (montoDivisa * agente.tasas.bcv).toFixed(2); textoPago += `*Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: 04262333684\nCédula: V-27145645\n\n🇻🇪 *MONTO EXACTO A TRANSFERIR: ${montoBs} Bs*`; }
  if (moneda === 'EURO') { montoBs = (montoDivisa * agente.tasas.euro).toFixed(2); textoPago += `*Zinli*\nUsuario: wilmergabriellucenacrespo\n\n💵 *MONTO: ${montoDivisa} €* (${montoBs} Bs)`; }
  if (moneda === 'USDT') { montoBs = (montoDivisa * agente.tasas.usdt).toFixed(2); textoPago += `*Binance Pay*\nCorreo: wilmergabriellucenacrespo@gmail.com\n\n💵 *MONTO: ${montoDivisa} USDT* (${montoBs} Bs)`; }

  intencionCompra.set(ctx.from.id, compra);
  await ctx.editMessageText(`${textoPago}\n\nPresiona el botón abajo para enviar tu comprobante:`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
      [{ text: "🔙 Cambiar Moneda", callback_data: `pago_${compra.id_servicio}` }]
    ]}
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Sube tu comprobante*\n\nEnvía la foto de tu transferencia.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// AHORA EL BOT AVISA SI ENVÍAS UNA FOTO SIN HABER CREADO LA ORDEN
botTienda.on('photo', async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  
  const compraData = intencionCompra.get(ctx.from.id);
  if (!compraData) {
    return ctx.reply("❌ *No tienes un pago en proceso.*\n\nPor favor, ve al catálogo, selecciona tu servicio, elige el método de pago y luego envía el comprobante aquí.", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] } }).catch(()=>{});
  }

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {});
  
  pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId });

  await ctx.reply('✅ *Comprobante enviado exitosamente*\nEl administrador lo está verificando.', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});

  notificacionesPendientes++;
  actualizarPanelAdmin();

  const fichaAdmin = `📋 *NUEVA ORDEN #${ordenId}*\n👤 Cliente: ${ctx.from.first_name}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${compraData.moneda}\n💰 Ganancia: $${compraData.ganancia}`;
  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  }).catch(()=>{});
  
  // Limpiamos la intención para que no puedan mandar 20 fotos seguidas
  intencionCompra.delete(ctx.from.id);
});


// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================
let notificacionesPendientes = 0;
let mensajePanelId = null;

function obtenerMenuAdmin() {
  const btnNotif = notificacionesPendientes > 0 ? `🔔 PENDIENTES (${notificacionesPendientes})` : `🔕 Sin Alertas`;
  return {
    inline_keyboard: [
      [{ text: btnNotif, callback_data: "admin_notif" }],
      [{ text: "📊 Reportes", callback_data: "admin_reportes" }, { text: "👥 Clientes & LTV", callback_data: "admin_clientes" }],
      [{ text: "🔄 Tasas API", callback_data: "admin_tasas" }, { text: "✏️ Tasas Manual", callback_data: "admin_tasas_manual" }],
      [{ text: "📢 Difusión", callback_data: "admin_difusion" }, { text: "🛑 Banear", callback_data: "admin_banear" }]
    ]
  };
}

const btnVolver = { inline_keyboard: [[{ text: "🔙 Volver al Panel", callback_data: "admin_inicio" }]] };

async function actualizarPanelAdmin() {
  if (mensajePanelId) {
    await botAdmin.telegram.editMessageReplyMarkup(MI_ID, mensajePanelId, null, obtenerMenuAdmin()).catch(()=>{});
  }
}

botAdmin.start(async (ctx) => {
  if (ctx.from.id !== MI_ID) return;
  await ctx.deleteMessage().catch(() => {});
  adminEstados.clear();
  const res = await ctx.reply('👑 *Panel de Control*\n\nSelecciona un módulo operativo:', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
  mensajePanelId = res.message_id;
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  await ctx.editMessageText('👑 *Panel de Control*\n\nSelecciona un módulo operativo:', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

// --- CLIENTES & LTV (AHORA SÍ FUNCIONA) ---
botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery('Consultando registros...').catch(()=>{});
  try {
    const snapshot = await db.collection('usuarios').orderBy('ultimo_inicio', 'desc').limit(5).get();
    let msj = `👥 *BASE DE DATOS DE CLIENTES*\n\nActualmente tienes *${snapshot.size}* clientes registrados en tu Firebase.\n\n*Últimos 5 usuarios activos:*\n`;
    
    snapshot.forEach(doc => {
      const u = doc.data();
      msj += `👤 ${u.nombre} (@${u.username}) - ID: \`${u.id}\`\n`;
    });

    await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  } catch (error) {
    await ctx.editMessageText('❌ Error al consultar la base de clientes.', { reply_markup: btnVolver }).catch(()=>{});
  }
});

// --- TASAS (AHORA SÍ FUNCIONAN) ---
botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Forzando actualización con Google...').catch(()=>{});
  await agente.actualizarTasas();
  
  const msj = `✅ *Tasas Actualizadas Exitosamente*\n\n📈 *Valores actuales:*\nUSDT: ${agente.tasas.usdt} Bs\nEURO: ${agente.tasas.euro} Bs\nBCV: ${agente.tasas.bcv} Bs\n\n_Estado: ${agente.tasas.fecha}_`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
});

botAdmin.action('admin_tasas_manual', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `✏️ *MODO MANUAL DE TASAS ACTIVADO*\n\nPara cambiar una tasa, envía un mensaje normal en este chat con este formato exacto:\n\n\`TASA BCV 36.60\`\n\`TASA USDT 41.50\`\n\`TASA EURO 44.00\``;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
});

// --- REPORTES FILTRADOS ---
botAdmin.action('admin_reportes', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📊 *MÓDULO DE REPORTES*\n\nSelecciona el periodo a consultar:', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📅 Hoy", callback_data: "rep_hoy" }, { text: "📅 Esta Semana", callback_data: "rep_sem" }],
      [{ text: "📅 Histórico Total", callback_data: "rep_total" }],
      [{ text: "🔙 Volver", callback_data: "admin_inicio" }]
    ]}
  }).catch(()=>{});
});

botAdmin.action(/rep_(.+)/, async (ctx) => {
  await ctx.answerCbQuery('Calculando...').catch(()=>{});
  const periodo = ctx.match[1];
  let totalVentas = 0, totalGanancia = 0;
  
  const snap = await db.collection('ventas').get();
  const ahora = new Date();
  
  snap.forEach(doc => {
    const v = doc.data();
    const fechaVenta = new Date(v.fecha_venta);
    let incluir = false;
    
    if (periodo === 'hoy' && fechaVenta.toDateString() === ahora.toDateString()) incluir = true;
    else if (periodo === 'sem' && (ahora - fechaVenta) / (1000 * 60 * 60 * 24) <= 7) incluir = true;
    else if (periodo === 'total') incluir = true;

    if (incluir) { totalVentas += parseFloat(v.venta_usd); totalGanancia += parseFloat(v.ganancia_usd); }
  });

  await ctx.editMessageText(`📊 *REPORTE: ${periodo.toUpperCase()}*\n\n💵 Ingresos Brutos: *$${totalVentas.toFixed(2)}*\n💎 Ganancia Neta: *$${totalGanancia.toFixed(2)}*`, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
});

// --- DIFUSIÓN Y BANEOS ---
botAdmin.action('admin_banear', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BANEADO');
  await ctx.editMessageText('🛑 *SISTEMA DE BLACKLIST*\n\nEnvía el ID de Telegram del usuario que deseas bloquear permanentemente.', { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
});

botAdmin.action('admin_difusion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DIFUSION');
  await ctx.editMessageText('📢 *DIFUSIÓN MASIVA*\n\nEscribe el mensaje que deseas enviar a TODOS los usuarios.', { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
});

// --- NOTIFICACIONES (CLICK) ---
botAdmin.action('admin_notif', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  if (notificacionesPendientes === 0) {
    await ctx.editMessageText('✅ *Bandeja Limpia*\n\nNo tienes pagos ni notificaciones pendientes.', { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  } else {
    await ctx.editMessageText(`🔔 *Centro de Alertas*\n\nTienes **${notificacionesPendientes}** pago(s) esperando aprobación. Sube y revisa los comprobantes.`, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  }
});


// --- APROBACIÓN Y RESPUESTA A SOPORTE (BOTONES INLINE) ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.', { show_alert: true }).catch(()=>{});

  adminEstados.set('ENTREGANDO', orden);
  if (notificacionesPendientes > 0) notificacionesPendientes--;
  actualizarPanelAdmin();

  const mensaje = `✅ *PAGO APROBADO* (Orden #${ordenId})\n\nEscribe directamente los datos de la cuenta:\n\`Correo: ...\`\n\`Clave: ...\`\n\`Vence: ...\``;
  await ctx.editMessageCaption(`✅ *Aprobación en progreso...*`, { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.reply(mensaje, { parse_mode: 'Markdown' }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.', { show_alert: true }).catch(()=>{});
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\nHemos encontrado un problema al verificar tu pago. Contacta a soporte.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.editMessageCaption(`❌ *PAGO RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' }).catch(()=>{});
  
  pagosPendientes.delete(ordenId);
  if (notificacionesPendientes > 0) notificacionesPendientes--;
  actualizarPanelAdmin();
});

// NUEVO: Botón para responder fácil al soporte
botAdmin.action(/soporte_res_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('RESPONDIENDO_SOPORTE', targetId);
  await ctx.reply(`✍️ *MODO RESPUESTA*\n\nEscribe el mensaje que deseas enviarle al usuario con ID: \`${targetId}\`\n\n_(Si te arrepientes, escribe CANCELAR)_`, { parse_mode: 'Markdown' }).catch(()=>{});
});


// --- ESCUCHADOR MAESTRO DE TEXTOS (ADMIN) ---
botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id !== MI_ID) return next();
  const texto = ctx.message.text;
  await ctx.deleteMessage().catch(()=>{}); 
  const estadoActual = adminEstados.get('accion');

  // 1️⃣ FIJAR TASAS MANUAL
  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valor = parseFloat(partes[2]);
      if (valor > 0 && ['BCV', 'USDT', 'EURO'].includes(moneda)) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *ÉXITO:* La tasa de ${moneda} ha sido actualizada manualmente a **${valor}**.`, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
      }
    }
    return ctx.reply('❌ Formato incorrecto. Usa: `TASA BCV 36.60`', { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  }

  // 2️⃣ MÓDULO DE DIFUSIÓN
  if (estadoActual === 'DIFUSION') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado', { reply_markup: btnVolver }); }
    adminEstados.clear();
    const snap = await db.collection('usuarios').get();
    let enviados = 0;
    await ctx.reply('⏳ Enviando difusión masiva...').catch(()=>{});
    for (let doc of snap.docs) {
      try { await botTienda.telegram.sendMessage(doc.id, `📢 *Anuncio de la Tienda*\n\n${texto}`, { parse_mode: 'Markdown' }); enviados++; } catch(e){}
    }
    return ctx.reply(`✅ Difusión completada a ${enviados} usuarios.`, { reply_markup: btnVolver }).catch(()=>{});
  }

  // 3️⃣ MÓDULO DE BANEOS
  if (estadoActual === 'BANEADO') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado', { reply_markup: btnVolver }); }
    adminEstados.clear();
    baneados.add(parseInt(texto));
    await db.collection('blacklist').doc(texto).set({ fecha: new Date().toISOString() });
    return ctx.reply(`✅ Usuario \`${texto}\` bloqueado.`, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  }

  // 4️⃣ ENTREGA MANUAL DE CUENTAS
  if (adminEstados.has('ENTREGANDO')) {
    if (texto.toUpperCase() === 'CANCELAR') {
      adminEstados.clear();
      return ctx.reply('❌ Entrega cancelada.', { reply_markup: btnVolver }).catch(()=>{});
    }

    const orden = adminEstados.get('ENTREGANDO');
    const { userId, username, compraData, ordenId } = orden;

    await botTienda.telegram.sendMessage(userId, `🎉 *¡PAGO APROBADO!*\n\nTus datos de acceso para *${compraData.servicio}*:\n\n${texto}\n\n_¡Gracias por tu compra!_`, { parse_mode: 'Markdown' }).catch(()=>{});

    const hoyISO = new Date().toISOString();
    await db.collection('usuarios').doc(userId.toString()).collection('suscripciones').add({ servicio: compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, estado: 'Activo' }).catch(()=>{});
    await db.collection('usuarios').doc(userId.toString()).collection('pagos').add({ servicio: compraData.servicio, monto: compraData.venta, moneda: compraData.moneda, fecha: hoyISO }).catch(()=>{});
    await db.collection('ventas').doc(ordenId).set({ ordenId, clienteId: userId, servicio: compraData.servicio, venta_usd: parseFloat(compraData.venta), ganancia_usd: parseFloat(compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    pagosPendientes.delete(ordenId);
    return ctx.reply(`✅ *Cuenta Entregada a ${username}*`, { parse_mode: 'Markdown', reply_markup: btnVolver }).catch(()=>{});
  }

  // 5️⃣ RESPONDIENDO A SOPORTE MEDIANTE BOTÓN
  if (adminEstados.has('RESPONDIENDO_SOPORTE')) {
    const targetId = adminEstados.get('RESPONDIENDO_SOPORTE');
    if (texto.toUpperCase() === 'CANCELAR') {
      adminEstados.clear();
      return ctx.reply('❌ Respuesta cancelada.', { reply_markup: btnVolver }).catch(()=>{});
    }
    
    await botTienda.telegram.sendMessage(targetId, `👨‍💻 *Respuesta de Soporte:*\n\n${texto}`, { parse_mode: 'Markdown' }).catch(()=>{});
    adminEstados.clear();
    return ctx.reply('✅ Respuesta enviada al cliente exitósamente.', { reply_markup: btnVolver }).catch(()=>{});
  }

  return next();
});

botTienda.launch().then(() => console.log("Tienda iniciada.")).catch(console.error);
botAdmin.launch().then(() => console.log("Panel Admin iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('SaaS Dual 100%'); });
server.listen(process.env.PORT || 3000);

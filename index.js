const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// --- 1. CONEXIÓN A BASE DE DATOS ---
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- 2. INICIALIZAR AMBOS BOTS ---
const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

const pagosPendientes = new Map();

// --- 3. AGENTE AUTOMÁTICO DE TASAS ---
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };

async function agenteActualizador() {
  try {
    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
    const data = await req.json();
    tasas.bcv = data.monitors.bcv.price || 0;
    tasas.usdt = data.monitors.binance.price || 0;
    
    const reqEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
    const dataEur = await reqEur.json();
    tasas.euro = dataEur.monitors.bcv.price || (tasas.bcv * 1.08);
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
  } catch (error) { console.log("Error en tasas", error); }
}
agenteActualizador();
setInterval(agenteActualizador, 43200000);


// ==========================================
// 🛒 BOT TIENDA (Para clientes)
// ==========================================

const menuPrincipal = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Precios", callback_data: "menu_catalogo" }],
    [{ text: "💳 Métodos de Pago", callback_data: "menu_pagos" }],
    [{ text: "⭐ Mi Suscripción", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }],
    [{ text: "🎧 Contactar a Soporte", url: "https://t.me/Mitienda_Adminbot" }] // Botón con enlace directo
  ]
};

botTienda.start((ctx) => {
  ctx.reply(`👋 ¡Hola ${ctx.from.first_name}! Bienvenido a la Tienda.\n\nSelecciona una opción del menú:`, {
    parse_mode: 'Markdown',
    reply_markup: menuPrincipal
  });
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', {
    parse_mode: 'Markdown',
    reply_markup: menuPrincipal
  });
});

// --- LÓGICA DEL CATÁLOGO ---
botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Catálogo de Servicios*\n\nSelecciona un servicio para ver los precios actuales:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "Netflix 🔴", callback_data: "item_netflix" }, { text: "Spotify 🟢", callback_data: "item_spotify" }],
        [{ text: "Disney+ 🔵", callback_data: "item_disney" }],
        [{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('item_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  const precioUSDT = (4 * tasas.usdt).toFixed(2);
  const precioEUR = (5 * tasas.euro).toFixed(2);
  const precioBCV = (6 * tasas.bcv).toFixed(2);

  await ctx.editMessageText(`🔴 *Netflix - Pantalla Individual*\n\n⏳ *Duración:* 30 días\n📅 *Tasa actual:* ${tasas.fecha}\n\n💵 *PRECIOS EN BOLÍVARES:*\n• USDT (4$): *${precioUSDT} Bs*\n• EUR (5€): *${precioEUR} Bs*\n• VES (BCV 6$): *${precioBCV} Bs*\n\nSi ya realizaste el pago, sube tu comprobante.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('item_spotify', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`🟢 *Spotify Premium*\n\nConsulta de precios en construcción.\nSi ya realizaste el pago, sube tu comprobante.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('item_disney', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`🔵 *Disney+*\n\nConsulta de precios en construcción.\nSi ya realizaste el pago, sube tu comprobante.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

// --- LÓGICA DE MÉTODOS DE PAGO (Conectado a Firebase) ---
botTienda.action('menu_pagos', async (ctx) => {
  await ctx.answerCbQuery();
  let textoPagos = '💳 *Métodos de Pago Disponibles*\n\n';
  
  try {
    const snapshot = await db.collection('metodos_pago').get();
    if (snapshot.empty) {
      textoPagos += 'No hay métodos de pago registrados actualmente.\n\n';
    } else {
      snapshot.forEach(doc => {
        const data = doc.data();
        textoPagos += `🔹 *${doc.id.toUpperCase()}*\n`;
        if (data.banco) textoPagos += `Banco: ${data.banco}\n`;
        if (data.telefono) textoPagos += `Teléfono: ${data.telefono}\n`;
        if (data.cedula) textoPagos += `Cédula: ${data.cedula}\n`;
        if (data.correo) textoPagos += `Correo: ${data.correo}\n`;
        textoPagos += '\n';
      });
    }
  } catch (error) {
    textoPagos += 'Ocurrió un error al cargar los datos.\n\n';
  }

  await ctx.editMessageText(textoPagos + 'Presiona el botón de abajo cuando hayas transferido:', {
    parse_mode: 'Markdown',
    reply_markup: { 
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ] 
    }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 Envía la foto de tu comprobante de pago por este chat.');
});

// --- BOTONES SECUNDARIOS ---
botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('⭐ *Mi Suscripción*\n\nAún no tienes suscripciones activas vinculadas a este usuario.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('👤 *Mi Perfil*\n\nAquí podrás ver tus datos registrados y actualizar tu información (Módulo en construcción).', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📜 *Políticas de Garantía*\n\n1. Todas las cuentas tienen garantía de 30 días continuos.\n2. Está estrictamente prohibido cambiar las contraseñas o alterar los perfiles asignados.\n3. La entrega del servicio se realiza únicamente tras verificar el pago en nuestras cuentas.\n\nEl incumplimiento de estas normas anula la garantía de forma inmediata.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

// --- RECEPCIÓN DE COMPROBANTES ---
botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();

  pagosPendientes.set(ordenId, { userId: userId, username: username });

  await ctx.reply('⏳ Tu comprobante ha sido recibido y está en revisión.');

  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: `🔔 *NUEVA SOLICITUD DE PAGO*\n👤 Cliente: ${username}\n🔖 Orden: #${ordenId}`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }],
        [{ text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]
      ]
    }
  });
});

// ==========================================
// 💼 BOT ADMINISTRADOR (Panel Privado)
// ==========================================
botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) {
    ctx.reply('👑 *Panel de Administración Activo*\n\nTodo listo. Recibirás las notificaciones de pagos aquí.', { parse_mode: 'Markdown' });
  }
});

botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');

  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO!*\n\nEn breve te enviaremos tus datos de acceso por aquí.', { parse_mode: 'Markdown' });

  const plantilla = `✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia, llena y envía:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha Inicio:\n⌛ Fecha Corte:\n---`;
  await ctx.reply(plantilla, { parse_mode: 'Markdown' });

  await ctx.editMessageCaption(`✅ *APROBADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHubo un problema con tu comprobante. Por favor, contacta a soporte.', { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`❌ *RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

// ==========================================
// 🚀 ARRANQUE DE SERVIDORES
// ==========================================
botTienda.launch();
botAdmin.launch();
console.log("¡Ambos bots están en línea con la nueva navegación!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Dual Operativo'); });
server.listen(process.env.PORT || 3000);

const { Telegraf, session } = require('telegraf');
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
 
// ==========================================
// 🛒 BOT TIENDA (Para clientes)
// ==========================================
botTienda.use(session());

botTienda.start(async (ctx) => {
  ctx.session = ctx.session || {};
  
  // Si no está registrado, pide todos los datos en un solo mensaje
  if (!ctx.session.registrado) {
    return ctx.reply('👋 ¡Bienvenido a la Tienda!\n\nPara poder ofrecerte nuestros servicios, por favor envía tus datos en *un solo mensaje*, uno debajo del otro, de esta forma:\n\nJuan Perez\nV-12345678\n0414-1234567', { parse_mode: 'Markdown' });
  }
  mostrarMenuPrincipal(ctx);
});

// Capturador del mensaje único de registro
botTienda.on('text', async (ctx, next) => {
  ctx.session = ctx.session || {};
  
  // Si el usuario no está registrado, asumimos que su primer mensaje de texto son sus datos
  if (!ctx.session.registrado) {
    ctx.session.datosUsuario = ctx.message.text; // Guardamos todo el bloque de texto
    ctx.session.registrado = true;
    
    await ctx.reply('✅ ¡Registro exitoso! Ya puedes usar la plataforma.');
    return mostrarMenuPrincipal(ctx);
  }
  
  return next(); // Si ya está registrado, ignora esto y permite que funcionen otras cosas
});

function mostrarMenuPrincipal(ctx) {
  ctx.reply('📺 *Menú Principal*', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 Catálogo y Precios", callback_data: "menu_catalogo" }],
        [{ text: "💳 Métodos de Pago", callback_data: "menu_pagos" }]
      ]
    }
  });
}

// (Aquí luego integraremos tu lógica del agente de tasas y el catálogo completo)

botTienda.action('menu_pagos', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('💳 *Métodos de Pago Disponibles*\n\nPresiona el botón de abajo cuando hayas transferido:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }]] }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 Envía la foto de tu comprobante de pago por este chat.');
});

// CUANDO EL CLIENTE SUBE LA FOTO EN LA TIENDA
botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();

  pagosPendientes.set(ordenId, { userId: userId, username: username });

  await ctx.reply('⏳ Tu comprobante ha sido recibido y está en revisión.');

  // La tienda le envía el comprobante a tu Bot Administrador
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
// 💼 BOT ADMINISTRADOR (Solo para ti)
// ==========================================
botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) {
    ctx.reply('👑 *Panel de Administración Activo*\n\nTodo listo. Recibirás las notificaciones de pagos de la tienda aquí.', { parse_mode: 'Markdown' });
  }
});

// CUANDO TÚ APRUEBAS EL PAGO EN EL BOT ADMIN
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');

  // 1. El Bot Admin obliga al Bot Tienda a avisarle al cliente
  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO!*\n\nEn breve te enviaremos tus datos de acceso por aquí.', { parse_mode: 'Markdown' });

  // 2. Te genera la plantilla a ti
  const plantilla = `✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia, llena y envía:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha Inicio:\n⌛ Fecha Corte:\n---`;
  await ctx.reply(plantilla, { parse_mode: 'Markdown' });

  await ctx.editMessageCaption(`✅ *APROBADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('Pago rechazado');
});

// ==========================================
// 🚀 ARRANQUE DE SERVIDORES
// ==========================================
botTienda.launch();
botAdmin.launch();
console.log("¡Ambos bots están en línea! Registro de un solo paso activado.");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Dual Operativo'); });
server.listen(process.env.PORT || 3000);

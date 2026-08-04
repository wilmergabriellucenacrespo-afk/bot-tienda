const { Telegraf, session } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// --- 1. CONEXIÓN A BASE DE DATOS ---
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- 2. INICIALIZAR AMBOS BOTS ---
const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN); // Tu nuevo bot
const MI_ID = 8264753970; // Tu ID

const pagosPendientes = new Map();

// ==========================================
// 🛒 BOT TIENDA (Para clientes y tus pruebas)
// ==========================================
botTienda.use(session());

botTienda.start(async (ctx) => {
  ctx.session = ctx.session || {};
  if (!ctx.session.registrado) {
    ctx.session.paso = 'nombre';
    return ctx.reply('👋 ¡Bienvenido a la Tienda!\n\nPor favor, escribe tu *Nombre y Apellido*:', { parse_mode: 'Markdown' });
  }
  mostrarMenuPrincipal(ctx);
});

botTienda.on('text', async (ctx, next) => {
  ctx.session = ctx.session || {};
  if (ctx.session.paso === 'nombre') {
    ctx.session.nombre = ctx.message.text;
    ctx.session.paso = 'cedula';
    return ctx.reply('Perfecto. Ahora ingresa tu *Cédula*:');
  }
  if (ctx.session.paso === 'cedula') {
    ctx.session.cedula = ctx.message.text;
    ctx.session.paso = 'telefono';
    return ctx.reply('Por último, ingresa tu *Teléfono*:');
  }
  if (ctx.session.paso === 'telefono') {
    ctx.session.telefono = ctx.message.text;
    ctx.session.paso = 'completado';
    ctx.session.registrado = true;
    await ctx.reply('✅ ¡Registro exitoso!');
    return mostrarMenuPrincipal(ctx);
  }
  return next();
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

// (Aquí luego agregaremos tu lógica del agente de tasas y catálogo)

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

  // LA MAGIA: La tienda le envía el comprobante a tu Bot Administrador
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
    // Lógica para rechazar
    await ctx.answerCbQuery('Pago rechazado');
});

// ==========================================
// 🚀 ARRANQUE DE SERVIDORES
// ==========================================
botTienda.launch();
botAdmin.launch();
console.log("¡Ambos bots están en línea y conectados!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Dual Operativo'); });
server.listen(process.env.PORT || 3000);

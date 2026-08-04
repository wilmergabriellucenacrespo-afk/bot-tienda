const { Telegraf, session } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// --- 1. CONEXIONES ---
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
bot.use(session()); // Memoria para el registro paso a paso

const ADMIN_ID = 8264753970;

// Base de datos temporal para organizar los pagos sin colapsar tu chat
const pagosPendientes = new Map(); 

// --- 2. SISTEMA DE REGISTRO OBLIGATORIO ---
bot.start(async (ctx) => {
  // Si eres tú (el admin), te muestra el panel oculto
  if (ctx.from.id === ADMIN_ID) {
    return ctx.reply('👑 *Panel de Administración*\n\nSesión iniciada. Esperando notificaciones de clientes...', { parse_mode: 'Markdown' });
  }

  ctx.session = ctx.session || {};
  
  // Si no está registrado, iniciamos el formulario
  if (!ctx.session.registrado) {
    ctx.session.paso = 'nombre';
    return ctx.reply('👋 ¡Bienvenido!\n\nPara poder ofrecerte nuestros servicios, por favor escribe tu *Nombre y Apellido*:', { parse_mode: 'Markdown' });
  }
  
  mostrarMenuPrincipal(ctx);
});

// Capturador de texto para el formulario de registro
bot.on('text', async (ctx, next) => {
  ctx.session = ctx.session || {};

  if (ctx.session.paso === 'nombre') {
    ctx.session.nombre = ctx.message.text;
    ctx.session.paso = 'cedula';
    return ctx.reply('Perfecto. Ahora ingresa tu *Cédula de Identidad*:');
  }
  if (ctx.session.paso === 'cedula') {
    ctx.session.cedula = ctx.message.text;
    ctx.session.paso = 'telefono';
    return ctx.reply('Por último, ingresa tu *Número de Teléfono*:');
  }
  if (ctx.session.paso === 'telefono') {
    ctx.session.telefono = ctx.message.text;
    ctx.session.paso = 'completado';
    ctx.session.registrado = true;
    
    // Aquí el bot enviaría estos datos a Firebase en el futuro
    await ctx.reply('✅ ¡Registro exitoso! Ya puedes usar la plataforma.');
    return mostrarMenuPrincipal(ctx);
  }
  
  return next(); // Si ya está registrado, ignora este bloque
});

function mostrarMenuPrincipal(ctx) {
  ctx.reply('📺 *Menú Principal*\nSelecciona una opción:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🛒 Ver Catálogo y Precios", callback_data: "menu_catalogo" }],
        [{ text: "💳 Ver Métodos de Pago", callback_data: "menu_pagos" }],
        [{ text: "⭐ Mi Suscripción", callback_data: "menu_suscripcion" }]
      ]
    }
  });
}

// --- 3. MENÚS DEL USUARIO ---
bot.action('menu_pagos', async (ctx) => {
  await ctx.answerCbQuery();
  // En el futuro, estos datos se llamarán desde Firebase
  await ctx.editMessageText('💳 *Métodos de Pago Disponibles*\n\n• *Pago Móvil:* 0414-XXXXXXX / CI: XXXXXX\n• *USDT (Binance):* pagos@correo.com\n• *Zinli:* pagos@correo.com\n\nPresiona el botón de abajo cuando hayas transferido:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver al Inicio", callback_data: "volver_inicio" }]
      ]
    }
  });
});

bot.action('volver_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  mostrarMenuPrincipal(ctx);
});

bot.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 Envía la foto de tu comprobante de pago por este chat.');
});


// --- 4. PANEL DE CONTROL MÓVIL (NOTIFICACIONES CORTAS Y APROBACIÓN) ---
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString(); // Genera un # de orden corto

  // Guardamos el pago en memoria temporal
  pagosPendientes.set(ordenId, { userId: userId, fileId: fileId, username: username });

  await ctx.reply('⏳ Tu comprobante ha sido recibido y está en revisión.');

  // Alerta CORTA para tu pantalla
  await bot.telegram.sendMessage(ADMIN_ID, `🔔 *NUEVA SOLICITUD*\n👤 Cliente: ${username}\n🔖 Orden: #${ordenId}`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[{ text: "👀 Ver Comprobante", callback_data: `ver_${ordenId}` }]]
    }
  });
});

// Acción cuando tú presionas "Ver Comprobante"
bot.action(/ver_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);

  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');

  await ctx.telegram.sendPhoto(ADMIN_ID, orden.fileId, {
    caption: `Comprobante de la Orden #${ordenId}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }],
        [{ text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]
      ]
    }
  });
  await ctx.answerCbQuery();
});

// Acción cuando tú presionas "Aprobar Pago"
bot.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  
  if (!orden) return ctx.answerCbQuery('Error: Orden ya procesada.');

  // 1. Notificación automática de éxito al cliente
  await bot.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO!*\n\nEn breve te enviaremos tus datos de acceso por aquí.', { parse_mode: 'Markdown' });

  // 2. Se te genera la plantilla de autocompletado en tu chat
  const plantilla = `✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia, llena y envía:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha Inicio:\n⌛ Fecha Corte:\n---`;
  await ctx.reply(plantilla, { parse_mode: 'Markdown' });

  // Cambiamos el mensaje en tu panel para marcarlo como listo
  await ctx.editMessageCaption(`✅ *APROBADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

// --- 5. ARRANQUE DEL SERVIDOR ---
bot.launch();
console.log("¡Lógica avanzada en línea!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Bot Operativo'); });
server.listen(process.env.PORT || 3000);

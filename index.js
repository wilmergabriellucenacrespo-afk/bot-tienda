const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// --- 1. CONEXIÓN A BASE DE DATOS Y TELEGRAM ---
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const ADMIN_ID = 8264753970; // Tu ID de administrador

// --- 2. MENÚ PRINCIPAL PROFESIONAL ---
const menuPrincipal = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🛒 Ver Catálogo de Servicios", callback_data: "menu_catalogo" }],
      [{ text: "👤 Mi Perfil", callback_data: "menu_perfil" }, { text: "🎧 Soporte", callback_data: "menu_soporte" }],
      [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }]
    ]
  }
};

bot.start((ctx) => {
  ctx.reply(`👋 ¡Hola ${ctx.from.first_name}! Bienvenido a nuestra plataforma de Streaming Automática.\n\n¿En qué podemos ayudarte hoy? Selecciona una opción:`, menuPrincipal);
});

// Botón: Volver al inicio
bot.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`👋 ¡Hola de nuevo! Selecciona una opción del menú:`, menuPrincipal);
});

// --- 3. LÓGICA DEL CATÁLOGO ---
bot.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Catálogo de Servicios*\n\nSelecciona la plataforma que deseas adquirir para ver los precios y tasas actuales:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "Netflix 🔴", callback_data: "item_netflix" }, { text: "Spotify 🟢", callback_data: "item_spotify" }],
        [{ text: "Disney+ 🔵", callback_data: "item_disney" }],
        [{ text: "🔙 Volver al Inicio", callback_data: "menu_inicio" }]
      ]
    }
  });
});

// Detalles del Servicio y Botón de Pago (Ejemplo adaptado a tus instrucciones)
bot.action('item_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🔴 *Netflix - Pantalla Individual*\n\n⏳ *Duración:* 30 días\n\n💵 *PRECIOS BASE:*\n• USDT (Binance): 4.00$\n• EUR (Zinli): 5.00€\n• VES (BCV): *Consultar tasa del día*\n\n💳 *Datos de Pago:*\n(Aquí el administrador colocará los datos de pago en la base de datos)\n\nUna vez realices la transferencia, presiona el botón de abajo para reportarlo.', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante de Pago", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }]
      ]
    }
  });
});

// (Puedes replicar la estructura de item_netflix para item_spotify y item_disney luego)

// --- 4. LÓGICA DE BOTONES SECUNDARIOS ---
bot.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 *Sube tu comprobante*\n\nPor favor, envía en este chat la foto (capture) de tu transferencia. Nuestro equipo administrativo verificará el pago y te entregará el servicio por aquí mismo.', { parse_mode: 'Markdown' });
});

bot.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📜 *Políticas de Garantía*\n\n1. Todas las cuentas tienen garantía de 30 días.\n2. No cambies las contraseñas ni los perfiles asignados.\n3. La entrega se realiza tras verificar el pago en nuestras cuentas.\n\nEl incumplimiento anula la garantía.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Inicio", callback_data: "menu_inicio" }]] }
  });
});

bot.action('menu_soporte', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🎧 Para contactar con administración, escribe tu mensaje aquí y te responderemos a la brevedad posible.');
});

bot.action('menu_perfil', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('👤 (Módulo en construcción: Aquí vincularemos la base de datos para mostrar los días restantes de tu suscripción).');
});


// --- 5. RECEPCIÓN DE PAGOS Y PANEL ADMIN ---
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  
  // Avisar al cliente
  await ctx.reply('⏳ Comprobante en revisión. Te enviaremos tus accesos muy pronto.');

  // Alerta al Admin con plantilla de autocompletado
  const plantillaAdmin = `💰 *NUEVO PAGO RECIBIDO*\n👤 Cliente: ${username} (ID: \`${userId}\`)\n\nVerifica el capture. Si es correcto, copia esta plantilla, llénala y envíasela al cliente:\n\n---\n✅ *PAGO APROBADO*\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha de Inicio:\n⌛ Fecha de Corte:\n---`;

  await ctx.telegram.sendPhoto(ADMIN_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
    caption: plantillaAdmin,
    parse_mode: 'Markdown'
  });
});

// --- 6. ARRANQUE Y PUERTO RENDER ---
bot.launch();
console.log("¡Interfaz profesional en línea!");

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot Operativo');
});
server.listen(process.env.PORT || 3000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

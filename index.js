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
const ADMIN_ID = 8264753970;

// --- 2. AGENTE AUTOMÁTICO DE TASAS ---
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };

async function agenteActualizador() {
  try {
    // Extraemos datos de la API pública
    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar');
    const data = await req.json();
    
    tasas.bcv = data.monitors.bcv.price || 0;
    tasas.usdt = data.monitors.binance.price || 0;
    
    // Estimación rápida de Euro oficial (Referencial)
    const reqEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro');
    const dataEur = await reqEur.json();
    tasas.euro = dataEur.monitors.bcv.price || (tasas.bcv * 1.08); // Respaldo matemático
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    
    console.log(`Tasas actualizadas: BCV ${tasas.bcv} | USDT ${tasas.usdt} | EUR ${tasas.euro}`);
  } catch (error) {
    console.log("Error en el agente de tasas, reintentando...", error);
  }
}

// Ejecutar al encender y programar cada 12 horas (43,200,000 milisegundos)
agenteActualizador();
setInterval(agenteActualizador, 43200000);

// Comando secreto de administrador para forzar actualización
bot.command('actualizar', async (ctx) => {
  if (ctx.from.id === ADMIN_ID) {
    await ctx.reply('⏳ Agente buscando nuevas tasas...');
    await agenteActualizador();
    await ctx.reply(`✅ Tasas actualizadas:\nBCV: ${tasas.bcv}\nUSDT: ${tasas.usdt}\nEUR: ${tasas.euro}`);
  }
});


// --- 3. MENÚ PRINCIPAL ---
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
  ctx.reply(`👋 ¡Hola ${ctx.from.first_name}! Bienvenido a la plataforma automática.\n\nSelecciona una opción:`, menuPrincipal);
});

bot.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`👋 ¡Hola de nuevo! Selecciona una opción del menú:`, menuPrincipal);
});


// --- 4. CATÁLOGO Y LÓGICA DE PRECIOS AUTOMÁTICOS ---
bot.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Catálogo de Servicios*\n\nSelecciona la plataforma para ver los precios calculados a la tasa del momento:', {
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

// Cálculos dinámicos en los botones
bot.action('item_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  
  // El bot hace la matemática al instante
  const precioUSDT = (4 * tasas.usdt).toFixed(2);
  const precioEUR = (5 * tasas.euro).toFixed(2);
  const precioBCV = (6 * tasas.bcv).toFixed(2);

  await ctx.editMessageText(`🔴 *Netflix - Pantalla Individual*\n\n⏳ *Duración:* 30 días\n📅 *Tasa actualizada:* ${tasas.fecha}\n\n💵 *PRECIOS AL CAMBIO ACTUAL:*\n• USDT (Binance 4$): *${precioUSDT} Bs*\n• EUR (Zinli 5€): *${precioEUR} Bs*\n• VES (BCV 6$): *${precioBCV} Bs*\n\n💳 *Datos de Pago:*\nPago Móvil: 0414-XXXXXXX / CI: XXXXXXX / Banesco\nBinance Pay: tu-correo@email.com\nZinli: tu-correo@email.com\n\nRealiza tu transferencia y presiona el botón abajo para reportarla.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante de Pago", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }]
      ]
    }
  });
});

// --- 5. RECEPCIÓN DE PAGOS Y RUTAS SECUNDARIAS ---
bot.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 *Sube tu comprobante*\n\nEnvía en este chat la foto de tu transferencia. La administración verificará y entregará el servicio aquí mismo.', { parse_mode: 'Markdown' });
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
    await ctx.reply('🎧 Para contactar con administración, escribe tu duda y un agente te responderá pronto.');
});

bot.action('menu_perfil', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('👤 (Módulo de Firebase en construcción: Aquí se mostrarán tus días restantes y estado de cuenta).');
});

bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  
  await ctx.reply('⏳ Comprobante en revisión. Te enviaremos tus accesos muy pronto.');

  const plantillaAdmin = `💰 *NUEVO PAGO RECIBIDO*\n👤 Cliente: ${username} (ID: \`${userId}\`)\n\nCopia, llena y envía esta plantilla:\n\n---\n✅ *PAGO APROBADO*\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha de Inicio:\n⌛ Fecha de Corte:\n---`;

  await ctx.telegram.sendPhoto(ADMIN_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
    caption: plantillaAdmin,
    parse_mode: 'Markdown'
  });
});

// --- 6. ARRANQUE DEL SERVIDOR ---
bot.launch();
console.log("¡Motor de tasas y tienda operando!");

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot Operativo');
});
server.listen(process.env.PORT || 3000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

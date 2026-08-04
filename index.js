const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// --- 1. CONEXIÓN A BASE DE DATOS ---
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- 2. INICIALIZAR BOTS ---
const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

// Memoria temporal para rastrear el proceso de compra de cada cliente
const pagosPendientes = new Map();
const intencionCompra = new Map();

// --- 3. NUEVO AGENTE DE TASAS (Más estable y preciso) ---
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando..." };

async function actualizarTasas() {
  try {
    // Usamos DolarAPI (Muy estable)
    const [reqBcv, reqBinance, reqEuro] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/dolares/binance'),
      fetch('https://ve.dolarapi.com/v1/dolares/euro')
    ]);
    
    const dataBcv = await reqBcv.json();
    const dataBinance = await reqBinance.json();
    const dataEuro = await reqEuro.json();

    tasas.bcv = dataBcv.promedio || 0;
    tasas.usdt = dataBinance.promedio || 0;
    tasas.euro = dataEuro.promedio || 0;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    console.log("Tasas actualizadas correctamente.");
  } catch (error) { 
    console.log("Error actualizando tasas:", error); 
  }
}
// Ejecutamos inmediatamente y luego cada 4 horas
actualizarTasas();
setInterval(actualizarTasas, 14400000);


// ==========================================
// 🛒 BOT TIENDA (FLUJO DEL CLIENTE)
// ==========================================

const menuPrincipal = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Precios", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mi Suscripción", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }],
    [{ text: "🎧 Contactar a Soporte", url: "https://t.me/Mitienda_Adminbot" }]
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
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Catálogo de Servicios*\n\nSelecciona un servicio:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "Netflix 🔴", callback_data: "item_netflix" }, { text: "Spotify 🟢", callback_data: "item_spotify" }],
        [{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

// 1. Mostrar información del servicio
botTienda.action('item_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`🔴 *Netflix - Pantalla Individual*\n\n⏳ *Duración:* 30 días\n\nPresiona el botón para ver las tasas y métodos de pago disponibles:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Realizar Pago", callback_data: "pago_netflix" }],
        [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Volver", callback_data: "menu_inicio" }]
      ]
    }
  });
});

// 2. Seleccionar Tasa y Moneda
botTienda.action('pago_netflix', async (ctx) => {
  await ctx.answerCbQuery();
  if (tasas.bcv === 0) await actualizarTasas(); // Seguro anti-fallos

  const pUSDT = (4 * tasas.usdt).toFixed(2);
  const pEUR = (5 * tasas.euro).toFixed(2);
  const pBCV = (6 * tasas.bcv).toFixed(2);

  await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\n📅 Tasa del día: ${tasas.fecha}\n\nSelecciona en qué moneda deseas pagar Netflix:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: `USDT (4$ = ${pUSDT} Bs)`, callback_data: "pagar_usdt" }],
        [{ text: `EURO (5€ = ${pEUR} Bs)`, callback_data: "pagar_euro" }],
        [{ text: `BCV (6$ = ${pBCV} Bs)`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Atrás", callback_data: "item_netflix" }]
      ]
    }
  });
});

// 3. Mostrar Datos Bancarios y Botón de Subir Comprobante
botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1];
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  // Guardamos la intención de compra para la ficha del Admin
  intencionCompra.set(userId, { moneda: moneda.toUpperCase(), tasaDia: tasas.fecha });

  let textoPago = `🏦 *DATOS PARA PAGO EN ${moneda.toUpperCase()}*\n\n`;
  // (Aquí puedes conectar la lectura directa de Firebase como antes, pondré un texto fijo de ejemplo para no exceder la memoria)
  if (moneda === 'bcv') textoPago += `Pago Móvil: 0414-1234567\nCI: 12345678\nBanco: Banesco\nMonto: ${(6 * tasas.bcv).toFixed(2)} Bs`;
  if (moneda === 'usdt') textoPago += `Binance Pay (Correo):\npagos@tuempresa.com\nMonto: 4.00 USDT`;
  if (moneda === 'euro') textoPago += `Zinli (Correo):\npagos@tuempresa.com\nMonto: 5.00 EUR`;

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón abajo:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Cambiar Moneda", callback_data: "pago_netflix" }]
      ]
    }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('📸 Envía la foto de tu comprobante de pago en este chat ahora.');
});

// 4. Recepción y Creación de Ficha
botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();
  
  const compraData = intencionCompra.get(userId) || { moneda: 'NO DEFINIDA', tasaDia: tasas.fecha };

  pagosPendientes.set(ordenId, { userId, username });

  await ctx.reply('⏳ Tu comprobante ha sido recibido. El departamento de administración lo está verificando.');

  // FICHA DE CLIENTE PARA EL ADMIN
  const fichaAdmin = `📋 *FICHA DE VERIFICACIÓN - ORDEN #${ordenId}*\n\n` +
                     `👤 *Cliente:* ${username}\n` +
                     `🆔 *ID Usuario:* \`${userId}\`\n\n` +
                     `💵 *Moneda de Pago:* ${compraData.moneda}\n` +
                     `📅 *Tasa del momento:* ${compraData.tasaDia}\n\n` +
                     `Verifica la foto adjunta con tu banco.`;

  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]
      ]
    }
  });
});


// ==========================================
// 💼 BOT ADMINISTRADOR (10 LÓGICAS)
// ==========================================

const panelAdminBotones = {
  inline_keyboard: [
    [{ text: "💰 Ver Ganancias", callback_data: "admin_ganancias" }, { text: "📈 Ver Inversión", callback_data: "admin_inversion" }],
    [{ text: "👥 Base de Clientes", callback_data: "admin_clientes" }, { text: "📊 Estadísticas", callback_data: "admin_stats" }],
    [{ text: "🔄 Forzar Tasa Actual", callback_data: "admin_tasas" }, { text: "📢 Difusión Masiva", callback_data: "admin_difusion" }],
    [{ text: "🚫 Suspender Usuario", callback_data: "admin_suspender" }, { text: "⭐ Servicios Activos", callback_data: "admin_servicios" }],
    [{ text: "📝 Notas Administrativas", callback_data: "admin_notas" }, { text: "⚙️ Configuración", callback_data: "admin_config" }]
  ]
};

botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) {
    ctx.reply('👑 *PANEL DE CONTROL ADMINISTRATIVO*\n\nBienvenido jefe. ¿Qué deseas gestionar hoy?', { 
      parse_mode: 'Markdown', 
      reply_markup: panelAdminBotones 
    });
  }
});

// Funciones del panel (Preparadas para enlazar a Firebase)
botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Actualizando tasas de internet...');
  await actualizarTasas();
  await ctx.reply(`✅ *Tasas Actualizadas Manualmente:*\nUSDT: ${tasas.usdt}\nEURO: ${tasas.euro}\nBCV: ${tasas.bcv}\nFecha: ${tasas.fecha}`, { parse_mode: 'Markdown' });
});

botAdmin.action('admin_ganancias', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('💰 *Módulo de Ganancias*\n\n(Pronto: Aquí se sumarán automáticamente todos los pagos aprobados desde Firebase).');
});

botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('👥 *Módulo de Clientes*\n\n(Pronto: Listado de usuarios registrados y días restantes).');
});

// Lógica 1 y 2: Aprobar y Rechazar
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden procesada anteriormente.');

  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO!*\n\nEn breve te enviaremos tus datos de acceso.', { parse_mode: 'Markdown' });

  const plantilla = `✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia y envía al cliente:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Inicio:\n⌛ Corte:\n---`;
  await ctx.reply(plantilla, { parse_mode: 'Markdown' });

  await ctx.editMessageCaption(`✅ *APROBADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden procesada anteriormente.');
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHubo un problema con tu comprobante. Contacta a soporte.', { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`❌ *RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

// ==========================================
// 🚀 ARRANQUE DE SERVIDORES
// ==========================================
botTienda.launch();
botAdmin.launch();
console.log("¡Sistema Dual con Panel Avanzado en línea!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Dual Operativo'); });
server.listen(process.env.PORT || 3000);

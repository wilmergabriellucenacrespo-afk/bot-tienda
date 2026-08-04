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

const pagosPendientes = new Map();
const intencionCompra = new Map();

// --- 3. AGENTE DE TASAS ---
let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando..." };

async function actualizarTasas() {
  try {
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
  } catch (error) { console.log("Error en tasas:", error); }
}
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
  ctx.reply(`👋 ¡Hola ${ctx.from.first_name}! Bienvenido a la Tienda.\n\nSelecciona una opción del menú:`, { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

// --- LÓGICA DEL CATÁLOGO DINÁMICO (TUS SERVICIOS Y COSTOS) ---
// Aquí agregas o modificas los precios fácilmente. 'costo' es tu inversión, 'venta' es el precio al cliente.
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", venta: 4.00, costo: 2.00 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", venta: 3.00, costo: 1.50 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", venta: 3.00, costo: 1.50 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "crunchy", nombre: "Crunchyroll 🟠", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "paramount", nombre: "Paramount+ ⛰️", duracion: "30 días", venta: 2.00, costo: 1.00 },
  { id: "vix", nombre: "Vix+ 🟧", duracion: "30 días", venta: 2.00, costo: 1.00 },
  { id: "appletv", nombre: "Apple TV+ 🍎", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "youtube", nombre: "YouTube Premium 🟥", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "canva", nombre: "Canva Pro 🖌️", duracion: "30 días", venta: 2.00, costo: 0.50 },
  { id: "iptv", nombre: "Tele Latino/IPTV 📺", duracion: "30 días", venta: 5.00, costo: 2.00 },
  { id: "xbox", nombre: "Xbox Game Pass 🎮", duracion: "30 días", venta: 6.00, costo: 3.00 }
];

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Construir botonera automáticamente de 2 en 2
  let botones = [];
  for (let i = 0; i < servicios.length; i += 2) {
    let fila = [{ text: servicios[i].nombre, callback_data: `item_${servicios[i].id}` }];
    if (servicios[i + 1]) fila.push({ text: servicios[i + 1].nombre, callback_data: `item_${servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]);

  await ctx.editMessageText('📺 *Catálogo de Servicios Premium*\n\nSelecciona el servicio que deseas adquirir:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } });
});

// Generar sub-menús para TODOS los servicios con 1 solo bloque de código
servicios.forEach(servicio => {
  
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    if (tasas.bcv === 0) await actualizarTasas();
    
    const pUSDT = (servicio.venta * tasas.usdt).toFixed(2);
    const pEUR = (servicio.venta * tasas.euro).toFixed(2);
    const pBCV = (servicio.venta * tasas.bcv).toFixed(2);

    await ctx.editMessageText(`*${servicio.nombre}*\n\n⏳ *Duración:* ${servicio.duracion}\n📅 *Tasa del día:* ${tasas.fecha}\n\n💵 *PRECIOS AL CAMBIO:*\n• USDT (${servicio.venta}$): *${pUSDT} Bs*\n• EUR (${servicio.venta}€): *${pEUR} Bs*\n• VES (BCV ${servicio.venta}$): *${pBCV} Bs*\n\nSi deseas adquirirlo, selecciona realizar pago:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Realizar Pago", callback_data: `pago_${servicio.id}` }],
          [{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }, { text: "🏠 Volver", callback_data: "menu_inicio" }]
        ]
      }
    });
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    
    const pUSDT = (servicio.venta * tasas.usdt).toFixed(2);
    const pEUR = (servicio.venta * tasas.euro).toFixed(2);
    const pBCV = (servicio.venta * tasas.bcv).toFixed(2);

    // Guardar datos financieros para tu Panel Admin
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, venta: servicio.venta, costo: servicio.costo, 
      ganancia: (servicio.venta - servicio.costo).toFixed(2), tasaDia: tasas.fecha 
    });

    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}\n\nSelecciona en qué moneda deseas pagar:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `USDT (${servicio.venta}$ = ${pUSDT} Bs)`, callback_data: "pagar_usdt" }],
          [{ text: `EURO (${servicio.venta}€ = ${pEUR} Bs)`, callback_data: "pagar_euro" }],
          [{ text: `BCV (${servicio.venta}$ = ${pBCV} Bs)`, callback_data: "pagar_bcv" }],
          [{ text: "🔙 Atrás", callback_data: `item_${servicio.id}` }]
        ]
      }
    });
  });
});

botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  let compra = intencionCompra.get(userId) || {};
  compra.moneda = moneda;
  intencionCompra.set(userId, compra);

  let textoPago = `🏦 *DATOS PARA PAGO EN ${moneda}*\n\n`;
  if (moneda === 'BCV') textoPago += `Pago Móvil: 0414-XXXXXXX\nCI: XXXXXXXX\nBanco: Banesco\n\n*Nota:* Transfiere el monto exacto en bolívares.`;
  if (moneda === 'USDT') textoPago += `Binance Pay (Correo):\npagos@tuempresa.com`;
  if (moneda === 'EURO') textoPago += `Zinli (Correo):\npagos@tuempresa.com`;

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón abajo:`, {
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
  await ctx.reply('📸 Envía la foto de tu comprobante de pago en este chat ahora.');
});

// --- RECEPCIÓN Y FICHA DE RENTABILIDAD ---
botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();
  
  const compraData = intencionCompra.get(userId) || { servicio: 'No definido', moneda: 'N/A', tasaDia: tasas.fecha, venta: 0, costo: 0, ganancia: 0 };
  pagosPendientes.set(ordenId, { userId, username });

  await ctx.reply('⏳ Tu comprobante ha sido recibido. El departamento de administración lo está verificando.');

  const fichaAdmin = `📋 *FICHA DE VERIFICACIÓN - ORDEN #${ordenId}*\n\n` +
                     `👤 *Cliente:* ${username}\n` +
                     `🛒 *Servicio:* ${compraData.servicio}\n` +
                     `💵 *Moneda de Pago:* ${compraData.moneda}\n` +
                     `📅 *Tasa Aplicada:* ${compraData.tasaDia}\n\n` +
                     `📊 *ANÁLISIS DE RENTABILIDAD:*\n` +
                     `• Cobro: $${compraData.venta}\n` +
                     `• Inversión: $${compraData.costo}\n` +
                     `• *Ganancia Neta: $${compraData.ganancia}*\n\n` +
                     `Verifica la captura adjunta.`;

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

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('⭐ *Mi Suscripción*\n\nAún no tienes suscripciones activas vinculadas.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] } });
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('👤 *Mi Perfil*\n\nHistorial en construcción.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] } });
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📜 *Políticas de Garantía*\n\n1. Garantía de 30 días continuos.\n2. No cambiar contraseñas ni perfiles.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] } });
});


// ==========================================
// 💼 BOT ADMINISTRADOR 
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
    ctx.reply('👑 *PANEL DE CONTROL ADMINISTRATIVO*\n\nBienvenido jefe.', { parse_mode: 'Markdown', reply_markup: panelAdminBotones });
  }
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Actualizando tasas...');
  await actualizarTasas();
  await ctx.reply(`✅ *Tasas Actualizadas:*\nUSDT: ${tasas.usdt}\nEURO: ${tasas.euro}\nBCV: ${tasas.bcv}`, { parse_mode: 'Markdown' });
});

botAdmin.action('admin_ganancias', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('💰 Módulo en construcción.'); });
botAdmin.action('admin_inversion', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📈 Módulo en construcción.'); });
botAdmin.action('admin_clientes', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('👥 Módulo en construcción.'); });
botAdmin.action('admin_stats', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📊 Módulo en construcción.'); });
botAdmin.action('admin_difusion', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📢 Módulo en construcción.'); });
botAdmin.action('admin_suspender', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('🚫 Módulo en construcción.'); });
botAdmin.action('admin_servicios', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('⭐ Módulo en construcción.'); });
botAdmin.action('admin_notas', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('📝 Módulo en construcción.'); });
botAdmin.action('admin_config', async (ctx) => { await ctx.answerCbQuery(); await ctx.reply('⚙️ Módulo en construcción.'); });

botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Procesada anteriormente.');
  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO!*\n\nEn breve te enviaremos tus accesos.', { parse_mode: 'Markdown' });
  await ctx.reply(`✅ *ENTREGA*\n👤 Para: ${orden.username}\n\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Inicio:\n⌛ Corte:\n---`, { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`✅ *APROBADO* (#${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Procesada anteriormente.');
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nProblemas con el comprobante. Contacta soporte.', { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`❌ *RECHAZADO* (#${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botTienda.launch();
botAdmin.launch();
console.log("¡Catálogo dinámico y rentabilidad en línea!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Operativo'); });
server.listen(process.env.PORT || 3000);

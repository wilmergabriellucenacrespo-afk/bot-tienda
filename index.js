const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// Importamos tu nuevo agente de tasas independiente
const tasas = require('./agente.js');

const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

const pagosPendientes = new Map();
const intencionCompra = new Map();

// ==========================================
// 🛒 BOT TIENDA (INTERFAZ EFECTO FANTASMA)
// ==========================================

const menuPrincipal = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Precios", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mi Suscripción", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }],
    [{ text: "🎧 Contactar a Soporte", url: "https://t.me/Mitienda_Adminbot" }]
  ]
};

botTienda.start(async (ctx) => {
  // EFECTO FANTASMA: Borramos el comando /start que escribió el usuario
  await ctx.deleteMessage().catch(() => {});
  
  await ctx.reply(`👋 ¡Hola ${ctx.from.first_name}! Bienvenido a la Tienda.\n\nSelecciona una opción del menú:`, { 
    parse_mode: 'Markdown', 
    reply_markup: menuPrincipal 
  });
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

// --- CATÁLOGO DE SERVICIOS ---
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", venta: 4.00, costo: 2.00 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", venta: 2.50, costo: 1.00 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", venta: 3.00, costo: 1.50 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", venta: 3.00, costo: 1.50 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", venta: 2.50, costo: 1.00 }
];

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  let botones = [];
  for (let i = 0; i < servicios.length; i += 2) {
    let fila = [{ text: servicios[i].nombre, callback_data: `item_${servicios[i].id}` }];
    if (servicios[i + 1]) fila.push({ text: servicios[i + 1].nombre, callback_data: `item_${servicios[i + 1].id}` });
    botones.push(fila);
  }
  // Botón de menú permanente
  botones.push([{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]);

  await ctx.editMessageText('📺 *Catálogo de Servicios Premium*\n\nSelecciona el servicio que deseas adquirir:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } });
});

servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    
    const pUSDT = (servicio.venta * tasas.usdt).toFixed(2);
    const pEUR = (servicio.venta * tasas.euro).toFixed(2);
    const pBCV = (servicio.venta * tasas.bcv).toFixed(2);

    await ctx.editMessageText(`*${servicio.nombre}*\n\n⏳ *Duración:* ${servicio.duracion}\n📅 *Tasa del día:* ${tasas.fecha}\n\n💵 *PRECIOS AL CAMBIO:*\n• USDT (${servicio.venta}$): *${pUSDT} Bs*\n• EUR (${servicio.venta}€): *${pEUR} Bs*\n• VES (BCV ${servicio.venta}$): *${pBCV} Bs*\n\nSi deseas adquirirlo, selecciona realizar pago:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Realizar Pago", callback_data: `pago_${servicio.id}` }],
          [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
        ]
      }
    });
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, venta: servicio.venta, costo: servicio.costo, 
      ganancia: (servicio.venta - servicio.costo).toFixed(2), tasaDia: tasas.fecha 
    });

    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}\n\nSelecciona en qué moneda deseas pagar:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `USDT Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
          [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
          [{ text: "🔙 Volver Atrás", callback_data: `item_${servicio.id}` }, { text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
        ]
      }
    });
  });
});

// --- DATOS BANCARIOS EXACTOS ---
botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  const userId = ctx.from.id;
  await ctx.answerCbQuery();

  let compra = intencionCompra.get(userId) || {};
  compra.moneda = moneda;
  intencionCompra.set(userId, compra);

  let textoPago = `🏦 *DATOS PARA PAGO EN ${moneda}*\n\n`;
  if (moneda === 'BCV') {
    textoPago += `*Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: 04262333684\nCédula: V-27145645\n\n*Monto exacto:* ${(compra.venta * tasas.bcv).toFixed(2)} Bs`;
  }
  if (moneda === 'EURO') {
    textoPago += `*Zinli*\nUsuario / Correo: wilmergabriellucenacrespo\n\n*Monto exacto:* ${compra.venta} €`;
  }
  if (moneda === 'USDT') {
    textoPago += `*Binance Pay*\nCorreo: wilmergabriellucenacrespo@gmail.com\n\n*Monto exacto:* ${compra.venta} USDT`;
  }

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón abajo:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver Atrás", callback_data: `pago_${servicios[0].id}` }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📸 *Sube tu comprobante*\n\nEnvía la foto de tu pago en este chat ahora mismo.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar", callback_data: "menu_inicio" }]] }
  });
});

// --- RECEPCIÓN Y EFECTO FANTASMA DE LA FOTO ---
botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();
  
  // EFECTO FANTASMA: Borramos la foto que envió el usuario de su pantalla
  await ctx.deleteMessage().catch(() => {});

  const compraData = intencionCompra.get(userId) || { servicio: 'No definido', moneda: 'N/A', tasaDia: tasas.fecha, venta: 0, costo: 0, ganancia: 0 };
  pagosPendientes.set(ordenId, { userId, username });

  // Mostramos confirmación limpia
  const mensajeConfirmacion = await ctx.reply('⏳ *Tu comprobante ha sido enviado exitosamente.*\nEl departamento de administración lo está verificando.', { parse_mode: 'Markdown' });
  
  // Borramos el aviso después de 10 segundos para mantener la pantalla impecable
  setTimeout(() => { ctx.telegram.deleteMessage(ctx.chat.id, mensajeConfirmacion.message_id).catch(()=>{}); }, 10000);

  // Enviar ficha al Admin
  const fichaAdmin = `📋 *FICHA DE VERIFICACIÓN - #${ordenId}*\n👤 Cliente: ${username}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${compraData.moneda}\n\n📊 *Rentabilidad:*\nCobro: $${compraData.venta} | Inversión: $${compraData.costo} | *Ganancia: $${compraData.ganancia}*`;

  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  });
});

// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================
// (Aquí mantienes la lógica del bot administrador que ya tenías funcionando)
botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) ctx.reply('👑 *Panel de Administración Activo*', { parse_mode: 'Markdown' });
});

botTienda.launch();
botAdmin.launch();
console.log("¡Interfaz fantasma y agente separados en línea!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Operativo'); });
server.listen(process.env.PORT || 3000);

const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');
const agente = require('./agente.js');

const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

const pagosPendientes = new Map();
const intencionCompra = new Map();

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

botTienda.start(async (ctx) => {
  await ctx.deleteMessage().catch(() => {});
  
  const bienvenida = `👋 ¡Hola ${ctx.from.first_name}! Bienvenido a tu proveedor de confianza.\n\nNos enorgullece ofrecerte servicios de entretenimiento digital de **alta calidad** a precios competitivos. Trabajamos bajo los más estrictos valores de transparencia, asegurando soporte continuo y responsabilidad en nuestras garantías para tu total tranquilidad.\n\nSelecciona una opción para comenzar:`;
  
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery();
  const nombre = ctx.from.first_name || "Usuario";
  await ctx.editMessageText(`👤 *MI PERFIL*\n\n*Nombre:* ${nombre}\n*ID Sistema:* \`${ctx.from.id}\`\n*Estado:* Activo ✅\n\n_Tus datos están protegidos bajo nuestras normas de privacidad._`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`⭐ *MIS SUSCRIPCIONES*\n\nActualmente no posees servicios activos registrados en nuestra base de datos.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`📜 *POLÍTICAS Y GARANTÍAS*\n\n1️⃣ *Garantía Total:* Todos nuestros servicios cuentan con soporte.\n2️⃣ *Reglas de Cuentas:* Queda estrictamente prohibido cambiar contraseñas. Hacerlo anula la garantía de forma inmediata.\n3️⃣ *Pagos:* Todo servicio se entrega únicamente después de verificar el comprobante de pago exitoso.\n\n_Tu compra implica la aceptación de estos términos._`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

// --- CATÁLOGO CON PRECIOS SEPARADOS POR MONEDA ---
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", precio_usdt: 4.00, precio_euro: 5.00, precio_bcv: 6.00, costo: 2.00 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", precio_usdt: 2.50, precio_euro: 3.50, precio_bcv: 4.00, costo: 1.00 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", precio_usdt: 3.00, precio_euro: 4.00, precio_bcv: 5.00, costo: 1.50 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", precio_usdt: 3.00, precio_euro: 4.00, precio_bcv: 5.00, costo: 1.50 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", precio_usdt: 2.50, precio_euro: 3.50, precio_bcv: 4.00, costo: 1.00 }
];

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery();
  let botones = [];
  for (let i = 0; i < servicios.length; i += 2) {
    let fila = [{ text: servicios[i].nombre, callback_data: `item_${servicios[i].id}` }];
    if (servicios[i + 1]) fila.push({ text: servicios[i + 1].nombre, callback_data: `item_${servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]);
  await ctx.editMessageText('📺 *Catálogo de Servicios Premium*\n\nSelecciona el servicio que deseas adquirir:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } });
});

servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    
    if (agente.tasas.bcv === 0) await agente.actualizarTasas();

    const tUSDT = agente.tasas.usdt.toFixed(2);
    const tEUR = agente.tasas.euro.toFixed(2);
    const tBCV = agente.tasas.bcv.toFixed(2);

    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const textoServicio = `*${servicio.nombre}*\n\n` +
      `⏳ *Duración:* ${servicio.duracion}\n` +
      `📅 *Fecha:* ${agente.tasas.fecha}\n\n` +
      `📈 *VALOR DE 1 DÓLAR/EURO HOY:*\n` +
      `• Oficial (BCV): ${tBCV} Bs\n` +
      `• Binance (USDT): ${tUSDT} Bs\n` +
      `• Euro: ${tEUR} Bs\n\n` +
      `💵 *PRECIO DEL SERVICIO AL CAMBIO:*\n` +
      `• BCV (${servicio.precio_bcv}$): *${pBCV} Bs*\n` +
      `• USDT (${servicio.precio_usdt}$): *${pUSDT} Bs*\n` +
      `• EUR (${servicio.precio_euro}€): *${pEUR} Bs*\n\n` +
      `Si deseas adquirir este servicio, selecciona realizar pago:`;

    await ctx.editMessageText(textoServicio, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "💳 Realizar Pago", callback_data: `pago_${servicio.id}` }],
          [{ text: "🔙 Volver Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
        ]
      }
    });
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery();
    
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, 
      costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt,
      precio_euro: servicio.precio_euro,
      precio_bcv: servicio.precio_bcv,
      tasaDia: agente.tasas.fecha 
    });

    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}\n\nSelecciona la moneda y plataforma que utilizarás para transferir:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `USDT Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
          [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
          [{ text: "🔙 Volver Atrás", callback_data: `item_${servicio.id}` }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
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
  
  let montoDivisa = 0;
  let montoBs = 0;

  if (moneda === 'BCV') {
    montoDivisa = compra.precio_bcv;
    montoBs = (compra.precio_bcv * agente.tasas.bcv).toFixed(2);
    compra.venta = compra.precio_bcv;
  } else if (moneda === 'EURO') {
    montoDivisa = compra.precio_euro;
    montoBs = (compra.precio_euro * agente.tasas.euro).toFixed(2);
    compra.venta = compra.precio_euro;
  } else if (moneda === 'USDT') {
    montoDivisa = compra.precio_usdt;
    montoBs = (compra.precio_usdt * agente.tasas.usdt).toFixed(2);
    compra.venta = compra.precio_usdt;
  }

  compra.ganancia = (compra.venta - compra.costo).toFixed(2);
  intencionCompra.set(userId, compra);

  let textoPago = `🏦 *DATOS PARA PAGO EN ${moneda}*\n\n`;
  if (moneda === 'BCV') {
    textoPago += `*Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: 04262333684\nCédula: V-27145645\n\n💵 *Monto Base:* ${montoDivisa} $\n🇻🇪 *MONTO A TRANSFERIR:* ${montoBs} Bs`;
  }
  if (moneda === 'EURO') {
    textoPago += `*Zinli*\nUsuario: wilmergabriellucenacrespo\n\n💵 *Monto Base:* ${montoDivisa} €\n🇻🇪 *Equivalente:* ${montoBs} Bs\n\n*MONTO A TRANSFERIR:* ${montoDivisa} €`;
  }
  if (moneda === 'USDT') {
    textoPago += `*Binance Pay*\nCorreo: wilmergabriellucenacrespo@gmail.com\n\n💵 *Monto Base:* ${montoDivisa} USDT\n🇻🇪 *Equivalente:* ${montoBs} Bs\n\n*MONTO A TRANSFERIR:* ${montoDivisa} USDT`;
  }

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón para enviar tu capture:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Volver Atrás", callback_data: `menu_catalogo` }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📸 *Sube tu comprobante*\n\nEnvía la foto de tu pago en este chat ahora mismo para que nuestro sistema la procese.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar", callback_data: "menu_inicio" }]] }
  });
});

botTienda.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 10000).toString();
  
  await ctx.deleteMessage().catch(() => {});

  const compraData = intencionCompra.get(userId) || { servicio: 'No definido', moneda: 'N/A', tasaDia: agente.tasas.fecha, venta: 0, costo: 0, ganancia: 0 };
  pagosPendientes.set(ordenId, { userId, username });

  await ctx.reply('✅ *Comprobante enviado exitosamente*\n\nEl departamento de administración está verificando tu pago. En breve recibirás tus datos de acceso por esta misma vía.\n\nPuedes seguir navegando:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }],
        [{ text: "🏠 Volver al Menú Principal", callback_data: "menu_inicio" }]
      ]
    }
  });

  const fichaAdmin = `📋 *FICHA DE VERIFICACIÓN - #${ordenId}*\n👤 Cliente: ${username}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${compraData.moneda}\n\n📊 *Rentabilidad:*\nCobro: $${compraData.venta} | Inversión: $${compraData.costo} | *Ganancia: $${compraData.ganancia}*`;

  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar Pago", callback_data: `rechazar_${ordenId}` }]] }
  });
});

// ==========================================
// 💼 BOT ADMINISTRADOR (PANEL OPERATIVO)
// ==========================================

const panelAdminBotones = {
  inline_keyboard: [
    [{ text: "💰 Ver Ganancias", callback_data: "admin_ganancias" }, { text: "👥 Base de Clientes", callback_data: "admin_clientes" }],
    [{ text: "🔄 Forzar Tasa Actual", callback_data: "admin_tasas" }, { text: "⚙️ Configuración", callback_data: "admin_config" }]
  ]
};

botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) ctx.reply('👑 *Panel de Administración Activo*\n\nEl sistema está listo para recibir comprobantes de pago de tus clientes. Usa los botones para gestionar:', { parse_mode: 'Markdown', reply_markup: panelAdminBotones });
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando API oficial...');
  await agente.actualizarTasas();
  await ctx.reply(`✅ *Tasas Actualizadas Exitosamente:*\nUSDT: ${agente.tasas.usdt}\nEURO: ${agente.tasas.euro}\nBCV: ${agente.tasas.bcv}\n\nFecha: ${agente.tasas.fecha}`, { parse_mode: 'Markdown' });
});

botAdmin.action('admin_ganancias', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('💰 *Módulo de Ganancias*\n\nEsta sección totalizará automáticamente tus ganancias basándose en los pagos aprobados.', { parse_mode: 'Markdown' });
});

botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('👥 *Base de Clientes*\n\nAquí verás el registro de usuarios y sus días restantes.', { parse_mode: 'Markdown' });
});

botAdmin.action('admin_config', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('⚙️ *Configuración del Sistema*\n\nPanel de ajustes y modificación de cuentas.', { parse_mode: 'Markdown' });
});

botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada anteriormente.');

  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO EXITOSAMENTE!*\n\nEn breve te enviaremos tus datos de acceso.', { parse_mode: 'Markdown' });

  const plantilla = `✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia este mensaje, complétalo y envíalo:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha de Inicio:\n⌛ Fecha de Corte:\n---`;
  await ctx.reply(plantilla, { parse_mode: 'Markdown' });

  await ctx.editMessageCaption(`✅ *PAGO APROBADO Y ENTREGADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada anteriormente.');
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHemos encontrado un problema al verificar tu comprobante. Por favor, asegúrate de que la captura sea legible o contacta a nuestro soporte para resolverlo.', { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`❌ *PAGO RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botTienda.launch();
botAdmin.launch();
console.log("¡Sistema completo con camuflaje de tasas en línea!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Operativo al máximo nivel'); });
server.listen(process.env.PORT || 3000);

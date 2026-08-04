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
  const bienvenida = `👋 ¡Hola ${ctx.from.first_name}! Bienvenido a tu proveedor de confianza.\n\nNos enorgullece ofrecerte servicios de entretenimiento digital de **alta calidad** a precios competitivos. Trabajamos bajo los más estrictos valores de transparencia, asegurando soporte continuo y responsabilidad en nuestras garantías.\n\nSelecciona una opción para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal });
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`👤 *MI PERFIL*\n\n*Nombre:* ${ctx.from.first_name}\n*ID Sistema:* \`${ctx.from.id}\`\n*Estado:* Activo ✅\n\n_Tus datos están protegidos._`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`⭐ *MIS SUSCRIPCIONES*\n\nActualmente no posees servicios activos.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`📜 *POLÍTICAS Y GARANTÍAS*\n\n1️⃣ *Garantía Total:* Soporte durante todos los días contratados.\n2️⃣ *Reglas:* Queda prohibido cambiar contraseñas o perfiles. Hacerlo anula la garantía de inmediato.\n3️⃣ *Pagos:* El servicio se entrega tras verificar el pago exitoso.\n\n_Tu compra implica aceptar estos términos._`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  });
});

// --- ESTUDIO DE MERCADO APLICADO (Costos vs Ganancias con riesgo de moneda) ---
// Costo: Lo que te cuesta a ti.
// USDT: Precio más barato. EUR: Precio medio. BCV: Precio premium para cubrir devaluación.
const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
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
    
    // Filtro estricto: Si la tasa es 0 por algún reinicio del servidor, lo frenamos y hacemos que actualice de emergencia.
    if (agente.tasas.bcv === 0) {
      await ctx.answerCbQuery('🔄 Calculando tasas del día... Intenta en 3 segundos.', { show_alert: true });
      await agente.actualizarTasas();
      return; // Detiene la ejecución para no mostrar 0.
    }
    
    await ctx.answerCbQuery();

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
      `💵 *PRECIO DEL SERVICIO SEGÚN MÉTODO DE PAGO:*\n` +
      `• Pago Móvil (BCV ${servicio.precio_bcv}$): *${pBCV} Bs*\n` +
      `• Binance (USDT ${servicio.precio_usdt}$): *${pUSDT} Bs*\n` +
      `• Zinli (EUR ${servicio.precio_euro}€): *${pEUR} Bs*\n\n` +
      `Si deseas adquirir este servicio, presiona "Realizar Pago":`;

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

    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}\n\nSelecciona la moneda con la que vas a pagar:`, {
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

  let compra = intencionCompra.get(userId);
  compra.moneda = moneda;
  
  let montoDivisa = 0;
  let montoBs = 0;

  // Lógica clara para evitar que el usuario se equivoque
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
    textoPago += `*Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: 04262333684\nCédula: V-27145645\n\n💵 Precio Base: ${montoDivisa} $\n🇻🇪 *MONTO EXACTO A TRANSFERIR: ${montoBs} Bs*`;
  }
  if (moneda === 'EURO') {
    textoPago += `*Zinli*\nUsuario: wilmergabriellucenacrespo\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa} €*\n_(Equivalente a ${montoBs} Bs)_`;
  }
  if (moneda === 'USDT') {
    textoPago += `*Binance Pay*\nCorreo: wilmergabriellucenacrespo@gmail.com\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa} USDT*\n_(Equivalente a ${montoBs} Bs)_`;
  }

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón para enviar tu comprobante:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Cambiar Moneda", callback_data: `pago_${servicios.find(s => s.nombre === compra.servicio).id}` }],
        [{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  });
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('📸 *Sube tu comprobante*\n\nEnvía la foto de tu pago en este chat ahora mismo para que nuestro sistema la procese.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar y Volver", callback_data: "menu_inicio" }]] }
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

  await ctx.reply('✅ *Comprobante enviado exitosamente*\n\nEl departamento de administración está verificando tu pago. En breve recibirás tus datos de acceso por esta misma vía.', {
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
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  });
});

// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================

const panelAdminBotones = {
  inline_keyboard: [
    [{ text: "💰 Ver Ganancias", callback_data: "admin_ganancias" }, { text: "👥 Base de Clientes", callback_data: "admin_clientes" }],
    [{ text: "🔄 Forzar Tasa Actual", callback_data: "admin_tasas" }, { text: "⚙️ Configuración", callback_data: "admin_config" }]
  ]
};

botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) ctx.reply('👑 *Panel de Administración Activo*', { parse_mode: 'Markdown', reply_markup: panelAdminBotones });
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando APIs oficiales...');
  await agente.actualizarTasas();
  await ctx.reply(`✅ *Tasas Actualizadas Exitosamente:*\nUSDT: ${agente.tasas.usdt}\nEURO: ${agente.tasas.euro}\nBCV: ${agente.tasas.bcv}\n\nFecha: ${agente.tasas.fecha}`, { parse_mode: 'Markdown' });
});

botAdmin.action('admin_ganancias', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('💰 *Módulo de Ganancias*\n\nSección lista para ser integrada con Firebase.', { parse_mode: 'Markdown' });
});

botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('👥 *Base de Clientes*\n\nSección lista para ser integrada con Firebase.', { parse_mode: 'Markdown' });
});

botAdmin.action('admin_config', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('⚙️ *Configuración del Sistema*\n\nEn construcción.', { parse_mode: 'Markdown' });
});

botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');

  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO EXITOSAMENTE!*\n\nEn breve te enviaremos tus datos de acceso.', { parse_mode: 'Markdown' });
  await ctx.reply(`✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia este mensaje, complétalo y envíalo:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha de Inicio:\n⌛ Fecha de Corte:\n---`, { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`✅ *PAGO APROBADO Y ENTREGADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.');
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHemos encontrado un problema al verificar tu comprobante. Contacta a nuestro soporte.', { parse_mode: 'Markdown' });
  await ctx.editMessageCaption(`❌ *PAGO RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' });
  pagosPendientes.delete(ordenId);
});

botTienda.launch();
botAdmin.launch();
console.log("¡Sistema completo con prevención anti-cero y análisis de mercado!");

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Operativo'); });
server.listen(process.env.PORT || 3000);

// ESCUDOS GLOBALES (Evitan que el bot muera por fallos de red)
process.on('uncaughtException', (err) => console.log('Error global evitado:', err.message));
process.on('unhandledRejection', (err) => console.log('Promesa rechazada evitada:', err.message));

const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');
const agente = require('./agente.js');

const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Encendemos el agente de tasas conectándolo a la base de datos
agente.iniciar(db).catch(console.error);

const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

const pagosPendientes = new Map();
const intencionCompra = new Map();

// ==========================================
// 🛒 BOT TIENDA (TODO RESTAURADO)
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
  const bienvenida = `👋 ¡Hola ${ctx.from.first_name}! Bienvenido a tu proveedor de confianza.\n\nOfrecemos servicios de entretenimiento digital de **alta calidad** a precios competitivos. Trabajamos bajo los más estrictos valores de transparencia, asegurando soporte continuo y responsabilidad.\n\nSelecciona una opción para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipal }).catch(()=>{});
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📺 *Menú Principal*\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: menuPrincipal }).catch(()=>{});
});

// --- FUNCIONES COMPLETAS DE PERFIL, POLÍTICAS Y SUSCRIPCIÓN ---

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`👤 *MI PERFIL*\n\n*Nombre:* ${ctx.from.first_name}\n*ID Sistema:* \`${ctx.from.id}\`\n*Estado:* Activo ✅\n\n_Tus datos están protegidos en nuestra base de datos._`, {
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`⭐ *MIS SUSCRIPCIONES*\n\nActualmente no posees servicios activos. Ve a nuestro catálogo para realizar tu primera compra.`, {
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`📜 *POLÍTICAS Y GARANTÍAS*\n\n1️⃣ **Garantía Total:** Tienes soporte durante los días exactos contratados.\n2️⃣ **Reglas de Uso:** Queda estrictamente prohibido cambiar contraseñas, correos o pines. Hacerlo anula tu garantía de forma inmediata.\n3️⃣ **Condición de Entrega:** Todo servicio se entrega únicamente tras verificar el comprobante de pago exitoso.\n\n_Realizar una compra implica la aceptación de todos estos términos._`, {
    parse_mode: 'Markdown', 
    reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

// --- CATÁLOGO Y PRECIOS ---

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let botones = [];
  for (let i = 0; i < agente.servicios.length; i += 2) {
    let fila = [{ text: agente.servicios[i].nombre, callback_data: `item_${agente.servicios[i].id}` }];
    if (agente.servicios[i + 1]) fila.push({ text: agente.servicios[i + 1].nombre, callback_data: `item_${agente.servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]);
  await ctx.editMessageText('📺 *Catálogo de Servicios Premium*\n\nSelecciona el servicio que deseas adquirir:', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } }).catch(()=>{});
});

agente.servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});

    const tUSDT = agente.tasas.usdt.toFixed(2);
    const tEUR = agente.tasas.euro.toFixed(2);
    const tBCV = agente.tasas.bcv.toFixed(2);

    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const textoServicio = `*${servicio.nombre}*\n\n` +
      `⏳ *Duración:* ${servicio.duracion}\n` +
      `📅 *Fecha:* ${agente.tasas.fecha}\n\n` +
      `📈 *TASAS DE HOY (VALOR DE 1 DÓLAR/EURO):*\n` +
      `• BCV: ${tBCV} Bs\n` +
      `• Binance: ${tUSDT} Bs\n` +
      `• Euro: ${tEUR} Bs\n\n` +
      `💵 *PRECIO DEL SERVICIO AL CAMBIO:*\n` +
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
    }).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, 
      costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt,
      precio_euro: servicio.precio_euro,
      precio_bcv: servicio.precio_bcv,
      tasaDia: agente.tasas.fecha 
    });

    await ctx.editMessageText(`💳 *SELECCIONA TU MÉTODO DE PAGO*\n\nServicio: ${servicio.nombre}\n\nSelecciona la moneda con la que vas a transferir:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: `USDT Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
          [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
          [{ text: "🔙 Volver Atrás", callback_data: `item_${servicio.id}` }, { text: "🏠 Menú Principal", callback_data: "menu_inicio" }]
        ]
      }
    }).catch(()=>{});
  });
});

botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  const userId = ctx.from.id;
  await ctx.answerCbQuery().catch(()=>{});

  let compra = intencionCompra.get(userId);
  if (!compra) return ctx.editMessageText("Tiempo de sesión agotado. Vuelve al menú principal.", { reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] }}).catch(()=>{});
  
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
    textoPago += `*Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: 04262333684\nCédula: V-27145645\n\n💵 Precio del Servicio: ${montoDivisa} $\n🇻🇪 *MONTO EXACTO A TRANSFERIR: ${montoBs} Bs*`;
  }
  if (moneda === 'EURO') {
    textoPago += `*Zinli*\nUsuario: wilmergabriellucenacrespo\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa} €*\n_(Equivale a ${montoBs} Bs)_`;
  }
  if (moneda === 'USDT') {
    textoPago += `*Binance Pay*\nCorreo: wilmergabriellucenacrespo@gmail.com\n\n💵 *MONTO EXACTO A TRANSFERIR: ${montoDivisa} USDT*\n_(Equivale a ${montoBs} Bs)_`;
  }

  const servicioIdInfo = agente.servicios.find(s => s.nombre === compra.servicio);
  const backData = servicioIdInfo ? `pago_${servicioIdInfo.id}` : "menu_catalogo";

  await ctx.editMessageText(`${textoPago}\n\nUna vez realices la transferencia, presiona el botón de abajo para enviar tu comprobante:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📤 Subir Comprobante", callback_data: "subir_pago" }],
        [{ text: "🔙 Cambiar Moneda", callback_data: backData }],
        [{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]
      ]
    }
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Sube tu comprobante*\n\nEnvía la foto de tu transferencia o pago en este chat ahora mismo para que nuestro sistema la procese.', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar y Volver al Menú", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
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
  }).catch(()=>{});

  const fichaAdmin = `📋 *FICHA DE ORDEN #${ordenId}*\n👤 Cliente: ${username}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${compraData.moneda}\n\n📊 *Rentabilidad:*\nCobro: $${compraData.venta} | Inversión: $${compraData.costo} | *Ganancia: $${compraData.ganancia}*`;

  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  }).catch(()=>{});
});

// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================
const panelAdminBotones = {
  inline_keyboard: [
    [{ text: "💰 Ver Ganancias", callback_data: "admin_ganancias" }, { text: "👥 Base Clientes", callback_data: "admin_clientes" }],
    [{ text: "🔄 Forzar Tasa API", callback_data: "admin_tasas" }, { text: "✏️ Fijar Tasa Manual", callback_data: "admin_tasas_manual" }]
  ]
};

botAdmin.start((ctx) => {
  if (ctx.from.id === MI_ID) ctx.reply('👑 *Panel de Administración Activo*\n\nSelecciona una opción:', { parse_mode: 'Markdown', reply_markup: panelAdminBotones }).catch(()=>{});
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando API directamente...').catch(()=>{});
  await agente.actualizarTasas();
  await ctx.reply(`✅ *Tasas Actualizadas y Guardadas en Base de Datos:*\nUSDT: ${agente.tasas.usdt}\nEURO: ${agente.tasas.euro}\nBCV: ${agente.tasas.bcv}\n\nEstado: ${agente.tasas.fecha}`, { parse_mode: 'Markdown' }).catch(()=>{});
});

botAdmin.action('admin_tasas_manual', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.reply('✏️ *MODO MANUAL DE TASAS ACTIVADO*\n\nSi necesitas corregir una tasa urgente, envía un mensaje con este formato exacto respetando el espacio:\n\n`TASA BCV 36.60`\n`TASA USDT 41.50`\n`TASA EURO 44.00`', { parse_mode: 'Markdown' }).catch(()=>{});
});

botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id === MI_ID) {
    const texto = ctx.message.text.toUpperCase();
    if (texto.startsWith('TASA ')) {
      const partes = texto.split(' ');
      if (partes.length === 3) {
        const moneda = partes[1];
        const valor = parseFloat(partes[2]);
        if (valor > 0 && ['BCV', 'USDT', 'EURO'].includes(moneda)) {
          await agente.setTasaManual(moneda, valor);
          return ctx.reply(`✅ *ÉXITO:* La tasa de ${moneda} ha sido actualizada manualmente a **${valor}**. La tienda entera operará con este nuevo valor.`, { parse_mode: 'Markdown' }).catch(()=>{});
        }
      }
      return ctx.reply('❌ Formato incorrecto. Ejemplo de escritura: TASA BCV 36.60').catch(()=>{});
    }
  }
  return next();
});

botAdmin.action('admin_ganancias', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.reply('💰 *Módulo de Ganancias*\n\nListo para integrar con tu Base de Datos Firebase.', { parse_mode: 'Markdown' }).catch(()=>{});
});

botAdmin.action('admin_clientes', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.reply('👥 *Base de Clientes*\n\nListo para integrar con tu Base de Datos Firebase.', { parse_mode: 'Markdown' }).catch(()=>{});
});

botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.').catch(()=>{});

  await botTienda.telegram.sendMessage(orden.userId, '✅ *¡TU PAGO HA SIDO APROBADO EXITOSAMENTE!*\n\nEn breve te enviaremos tus datos de acceso a través de este chat.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.reply(`✅ *ENTREGA DE SERVICIO*\n👤 Para: ${orden.username}\n\nCopia este mensaje, llénalo y envíaselo:\n---\n📧 Correo:\n🔑 Contraseña:\n📅 Fecha de Inicio:\n⌛ Fecha de Corte:\n---`, { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.editMessageCaption(`✅ *PAGO APROBADO Y ENTREGADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' }).catch(()=>{});
  pagosPendientes.delete(ordenId);
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue procesada.').catch(()=>{});
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHemos encontrado un problema al verificar tu comprobante de pago. Por favor, asegúrate de enviar una imagen clara o contacta a soporte para solucionar el inconveniente.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.editMessageCaption(`❌ *PAGO RECHAZADO* (Orden #${ordenId})`, { parse_mode: 'Markdown' }).catch(()=>{});
  pagosPendientes.delete(ordenId);
});

botTienda.launch().then(() => console.log("Tienda iniciada exitosamente.")).catch(err => console.log("Error al iniciar Tienda:", err.message));
botAdmin.launch().then(() => console.log("Panel Admin iniciado exitosamente.")).catch(err => console.log("Error al iniciar Admin:", err.message));

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Dual Restaurado 100%'); });
server.listen(process.env.PORT || 3000);

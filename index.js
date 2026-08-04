// ESCUDOS GLOBALES
process.on('uncaughtException', (err) => console.log('Error global evitado:', err.message));
process.on('unhandledRejection', (err) => console.log('Promesa rechazada evitada:', err.message));

const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');
const agente = require('./agente.js');

const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

agente.iniciar(db).catch(console.error);

const botTienda = new Telegraf(process.env.TELEGRAM_TOKEN);
const botAdmin = new Telegraf(process.env.ADMIN_TOKEN);
const MI_ID = 8264753970;

// ==========================================
// 🧠 MEMORIA Y ESTADOS
// ==========================================
const pagosPendientes = new Map(); 
const intencionCompra = new Map(); 
const adminEstados = new Map(); 
const userEstados = new Map(); 
const baneados = new Set(); 

db.collection('blacklist').get().then(snap => snap.forEach(doc => baneados.add(parseInt(doc.id)))).catch(()=>{});

botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `💬 *MENSAJE DE SOPORTE*\n👤 De: ${ctx.from.first_name}\n\n*Dice:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(()=>{});
    return ctx.reply('✅ _Mensaje enviado al administrador._', { parse_mode: 'Markdown' }).catch(()=>{});
  }
  return next();
});

// ==========================================
// 🛒 BOT TIENDA - MÓDULO DE USUARIOS
// ==========================================
const menuPrincipalUsuario = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Compras", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mis Suscripciones", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }],
    [{ text: "🎧 Soporte Administrativo", callback_data: "activar_soporte" }]
  ]
};

botTienda.start(async (ctx) => {
  userEstados.delete(ctx.from.id);
  try {
    const userRef = db.collection('usuarios').doc(ctx.from.id.toString());
    const doc = await userRef.get();
    if (!doc.exists) {
      await botAdmin.telegram.sendMessage(MI_ID, `🌟 *NUEVO CLIENTE REGISTRADO*\n👤 Nombre: ${ctx.from.first_name}\n🔗 User: @${ctx.from.username || 'SinUser'}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
    await userRef.set({ id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString() }, { merge: true });
  } catch (e) {}
  
  await ctx.deleteMessage().catch(()=>{});
  const bienvenida = `👋 *¡Hola ${ctx.from.first_name}!* Bienvenido a tu tienda premium. 🚀\n\nOfrecemos servicios de alta calidad con garantía y soporte rápido. Selecciona una opción:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.delete(ctx.from.id);
  await ctx.editMessageText(`🏠 *Menú Principal*\nSelecciona la acción que deseas realizar:`, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `📜 *POLÍTICAS Y GARANTÍAS*\n\n1️⃣ **Soporte Total:** Garantía válida por los días exactos contratados.\n2️⃣ **Prohibiciones:** ESTRICTAMENTE PROHIBIDO cambiar correos, contraseñas o perfiles. Si lo haces, pierdes la garantía inmediatamente.\n3️⃣ **Entrega:** Las cuentas se entregan solo tras confirmación del pago.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`👤 *MI PERFIL*\n\n*Nombre:* ${ctx.from.first_name}\n*ID Sistema:* \`${ctx.from.id}\``, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🧾 Historial de Compras", callback_data: "historial_pagos" }], [{ text: "🔙 Volver", callback_data: "menu_inicio" }]]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery('Buscando pagos...').catch(()=>{});
  let msj = `🧾 *HISTORIAL DE COMPRAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `Aún no hay compras registradas.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const fecha = new Date(p.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short' });
        msj += `✅ *${p.servicio}* | 📅 ${fecha}\n💵 Costo: ${p.monto} ${p.moneda}\n\n`;
      });
    }
  } catch(e) { msj += `Error al cargar base de datos.`; }
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Regresar", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

// --- SUSCRIPCIONES Y CUENTA REGRESIVA DINÁMICA ---
botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery('Calculando días restantes...').catch(()=>{});
  let msj = `⭐ *MIS CUENTAS ACTIVAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) {
      msj += `No tienes servicios activos actualmente.`;
    } else { 
      const hoy = new Date();
      snap.forEach(doc => { 
        const sub = doc.data(); 
        const fechaCorte = new Date(sub.fecha_corte);
        const diasRestantes = Math.ceil((fechaCorte - hoy) / (1000 * 60 * 60 * 24));
        
        if (diasRestantes > 0) {
          msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n⏳ *Vence en:* ${diasRestantes} días\n〰️〰️〰️〰️〰️〰️〰️〰️\n`; 
        } else {
          msj += `📺 *${sub.servicio}*\n⚠️ *Servicio Vencido*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
        }
      }); 
    }
  } catch (error) { msj += `Error de red. Intenta más tarde.`; }
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🎧 *SOPORTE ACTIVADO*\n\nEscribe tu duda o problema abajo. Todo será enviado a la administración:`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cerrar Chat", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

// --- CATÁLOGO ---
botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `📺 *CATÁLOGO DE SERVICIOS*\n\n📈 *TASAS DEL DÍA (Valor de 1$):*\n• USDT: ${agente.tasas.usdt.toFixed(2)} Bs\n• EURO: ${agente.tasas.euro.toFixed(2)} Bs\n• BCV: ${agente.tasas.bcv.toFixed(2)} Bs\n\n👇 *Selecciona un servicio:*`;
  let botones = [];
  for (let i = 0; i < agente.servicios.length; i += 2) {
    let fila = [{ text: agente.servicios[i].nombre, callback_data: `item_${agente.servicios[i].id}` }];
    if (agente.servicios[i + 1]) fila.push({ text: agente.servicios[i + 1].nombre, callback_data: `item_${agente.servicios[i + 1].id}` });
    botones.push(fila);
  }
  botones.push([{ text: "🔙 Volver", callback_data: "menu_inicio" }]);
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botones } }).catch(()=>{});
});

agente.servicios.forEach(servicio => {
  botTienda.action(`item_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    const pUSDT = (servicio.precio_usdt * agente.tasas.usdt).toFixed(2);
    const pEUR = (servicio.precio_euro * agente.tasas.euro).toFixed(2);
    const pBCV = (servicio.precio_bcv * agente.tasas.bcv).toFixed(2);

    const txt = `*${servicio.nombre}*\n⏳ *Duración:* ${servicio.duracion}\n\n` +
      `💵 *PRECIO DEL SERVICIO:*\n` +
      `• USDT: *$${servicio.precio_usdt}* ➔ (${pUSDT} Bs)\n` +
      `• EURO: *$${servicio.precio_euro}* ➔ (${pEUR} Bs)\n` +
      `• BCV: *$${servicio.precio_bcv}* ➔ (${pBCV} Bs)\n\n` +
      `Si deseas continuar, elige "Comprar":`;

    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "💳 Comprar", callback_data: `pago_${servicio.id}` }],
      [{ text: "🔙 Atrás", callback_data: "menu_catalogo" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt, precio_euro: servicio.precio_euro, precio_bcv: servicio.precio_bcv,
    });
    
    await ctx.editMessageText(`💳 *MÉTODO DE PAGO*\n\nSelecciona con qué moneda pagarás *${servicio.nombre}*:`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `USDT TRC20 / Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
        [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Cancelar", callback_data: `item_${servicio.id}` }]
      ]}
    }).catch(()=>{});
  });
});

botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  await ctx.answerCbQuery().catch(()=>{});
  let compra = intencionCompra.get(ctx.from.id);
  
  if (!compra) return ctx.editMessageText("❌ Sesión agotada. Inicia la compra de nuevo.", { reply_markup: { inline_keyboard: [[{ text: "🏠 Menú", callback_data: "menu_inicio" }]] }}).catch(()=>{});
  
  compra.moneda = moneda;
  let montoBs = 0, montoDivisa = compra[`precio_${moneda.toLowerCase()}`];
  compra.venta = montoDivisa;
  compra.ganancia = (compra.venta - compra.costo).toFixed(2);

  // TEXTOS DE PAGO: SIEMPRE SE MUESTRA PAGO MÓVIL TAMBIÉN
  let textoPago = `🏦 *DATOS PARA TRANSFERIR EN ${moneda}*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  const datosPagoMovil = `\n🏦 *Datos de Pago Móvil (Alternativa)*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\``;
  
  if (moneda === 'USDT') { 
    montoBs = (montoDivisa * agente.tasas.usdt).toFixed(2); 
    textoPago += `*USDT (Binance / TRC20)*\nCorreo Binance: \`tu_correo@gmail.com\`\nBilletera TRC20: \`TNCFjTLYp63k2ocAooAnTUJbodaWLrRQhh\`\n\n💵 *MONTO EXACTO: ${montoDivisa} USDT*\n${datosPagoMovil}\n🇻🇪 *MONTO EN BS: ${montoBs} Bs*`; 
  }
  if (moneda === 'EURO') { 
    montoBs = (montoDivisa * agente.tasas.euro).toFixed(2); 
    textoPago += `*Zinli*\nCorreo: \`wilmergabriellucenacrespo\`\n\n💵 *MONTO EXACTO: ${montoDivisa} €*\n${datosPagoMovil}\n🇻🇪 *MONTO EN BS: ${montoBs} Bs*`; 
  }
  if (moneda === 'BCV') { 
    montoBs = (montoDivisa * agente.tasas.bcv).toFixed(2); 
    textoPago += `*Pago Móvil Principal*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\`\n\n🇻🇪 *MONTO EXACTO: ${montoBs} Bs*`; 
  }

  intencionCompra.set(ctx.from.id, compra);
  await ctx.editMessageText(`${textoPago}\n\n1️⃣ Realiza el pago.\n2️⃣ Presiona el botón de abajo para subir el comprobante.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📤 Ya pagué (Subir Capture)", callback_data: "subir_pago" }],
      [{ text: "🔙 Elegir Otra Moneda", callback_data: `pago_${compra.id_servicio}` }]
    ]}
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Enviar Comprobante*\n\nPor favor, adjunta y envía la foto de tu pago en este chat ahora mismo.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar Compra", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.on('photo', async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  
  const compraData = intencionCompra.get(ctx.from.id);
  if (!compraData) return ctx.reply("❌ *No tienes compras pendientes.*", { parse_mode: 'Markdown' }).catch(()=>{});

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {});
  
  pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, fileId });

  await ctx.reply('✅ *Comprobante en Revisión*\n\nEl administrador ha sido notificado en tiempo real. Tus datos de acceso llegarán por aquí pronto.', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú Principal", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});

  // ENVÍO EN TIEMPO REAL AL ADMIN CON BOTONES
  const fichaAdmin = `🔔 *¡NUEVO PAGO RECIBIDO! (Orden #${ordenId})*\n\n👤 Cliente: ${ctx.from.first_name}\n🛒 Servicio: ${compraData.servicio}\n💵 Método: ${compraData.moneda}\n💰 Ganancia: $${compraData.ganancia}`;
  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  }).catch(()=>{});
  
  intencionCompra.delete(ctx.from.id);
});

// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================
function obtenerMenuAdmin() {
  return {
    inline_keyboard: [
      [{ text: "👥 Base Clientes", callback_data: "admin_clientes" }, { text: "📊 Reporte Ventas", callback_data: "admin_reportes" }],
      [{ text: "🔄 Actualizar Tasas API", callback_data: "admin_tasas" }],
      [{ text: "✏️ Configurar Tasa Manual", callback_data: "admin_tasas_manual" }]
    ]
  };
}

const btnVolverAdmin = { inline_keyboard: [[{ text: "🔙 Volver al Panel", callback_data: "admin_inicio" }]] };

botAdmin.start(async (ctx) => {
  if (ctx.from.id !== MI_ID) return;
  adminEstados.clear();
  await ctx.reply('👑 *PANEL DE CONTROL ADMINISTRATIVO*\n\nLos pagos llegarán aquí automáticamente.', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  await ctx.editMessageText('👑 *PANEL DE CONTROL ADMINISTRATIVO*', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

// --- PLANTILLA PRECARGADA DE APROBACIÓN ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue aprobada o rechazada.', { show_alert: true }).catch(()=>{});

  adminEstados.set('ENTREGANDO', orden);
  await ctx.deleteMessage().catch(()=>{}); // Borra el comprobante para limpiar el chat

  // Plantilla Monoespaciada (Fácil de copiar tocándola)
  const plantilla = `Correo: \nClave: `;
  
  const msg = `✅ *PAGO APROBADO* (Orden #${ordenId})\n\nCopia la plantilla de abajo, llénala y envíala. *El bot calculará los 30 días automáticamente.*\n\n\`${plantilla}\``;
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar Entrega", callback_data: "admin_inicio" }]] } }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden ya procesada.', { show_alert: true }).catch(()=>{});
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHubo un problema al verificar tu comprobante. Verifica con Soporte.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.deleteMessage().catch(()=>{}); 
  pagosPendientes.delete(ordenId);
});

// --- MOTOR DE TEXTOS DEL ADMIN ---
botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id !== MI_ID) return next();
  const texto = ctx.message.text;
  const estadoActual = adminEstados.get('accion');

  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valor = parseFloat(partes[2].replace(',', '.'));
      if (valor > 0) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *TASA FIJADA:* ${moneda} = ${valor}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
      }
    }
  }

  // LÓGICA DE ENTREGA DE CUENTA Y GENERACIÓN DE FECHAS
  if (adminEstados.has('ENTREGANDO')) {
    const orden = adminEstados.get('ENTREGANDO');
    
    // Fechas dinámicas (+30 días)
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + 30);
    
    const strVencimiento = fechaVencimiento.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' });

    // Enviar al cliente
    const msjCliente = `🎉 *¡PAGO VERIFICADO Y APROBADO!*\n\nAquí tienes los accesos para tu cuenta de *${orden.compraData.servicio}*:\n\n${texto}\n\n⏳ *Válido hasta:* ${strVencimiento}\n\n_Recuerda: Puedes ver tus días restantes en cualquier momento yendo a la sección "⭐ Mis Suscripciones" en el menú principal._`;
    await botTienda.telegram.sendMessage(orden.userId, msjCliente, { parse_mode: 'Markdown' }).catch(()=>{});

    // Guardar en Firebase
    const hoyISO = fechaActual.toISOString();
    const vencimientoISO = fechaVencimiento.toISOString();
    
    await db.collection('usuarios').doc(orden.userId.toString()).collection('suscripciones').add({ servicio: orden.compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, fecha_corte: vencimientoISO, estado: 'Activo' }).catch(()=>{});
    await db.collection('usuarios').doc(orden.userId.toString()).collection('pagos').add({ servicio: orden.compraData.servicio, monto: orden.compraData.venta, moneda: orden.compraData.moneda, fecha: hoyISO }).catch(()=>{});
    await db.collection('ventas').doc(orden.ordenId).set({ ordenId: orden.ordenId, clienteId: orden.userId, servicio: orden.compraData.servicio, venta_usd: parseFloat(orden.compraData.venta), ganancia_usd: parseFloat(orden.compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    pagosPendientes.delete(orden.ordenId);
    return ctx.reply(`✅ *Servicio Entregado*\nHistoriales de venta actualizados.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  return next();
});

// Iniciar Bots
botTienda.launch().then(() => console.log("Tienda iniciada.")).catch(console.error);
botAdmin.launch().then(() => console.log("Panel Admin iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema OK'); });
server.listen(process.env.PORT || 3000);

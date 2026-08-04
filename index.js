// ESCUDOS GLOBALES ANTI-CRASH
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

// --- SALUDO DINÁMICO (HORA DE VENEZUELA) ---
function obtenerSaludo() {
  const hora = parseInt(new Date().toLocaleString("es-VE", { timeZone: "America/Caracas", hour: '2-digit', hour12: false }));
  if (hora >= 5 && hora < 12) return "🌤️ ¡Buenos días";
  if (hora >= 12 && hora < 19) return "☀️ ¡Buenas tardes";
  return "🌙 ¡Buenas noches";
}

botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `🚨 *SOPORTE REQUERIDO*\n👤 De: ${ctx.from.first_name}\n\n*Mensaje:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(()=>{});
    await ctx.deleteMessage().catch(()=>{}); // Mantiene la pantalla limpia
    return ctx.reply('✅ _Mensaje enviado al equipo de soporte. Te responderemos por esta misma vía._', { parse_mode: 'Markdown' }).catch(()=>{});
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
    [{ text: "📜 Políticas", callback_data: "menu_politicas" }, { text: "❓ Preguntas Frecuentes", callback_data: "menu_faq" }],
    [{ text: "🎧 Contactar a Soporte", callback_data: "activar_soporte" }]
  ]
};

botTienda.start(async (ctx) => {
  userEstados.delete(ctx.from.id);
  intencionCompra.delete(ctx.from.id); // Limpia carritos viejos
  try {
    const userRef = db.collection('usuarios').doc(ctx.from.id.toString());
    const doc = await userRef.get();
    if (!doc.exists) {
      await botAdmin.telegram.sendMessage(MI_ID, `🌟 *NUEVO CLIENTE REGISTRADO*\n👤 Nombre: ${ctx.from.first_name}\n🔗 User: @${ctx.from.username || 'N/A'}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
    await userRef.set({ id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString() }, { merge: true });
  } catch (e) {}
  
  await ctx.deleteMessage().catch(()=>{});
  const bienvenida = `${obtenerSaludo()} ${ctx.from.first_name}!* 👋\n\nBienvenido a tu plataforma de entretenimiento digital. Ofrecemos servicios de alta calidad con garantía total y soporte rápido.\n\nSelecciona una opción del menú para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.delete(ctx.from.id);
  intencionCompra.delete(ctx.from.id);
  await ctx.editMessageText(`🏠 *Menú Principal*\n¿Qué deseas hacer hoy?`, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

// --- NUEVO: PREGUNTAS FRECUENTES (FAQ) ---
botTienda.action('menu_faq', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > ❓ *Preguntas Frecuentes*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n🔹 *¿Cuánto tarda la entrega?*\nR: Una vez envíes el comprobante, validamos tu pago y entregamos en un lapso de 5 a 15 minutos.\n\n🔹 *¿Qué pasa si mi pantalla deja de funcionar?*\nR: Escribe a nuestro soporte. Tienes garantía total durante tus 30 días, te la repondremos.\n\n🔹 *¿Puedo pagar desde otro banco?*\nR: Sí, vía Pago Móvil aceptamos transferencias desde cualquier banco nacional.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > 📜 *Políticas y Garantías*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n1️⃣ **Garantía Exacta:** Cubrimos el 100% de los días contratados.\n2️⃣ **Prohibiciones:** ESTRICTAMENTE PROHIBIDO cambiar correos, contraseñas o pines. Hacerlo anula la garantía permanentemente.\n3️⃣ **Condición de Venta:** Las cuentas se entregan solo tras confirmación del pago efectivo.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// --- PERFIL TIPO CARNET ---
botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`🏠 Inicio > 👤 *Mi Perfil Digital*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🪪 *Cliente:* ${ctx.from.first_name}\n🔑 *ID Único:* \`${ctx.from.id}\`\n🟢 *Estado:* Verificado\n\n_Tu información de compras está encriptada y segura._`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🧾 Mi Historial de Pagos", callback_data: "historial_pagos" }], [{ text: "🔙 Volver al Menú", callback_data: "menu_inicio" }]]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery('Consultando bóveda de datos...').catch(()=>{});
  let msj = `🏠 Inicio > 👤 Perfil > 🧾 *Historial*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `Aún no hay compras registradas.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const fecha = new Date(p.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short' });
        msj += `✅ *${p.servicio}* | 📅 ${fecha}\n💵 Inversión: ${p.monto} ${p.moneda}\n\n`;
      });
    }
  } catch(e) { msj += `Error al cargar base de datos.`; }
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Regresar", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

// --- SUSCRIPCIONES CON SEMÁFORO ---
botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery('Calculando vigencias...').catch(()=>{});
  let msj = `🏠 Inicio > ⭐ *Mis Cuentas Activas*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) {
      msj += `No tienes servicios activos actualmente.\n¡Visita el catálogo para adquirir uno!`;
    } else { 
      const hoy = new Date();
      snap.forEach(doc => { 
        const sub = doc.data(); 
        const fechaCorte = new Date(sub.fecha_corte);
        const diasRestantes = Math.ceil((fechaCorte - hoy) / (1000 * 60 * 60 * 24));
        
        let semaforo = '🟢';
        if (diasRestantes <= 3 && diasRestantes > 0) semaforo = '🟡 *(¡Pronto a vencer!)*';
        if (diasRestantes <= 0) semaforo = '🔴 *(Vencido)*';

        msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n⏳ *Vigencia:* ${semaforo} ${diasRestantes > 0 ? diasRestantes + ' días' : ''}\n〰️〰️〰️〰️〰️〰️〰️〰️\n`; 
      }); 
    }
  } catch (error) { msj += `Error de red. Intenta más tarde.`; }
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }],
    [{ text: "🔙 Volver", callback_data: "menu_inicio" }]
  ] } }).catch(()=>{});
});

botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🏠 Inicio > 🎧 *Soporte Técnico*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\nEscribe tu duda o reporte en un solo mensaje abajo.\nTodo será enviado a nuestra central administrativa de inmediato:`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cancelar y Volver", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

// --- CATÁLOGO ---
botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `🏠 Inicio > 🛒 *Catálogo*\n〰️〰️〰️〰️〰️〰️〰️〰️\n📈 *REFERENCIA CAMBIARIA HOY:*\n• USDT: ${agente.tasas.usdt.toFixed(2)} Bs\n• EURO: ${agente.tasas.euro.toFixed(2)} Bs\n• BCV: ${agente.tasas.bcv.toFixed(2)} Bs\n\n👇 *Elige un servicio premium:*`;
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

    const txt = `🏠 Inicio > 🛒 Catálogo > *${servicio.nombre}*\n〰️〰️〰️〰️〰️〰️〰️〰️\n⏳ *Duración:* ${servicio.duracion}\n\n` +
      `💵 *INVERSIÓN POR MONEDA:*\n` +
      `• Pago Móvil: *$${servicio.precio_bcv}* ➔ (${pBCV} Bs)\n` +
      `• USDT (Binance): *$${servicio.precio_usdt}* ➔ (${pUSDT} Bs)\n` +
      `• EURO (Zinli): *$${servicio.precio_euro}* ➔ (${pEUR} Bs)\n\n` +
      `¿Listo para disfrutar? Haz clic abajo:`;

    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "💳 Iniciar Pago", callback_data: `pago_${servicio.id}` }],
      [{ text: "🔙 Atrás", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    intencionCompra.set(ctx.from.id, { 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      precio_usdt: servicio.precio_usdt, precio_euro: servicio.precio_euro, precio_bcv: servicio.precio_bcv,
    });
    
    await ctx.editMessageText(`🏠 Inicio > 💳 *Método de Pago*\n〰️〰️〰️〰️〰️〰️〰️〰️\nServicio: *${servicio.nombre}*\n\nSelecciona la plataforma con la que vas a transferir:`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: `USDT TRC20 / Binance`, callback_data: "pagar_usdt" }, { text: `EURO Zinli`, callback_data: "pagar_euro" }],
        [{ text: `BCV Pago Móvil`, callback_data: "pagar_bcv" }],
        [{ text: "🔙 Atrás", callback_data: `item_${servicio.id}` }]
      ]}
    }).catch(()=>{});
  });
});

// --- FACTURA PREVIA Y DATOS BANCARIOS ---
botTienda.action(/pagar_(.+)/, async (ctx) => {
  const moneda = ctx.match[1].toUpperCase();
  await ctx.answerCbQuery().catch(()=>{});
  let compra = intencionCompra.get(ctx.from.id);
  
  if (!compra) return ctx.editMessageText("❌ Sesión agotada. Inicia la compra de nuevo.", { reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú", callback_data: "menu_inicio" }]] }}).catch(()=>{});
  
  compra.moneda = moneda;
  let montoBs = 0, montoDivisa = compra[`precio_${moneda.toLowerCase()}`];
  compra.venta = montoDivisa;
  compra.ganancia = (compra.venta - compra.costo).toFixed(2);

  // DATOS PAGO MÓVIL (SIEMPRE FIJOS)
  const datosPagoMovil = `\n🏦 *Pago Móvil (Alternativa)*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\``;
  let textoPago = `🧾 *RESUMEN DE FACTURACIÓN*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🛒 *Servicio:* ${compra.servicio}\n\n`;
  
  if (moneda === 'USDT') { 
    montoBs = (montoDivisa * agente.tasas.usdt).toFixed(2); 
    textoPago += `*PAGO EN USDT (Red TRC20)*\nBilletera: \`TNCFjTLYp63k2ocAooAnTUJbodaWLrRQhh\`\nCorreo Binance: \`tu_correo@gmail.com\`\n\n💵 *MONTO EXACTO: ${montoDivisa} USDT*\n${datosPagoMovil}\n🇻🇪 *MONTO EN BS: ${montoBs} Bs*`; 
  }
  if (moneda === 'EURO') { 
    montoBs = (montoDivisa * agente.tasas.euro).toFixed(2); 
    textoPago += `*PAGO EN ZINLI*\nCorreo: \`wilmergabriellucenacrespo\`\n\n💵 *MONTO EXACTO: ${montoDivisa} €*\n${datosPagoMovil}\n🇻🇪 *MONTO EN BS: ${montoBs} Bs*`; 
  }
  if (moneda === 'BCV') { 
    montoBs = (montoDivisa * agente.tasas.bcv).toFixed(2); 
    textoPago += `*PAGO MÓVIL PRINCIPAL*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\`\n\n🇻🇪 *MONTO EXACTO: ${montoBs} Bs*`; 
  }

  intencionCompra.set(ctx.from.id, compra);
  await ctx.editMessageText(`${textoPago}\n〰️〰️〰️〰️〰️〰️〰️〰️\n⚠️ *Atención:* Transfiere el monto exacto y luego sube tu comprobante.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "📤 Ya pagué (Subir Comprobante)", callback_data: "subir_pago" }],
      [{ text: "🔙 Cambiar Moneda", callback_data: `pago_${compra.id_servicio}` }],
      [{ text: "🏠 Cancelar", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Recepción de Comprobantes*\n\nPor favor, adjunta y envía la foto de tu pago en este chat ahora mismo. El sistema la procesará automáticamente.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar y Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.on('photo', async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  
  const compraData = intencionCompra.get(ctx.from.id);
  if (!compraData) return ctx.reply("❌ *No tienes compras pendientes.*", { parse_mode: 'Markdown' }).catch(()=>{});

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {}); // Efecto Fantasma de la foto
  
  pagosPendientes.set(ordenId, { userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, fileId });

  await ctx.reply('✅ *Comprobante Enviado*\n\nNuestra administración está verificando la transacción. Recibirás tus datos de acceso en este mismo chat en breve.', {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Volver al Menú Principal", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});

  // ENVÍO INMEDIATO AL ADMIN
  const fichaAdmin = `🚨 *¡NUEVA ORDEN DE COMPRA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🛒 Servicio: ${compraData.servicio}\n💵 Pagó en: ${compraData.moneda}\n💰 Ganancia Neta: $${compraData.ganancia}`;
  await botAdmin.telegram.sendPhoto(MI_ID, fileId, {
    caption: fichaAdmin, parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] }
  }).catch(()=>{});
  
  intencionCompra.delete(ctx.from.id);
});

// ==========================================
// 💼 BOT ADMINISTRADOR
// ==========================================
function obtenerMenuAdmin() {
  return {
    inline_keyboard: [
      [{ text: "👥 Ver Base de Clientes", callback_data: "admin_clientes" }],
      [{ text: "📊 Reporte de Ingresos", callback_data: "admin_reportes" }],
      [{ text: "🔄 Actualizar Tasas (Automático)", callback_data: "admin_tasas" }],
      [{ text: "✏️ Configurar Tasa (Manual)", callback_data: "admin_tasas_manual" }]
    ]
  };
}

const btnVolverAdmin = { inline_keyboard: [[{ text: "🔙 Volver al Panel", callback_data: "admin_inicio" }]] };

botAdmin.start(async (ctx) => {
  if (ctx.from.id !== MI_ID) return;
  adminEstados.clear();
  await ctx.reply('👑 *PANEL DE CONTROL CENTRAL*\n\nLas notificaciones de compras llegarán en tiempo real. ¿Qué deseas verificar?', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  await ctx.editMessageText('👑 *PANEL DE CONTROL CENTRAL*', { parse_mode: 'Markdown', reply_markup: obtenerMenuAdmin() }).catch(()=>{});
});

// --- ENTREGA AUTOMATIZADA (+30 DÍAS) ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Esta orden ya fue aprobada o rechazada.', { show_alert: true }).catch(()=>{});

  adminEstados.set('ENTREGANDO', orden);
  await ctx.deleteMessage().catch(()=>{}); // Borra el capture de tu chat para mantenerlo limpio

  const plantilla = `Correo: \nClave: \nPin: `;
  const msg = `✅ *PAGO APROBADO (#${ordenId})*\n\nCopia y completa los datos abajo, luego envíalos. *El bot calculará automáticamente los 30 días de vigencia.*\n\n\`${plantilla}\``;
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar Entrega", callback_data: "admin_inicio" }]] } }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const orden = pagosPendientes.get(ordenId);
  if (!orden) return ctx.answerCbQuery('Orden ya procesada.', { show_alert: true }).catch(()=>{});
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nHubo un problema al verificar tu comprobante en nuestros sistemas. Por favor, comunícate con Soporte.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.deleteMessage().catch(()=>{}); 
  pagosPendientes.delete(ordenId);
  await ctx.answerCbQuery('Orden Rechazada.').catch(()=>{}); // Toast Alert
});

// --- MOTOR DE TEXTOS DEL ADMIN ---
botAdmin.on('text', async (ctx, next) => {
  if (ctx.from.id !== MI_ID) return next();
  const texto = ctx.message.text;

  // 1️⃣ TASAS MANUALES
  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valor = parseFloat(partes[2].replace(',', '.'));
      if (valor > 0) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *TASA FIJADA EXITOSAMENTE:* ${moneda} = ${valor}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
      }
    }
  }

  // 2️⃣ ENTREGA DE CUENTA (CÁLCULO AUTOMÁTICO DE +30 DÍAS)
  if (adminEstados.has('ENTREGANDO')) {
    const orden = adminEstados.get('ENTREGANDO');
    
    // Calcular vencimiento
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + 30);
    
    const strVencimiento = fechaVencimiento.toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'long' });

    // Mensaje impecable para el cliente
    const msjCliente = `🎉 *¡TU PAGO HA SIDO APROBADO!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAquí tienes los accesos oficiales para tu cuenta de *${orden.compraData.servicio}*:\n\n${texto}\n\n⏳ *Válido hasta:* ${strVencimiento}\n\n_Puedes consultar tus días restantes ingresando a "⭐ Mis Suscripciones" en tu menú principal._`;
    await botTienda.telegram.sendMessage(orden.userId, msjCliente, { parse_mode: 'Markdown' }).catch(()=>{});

    // Registrar en Historiales (Firebase)
    const hoyISO = fechaActual.toISOString();
    const vencimientoISO = fechaVencimiento.toISOString();
    
    await db.collection('usuarios').doc(orden.userId.toString()).collection('suscripciones').add({ servicio: orden.compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, fecha_corte: vencimientoISO, estado: 'Activo' }).catch(()=>{});
    await db.collection('usuarios').doc(orden.userId.toString()).collection('pagos').add({ servicio: orden.compraData.servicio, monto: orden.compraData.venta, moneda: orden.compraData.moneda, fecha: hoyISO }).catch(()=>{});
    await db.collection('ventas').doc(orden.ordenId).set({ ordenId: orden.ordenId, clienteId: orden.userId, servicio: orden.compraData.servicio, venta_usd: parseFloat(orden.compraData.venta), ganancia_usd: parseFloat(orden.compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    pagosPendientes.delete(orden.ordenId);
    return ctx.reply(`✅ *Servicio Entregado al Cliente.*\nTodos los historiales (Usuario y Ventas Globales) han sido actualizados en la Base de Datos.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  return next();
});

// Iniciadores
botTienda.launch().then(() => console.log("Tienda Premium Iniciada.")).catch(console.error);
botAdmin.launch().then(() => console.log("Panel Admin Iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Premium en Línea'); });
server.listen(process.env.PORT || 3000);

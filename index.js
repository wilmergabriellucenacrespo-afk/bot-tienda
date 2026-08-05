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

// SOPORTE MULTI-ADMIN
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [8264753970];
const MI_ID = ADMIN_IDS[0]; 

const adminEstados = new Map(); 
const userEstados = new Map(); 
const baneados = new Set(); 
let modoMantenimiento = false;

db.collection('blacklist').get().then(snap => snap.forEach(doc => baneados.add(parseInt(doc.id)))).catch(()=>{});

function obtenerSaludo() {
  const hora = parseInt(new Date().toLocaleString("es-VE", { timeZone: "America/Caracas", hour: '2-digit', hour12: false }));
  if (hora >= 5 && hora < 12) return "🌤️ ¡Buenos días";
  if (hora >= 12 && hora < 19) return "☀️ ¡Buenas tardes";
  return "🌙 ¡Buenas noches";
}

// ==========================================
// 🛡️ MIDDLEWARE DE TIENDA
// ==========================================
botTienda.use(async (ctx, next) => {
  if (ctx.from && baneados.has(ctx.from.id)) return;
  
  if (modoMantenimiento) {
    if (!ADMIN_IDS.includes(ctx.from.id)) {
      const msjMantenimiento = "⚙️ *SISTEMA EN MANTENIMIENTO*\n\nEstamos realizando actualizaciones en nuestra plataforma para mejorar tu experiencia. \n\n⏳ *Por favor, vuelve en 5 minutos.*";
      if (ctx.callbackQuery) {
        return ctx.answerCbQuery('⚙️ Sistema en mantenimiento. Vuelve en 5 min.', { show_alert: true }).catch(()=>{});
      } else {
        return ctx.reply(msjMantenimiento, { parse_mode: 'Markdown' }).catch(()=>{});
      }
    }
  }
  
  if (userEstados.get(ctx.from?.id) === 'SOPORTE' && ctx.message && !ctx.message.text?.startsWith('/')) {
    const markup = { inline_keyboard: [[{ text: "💬 Responder a este cliente", callback_data: `soporte_res_${ctx.from.id}` }]] };
    await botAdmin.telegram.sendMessage(MI_ID, `💬 *NUEVO MENSAJE DE SOPORTE*\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n\n*Dice:* ${ctx.message.text}`, { parse_mode: 'Markdown', reply_markup: markup }).catch(()=>{});
    await ctx.deleteMessage().catch(()=>{}); 
    return ctx.reply('✅ _Tu mensaje fue enviado a la administración. Recibirás respuesta por aquí._', { parse_mode: 'Markdown' }).catch(()=>{});
  }

  return next();
});

// ==========================================
// 🛒 BOT TIENDA - USUARIOS
// ==========================================
const menuPrincipalUsuario = {
  inline_keyboard: [
    [{ text: "🛒 Catálogo y Compras", callback_data: "menu_catalogo" }],
    [{ text: "⭐ Mis Suscripciones", callback_data: "menu_suscripcion" }, { text: "👤 Mi Perfil", callback_data: "menu_perfil" }],
    [{ text: "📜 Políticas de Garantía", callback_data: "menu_politicas" }, { text: "❓ Preguntas Frecuentes", callback_data: "menu_faq" }],
    [{ text: "🎧 Hablar con Administración", callback_data: "activar_soporte" }]
  ]
};

botTienda.start(async (ctx) => {
  userEstados.delete(ctx.from.id);
  try {
    const userRef = db.collection('usuarios').doc(ctx.from.id.toString());
    const doc = await userRef.get();
    if (!doc.exists) {
      await botAdmin.telegram.sendMessage(MI_ID, `🌟 *¡NUEVO CLIENTE REGISTRADO!*\n👤 Nombre: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🔗 @${ctx.from.username || 'SinUser'}`, { parse_mode: 'Markdown' }).catch(()=>{});
    }
    await userRef.set({ id: ctx.from.id, nombre: ctx.from.first_name, username: ctx.from.username || 'N/A', ultimo_inicio: new Date().toISOString() }, { merge: true });
  } catch (e) {}

  const bienvenida = `${obtenerSaludo()}, *${ctx.from.first_name}!* 👋\n\nBienvenido a tu tienda premium. 🚀\nOfrecemos servicios de alta calidad con garantía y soporte rápido.\n\nSelecciona una opción del menú para comenzar:`;
  await ctx.reply(bienvenida, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.delete(ctx.from.id);
  await ctx.editMessageText(`🏠 *Menú Principal*\nSelecciona la acción que deseas realizar:`, { parse_mode: 'Markdown', reply_markup: menuPrincipalUsuario }).catch(()=>{});
});

botTienda.action('menu_faq', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > ❓ *PREGUNTAS FRECUENTES*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n` +
    `🔹 *¿Por qué no puedo ponerle un PIN a mi perfil?*\nR: Para proteger tu cuenta. Nuestro sistema y proveedores monitorean las cuentas. Cambiar la estructura original causa bloqueos masivos.\n\n` +
    `🔹 *¿Qué pasa si mi pantalla dice "Contraseña Incorrecta"?*\nR: Mantén la calma, es un reseteo rutinario de las plataformas. Solo ve a "Hablar con Administración" y en un lapso de 12 a 24 horas te daremos la nueva clave.\n\n` +
    `🔹 *¿Por qué debo consultar disponibilidad primero?*\nR: Vendemos muy rápido. Queremos asegurar de que tu pantalla esté lista para entrega inmediata antes de que envíes tu dinero.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_politicas', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `🏠 Inicio > 📜 *POLÍTICAS Y GARANTÍAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAl comprar, aceptas automáticamente estos términos:\n\n` +
    `🛡️ *1. Asignación Estricta:* Te daremos el número de tu pantalla. Tienes ESTRICTAMENTE PROHIBIDO entrar a otros perfiles, cambiar nombres, poner PIN o modificar el idioma. Hacerlo anula la garantía de inmediato.\n\n` +
    `⏳ *2. Tiempos de Reposición:* Si una pantalla presenta fallas, el tiempo estimado de solución es de 12 a 24 horas hábiles tras reportarlo a soporte.\n\n` +
    `🏦 *3. Prohibido Pagar sin Consultar:* Usa el botón "Consultar Disponibilidad". Si pagas sin consultar y no hay stock, el reembolso demorará hasta 48 horas.\n\n` +
    `🏡 *4. Bloqueo de Hogar:* Si Netflix pide "Actualizar Hogar", NO lo hagas tú. Escribe a soporte y te daremos el código para no bloquear la cuenta.`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Entendido - Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('menu_perfil', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText(`🏠 Inicio > 👤 *MI PERFIL*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🪪 *Nombre:* ${ctx.from.first_name}\n🔑 *ID Sistema:* \`${ctx.from.id}\``, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "🧾 Historial de Pagos", callback_data: "historial_pagos" }], 
      [{ text: "🔙 Volver", callback_data: "menu_inicio" }]
    ]}
  }).catch(()=>{});
});

botTienda.action('historial_pagos', async (ctx) => {
  await ctx.answerCbQuery('Buscando...').catch(()=>{});
  let msj = `🏠 Inicio > 👤 Perfil > 🧾 *HISTORIAL DE COMPRAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('pagos').orderBy('fecha', 'desc').limit(5).get();
    if (snap.empty) msj += `Aún no hay compras.`;
    else {
      snap.forEach(doc => {
        const p = doc.data();
        const fecha = new Date(p.fecha).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'short' });
        msj += `✅ *${p.servicio}* | 📅 ${fecha}\n💵 Pagaste: ${parseFloat(p.monto).toFixed(2)} ${p.moneda}\n\n`;
      });
    }
  } catch(e) {}
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Regresar", callback_data: "menu_perfil" }]] } }).catch(()=>{});
});

botTienda.action('menu_suscripcion', async (ctx) => {
  await ctx.answerCbQuery('Cargando vigencias...').catch(()=>{});
  let msj = `🏠 Inicio > ⭐ *MIS CUENTAS ACTIVAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(ctx.from.id.toString()).collection('suscripciones').where('estado', '==', 'Activo').get();
    if (snap.empty) msj += `No tienes servicios activos.`;
    else { 
      const hoy = new Date();
      snap.forEach(doc => { 
        const sub = doc.data(); 
        const diasRestantes = Math.ceil((new Date(sub.fecha_corte) - hoy) / (1000 * 60 * 60 * 24));
        let semaforo = diasRestantes <= 3 ? '🟡 (Por Vencer)' : '🟢';
        if (diasRestantes <= 0) semaforo = '🔴 (Vencido)';

        msj += `📺 *${sub.servicio}*\n${sub.datos_acceso}\n⏳ *Vigencia:* ${semaforo} ${diasRestantes > 0 ? diasRestantes + ' días restantes' : ''}\n〰️〰️〰️〰️〰️〰️〰️〰️\n`; 
      }); 
    }
  } catch (error) {}
  
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ir al Catálogo", callback_data: "menu_catalogo" }], [{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

botTienda.action('activar_soporte', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userEstados.set(ctx.from.id, 'SOPORTE');
  await ctx.editMessageText(`🏠 Inicio > 🎧 *MODO SOPORTE ACTIVADO*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\nTodo lo que escribas aquí será enviado a la administración.\n_Escribe tu mensaje:_`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛑 Cancelar Chat", callback_data: "menu_inicio" }]] }
  }).catch(()=>{});
});

botTienda.action('menu_catalogo', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  if(modoMantenimiento) {
    return ctx.editMessageText(`🚧 *TIENDA EN MANTENIMIENTO*\n\nEstamos reabasteciendo inventario o actualizando el sistema. Vuelve más tarde.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver", callback_data: "menu_inicio" }]] } }).catch(()=>{});
  }

  let msj = `🏠 Inicio > 🛒 *CATÁLOGO*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🎬 *STREAMING • Nexo Digital* 🎬\n\n📈 *TASA DE CONVERSIÓN (EURO):* ${agente.tasas.euro.toFixed(2)} Bs\n\n👇 *Selecciona:*`;
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
    const pBCV = (servicio.venta * agente.tasas.euro).toFixed(2);
    const txt = `🏠 Inicio > 🛒 Catálogo > *${servicio.nombre}*\n〰️〰️〰️〰️〰️〰️〰️〰️\n⏳ *Duración:* ${servicio.duracion}\n\n` +
      `💵 *PRECIO DEL SERVICIO:*\n` +
      `• Valor referencial: *$${servicio.venta.toFixed(2)}*\n` +
      `• Total a pagar: *${pBCV} Bs* (Tasa Euro: ${agente.tasas.euro.toFixed(2)})\n\n` +
      `⚠️ *Método único de pago:* Pago Móvil Nacional`;

    await ctx.editMessageText(txt, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
      [{ text: "🙋‍♂️ Consultar Disponibilidad", callback_data: `consultar_${servicio.id}` }],
      [{ text: "🔙 Catálogo", callback_data: "menu_catalogo" }, { text: "🏠 Menú", callback_data: "menu_inicio" }]
    ]}}).catch(()=>{});
  });

  botTienda.action(`pago_${servicio.id}`, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{});
    const pBCV = (servicio.venta * agente.tasas.euro).toFixed(2);
    
    // 🔥 FIREBASE: Guardar carrito
    await db.collection('carritos').doc(ctx.from.id.toString()).set({ 
      servicio: servicio.nombre, id_servicio: servicio.id, costo: servicio.costo, 
      venta: servicio.venta, ganancia: (servicio.venta - servicio.costo).toFixed(2), moneda: 'BCV'
    });
    
    const datosPagoMovil = `\n🏦 *Datos de Pago Móvil*\nBanco: Venezuela (0102)\nTeléfono: \`04262333684\`\nCédula: \`V27145645\``;
    let textoPago = `🧾 *RESUMEN DE FACTURACIÓN*\n〰️〰️〰️〰️〰️〰️〰️〰️\n🛒 *Servicio:* ${servicio.nombre}\n\n_(Toca los datos bancarios para copiarlos)_\n\n`;
    textoPago += `${datosPagoMovil}\n\n🇻🇪 *MONTO EXACTO A TRANSFERIR: ${pBCV} Bs*`; 

    await ctx.editMessageText(`${textoPago}\n〰️〰️〰️〰️〰️〰️〰️〰️\n1️⃣ Realiza el pago exacto.\n2️⃣ Presiona abajo para subir comprobante o escribe tu número de referencia.`, {
      parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
        [{ text: "📤 Subir Comprobante Foto/PDF", callback_data: "subir_pago" }],
        [{ text: "🏠 Cancelar Operación", callback_data: "menu_inicio" }]
      ]}
    }).catch(()=>{});
  });
});

botTienda.action(/consultar_(.+)/, async (ctx) => {
  const sId = ctx.match[1];
  const servicio = agente.servicios.find(s => s.id === sId);
  if(!servicio) return ctx.answerCbQuery('Error', {show_alert:true}).catch(()=>{});

  await ctx.answerCbQuery('Enviando consulta...').catch(()=>{});
  await ctx.editMessageText(`⏳ *CONSULTANDO DISPONIBILIDAD*\n\nEstamos verificando si hay perfiles de *${servicio.nombre}* libres en este momento. Te avisaremos por aquí en breve.`, {
    parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Volver al Catálogo", callback_data: "menu_catalogo" }]]}
  }).catch(()=>{});

  const msjAdmin = `❓ *CONSULTA DE DISPONIBILIDAD*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🛒 Desea comprar: *${servicio.nombre}*\n\n¿Tienes stock de este servicio en este momento?`;

  await botAdmin.telegram.sendMessage(MI_ID, msjAdmin, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: "✅ SÍ HAY STOCK", callback_data: `stock_si_${ctx.from.id}_${sId}` }],
    [{ text: "❌ AGOTADO", callback_data: `stock_no_${ctx.from.id}_${sId}` }]
  ]}}).catch(()=>{});
});

botTienda.action('subir_pago', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('📸 *Enviar Comprobante*\n\nAdjunta y envía la foto de tu pago o el archivo PDF en este chat. Si no tienes foto, escribe tu número de referencia.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🔙 Cancelar", callback_data: "menu_inicio" }]] } }).catch(()=>{});
});

// 🔥 RECEPCIÓN COMPROBANTE (FOTOS Y PDF) MIGRADO A FIREBASE
botTienda.on(['photo', 'document'], async (ctx, next) => {
  if (userEstados.get(ctx.from.id) === 'SOPORTE') return next(); 
  
  const carritoRef = db.collection('carritos').doc(ctx.from.id.toString());
  const carritoDoc = await carritoRef.get();
  
  if (!carritoDoc.exists) return ctx.reply("❌ *No tienes compras pendientes.*\nSelecciona un servicio en el catálogo.", { parse_mode: 'Markdown' }).catch(()=>{});
  const compraData = carritoDoc.data();

  let fileId = null;
  let esPdf = false;
  if (ctx.message.photo) {
    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  } else if (ctx.message.document) {
    fileId = ctx.message.document.file_id;
    esPdf = true;
  }
  
  const ordenId = Math.floor(Math.random() * 100000).toString();
  await ctx.deleteMessage().catch(() => {});
  
  await db.collection('ordenes_pendientes').doc(ordenId).set({
    userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, fileId, esPdf, fecha: new Date().toISOString()
  });

  await ctx.reply('✅ *Comprobante recibido*\n\nAdministración verificando. Tus accesos se anclarán aquí pronto.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú Principal", callback_data: "menu_inicio" }]] } }).catch(()=>{});

  const fichaAdmin = `🚨 *¡NUEVA ORDEN DE COMPRA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🛒 Servicio: ${compraData.servicio}\n💵 Método: 🇻🇪 PAGO MÓVIL\n💰 Ganancia: $${compraData.ganancia}\n📎 Formato: ${esPdf ? '📄 Documento PDF' : '📸 Fotografía'}`;
  const markupAprobacion = { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${ordenId}` }], [{ text: "❌ Rechazar", callback_data: `rechazar_${ordenId}` }]] };
  
  try {
    // 1. El Bot Tienda genera un enlace web temporal del archivo
    const fileLink = await botTienda.telegram.getFileLink(fileId);
    
    // 2. El Bot Administrador usa ese enlace para enviarte la imagen/PDF
    if (esPdf) {
      await botAdmin.telegram.sendDocument(MI_ID, { url: fileLink.href }, { caption: fichaAdmin, parse_mode: 'Markdown', reply_markup: markupAprobacion });
    } else {
      await botAdmin.telegram.sendPhoto(MI_ID, { url: fileLink.href }, { caption: fichaAdmin, parse_mode: 'Markdown', reply_markup: markupAprobacion });
    }
  } catch (error) {
    // 3. Respaldo: Si el archivo del cliente pesa más de 20MB, te avisa en texto para que vayas al otro bot a verlo.
    await botAdmin.telegram.sendMessage(MI_ID, `${fichaAdmin}\n\n⚠️ *AVISO:* El archivo es muy pesado o hubo un error de transferencia. Revisa el chat del Bot Tienda para ver la foto.`, { parse_mode: 'Markdown', reply_markup: markupAprobacion }).catch(()=>{});
  }
  
  await carritoRef.delete().catch(()=>{});
});

// 🔥 TEXTOS: RECEPCIÓN DE REFERENCIA Y ASPIRADORA ANTI-SCROLL
botTienda.on('message', async (ctx, next) => {
  if (userEstados.get(ctx.from?.id) === 'SOPORTE') return next();
  
  if (ctx.message.text && ctx.message.text.startsWith('/start')) {
    await ctx.deleteMessage().catch(()=>{});
    return next(); 
  }
  
  // VERIFICAR SI ENVIÓ REFERENCIA EN VEZ DE FOTO
  const carritoRef = db.collection('carritos').doc(ctx.from?.id?.toString());
  const carritoDoc = await carritoRef.get();
  
  if (carritoDoc.exists && ctx.message.text) {
     const compraData = carritoDoc.data();
     const referencia = ctx.message.text;
     const ordenId = Math.floor(Math.random() * 100000).toString();
     await ctx.deleteMessage().catch(() => {});
     
     await db.collection('ordenes_pendientes').doc(ordenId).set({
       userId: ctx.from.id, username: ctx.from.username || ctx.from.first_name, compraData, ordenId, refTexto: referencia, esPdf: false, fecha: new Date().toISOString()
     });

     await ctx.reply('✅ *Referencia de Pago Recibida*\n\nNuestra administración está validando tu número de referencia. Tus accesos llegarán pronto.', {
       parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🏠 Menú Principal", callback_data: "menu_inicio" }]] }
     }).catch(()=>{});

     const fichaAdmin = `🚨 *ORDEN CON REFERENCIA! (#${ordenId})*\n〰️〰️〰️〰️〰️〰️〰️〰️\n👤 Cliente: ${ctx.from.first_name}\n🆔 ID: \`${ctx.from.id}\`\n🛒 Servicio: ${compraData.servicio}\n💵 Método: 🇻🇪 PAGO MÓVIL\n💰 Ganancia: $${compraData.ganancia}\n\n📝 *NRO REFERENCIA ENVIADA:*\n\`${referencia}\``;

     await botAdmin.telegram.sendMessage(MI_ID, fichaAdmin, {
       parse_mode: 'Markdown',
       reply_markup: { inline_keyboard: [[{ text: "✅ Aprobar Pago", callback_data: `aprobar_${ordenId}` }], [{ text: "❌ Rechazar Pago", callback_data: `rechazar_${ordenId}` }]]}
     }).catch(()=>{});
     
     await carritoRef.delete().catch(()=>{});
     return;
  }
  
  if (!ctx.message.text && !ctx.message.photo && !ctx.message.document) return;
  await ctx.deleteMessage().catch(()=>{});
});

// ==========================================
// 💼 BOT ADMINISTRADOR - PANEL TOTAL
// ==========================================
async function obtenerMenuAdmin() {
  const ordenesRef = await db.collection('ordenes_pendientes').get();
  const alertas = ordenesRef.size;
  const txtNotif = alertas > 0 ? `🔔 VER PAGOS PENDIENTES (${alertas})` : `🔕 Sin Alertas`;

  return {
    inline_keyboard: [
      [{ text: txtNotif, callback_data: "admin_notif" }],
      [{ text: "👥 Clientes (Pag.)", callback_data: "admin_clientes_0" }, { text: "🔍 Buscar Cliente", callback_data: "admin_buscar_inicio" }],
      [{ text: "📊 Reportes y Contabilidad", callback_data: "admin_menu_reportes" }, { text: "🧾 Historial Órdenes", callback_data: "admin_historial" }],
      [{ text: "⏳ Radar de Vencimientos", callback_data: "admin_radar" }, { text: `🚧 Mantenimiento: ${modoMantenimiento?'ON':'OFF'}`, callback_data: "admin_mantenimiento" }],
      [{ text: "📢 Difusión Masiva", callback_data: "admin_difusion" }, { text: "🛑 Menú Baneos", callback_data: "admin_menu_baneos" }],
      [{ text: "🔄 Tasas API", callback_data: "admin_tasas" }, { text: "✏️ Tasas Manual", callback_data: "admin_tasas_manual" }]
    ]
  };
}
const btnVolverAdmin = { inline_keyboard: [[{ text: "🔙 Volver al Menú Central", callback_data: "admin_inicio" }]] };

botAdmin.start(async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  adminEstados.clear();
  const menu = await obtenerMenuAdmin();
  await ctx.reply('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: menu }).catch(()=>{});
});

botAdmin.action('admin_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.clear();
  const menu = await obtenerMenuAdmin();
  await ctx.editMessageText('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: menu }).catch(()=>{});
});

botAdmin.action('admin_notif', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const ordenesSnap = await db.collection('ordenes_pendientes').get();
  
  if (ordenesSnap.empty) {
    return ctx.editMessageText('✅ *Todo al día*\nNo hay pagos pendientes en la base de datos.', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }
  
  await ctx.editMessageText('🔄 *Generando recibos pendientes...*\nDesliza hacia abajo para revisarlos.', { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  
  for (let doc of ordenesSnap.docs) {
    const orden = doc.data();
    const ficha = `📋 *RECORDATORIO DE ORDEN #${orden.ordenId}*\n👤 Cliente: ${orden.username}\n🛒 Servicio: ${orden.compraData.servicio}\n💵 Método: ${orden.compraData.moneda}`;
    const markupAprob = { inline_keyboard: [[{ text: "✅ Aprobar", callback_data: `aprobar_${orden.ordenId}` }, { text: "❌ Rechazar", callback_data: `rechazar_${orden.ordenId}` }]] };
    
    if (orden.fileId) {
      try {
        const fileLink = await botTienda.telegram.getFileLink(orden.fileId);
        if (orden.esPdf) {
          await botAdmin.telegram.sendDocument(MI_ID, { url: fileLink.href }, { caption: ficha, parse_mode: 'Markdown', reply_markup: markupAprob });
        } else {
          await botAdmin.telegram.sendPhoto(MI_ID, { url: fileLink.href }, { caption: ficha, parse_mode: 'Markdown', reply_markup: markupAprob });
        }
      } catch (error) {
        await botAdmin.telegram.sendMessage(MI_ID, `${ficha}\n\n⚠️ *AVISO:* Archivo no transferible. Revisa el chat del Bot Tienda.`, { parse_mode: 'Markdown', reply_markup: markupAprob }).catch(()=>{});
      }
    } else {
      await botAdmin.telegram.sendMessage(MI_ID, `${ficha}\n📝 *REFERENCIA:* \`${orden.refTexto}\``, { parse_mode: 'Markdown', reply_markup: markupAprob }).catch(()=>{});
    }
  }t
});

botAdmin.action('admin_historial', async (ctx) => {
  await ctx.answerCbQuery('Cargando historial...').catch(()=>{});
  let msj = `🧾 *HISTORIAL GLOBAL DE ÓRDENES*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n`;

  msj += `🟡 *EN ESPERA DE REVISIÓN:*\n`;
  try {
    const ordenesSnap = await db.collection('ordenes_pendientes').get();
    if (ordenesSnap.empty) msj += `_No hay pagos pendientes._\n`;
    else {
      ordenesSnap.forEach((doc) => {
        const orden = doc.data();
        msj += `• Orden #${orden.ordenId}\n👤 Perfil: [Toca para ir a su chat](tg://user?id=${orden.userId})\n🆔 ID (Toca para copiar): \`${orden.userId}\`\n🛒 ${orden.compraData.servicio}\n\n`;
      });
    }
  } catch(e) {}

  msj += `🟢 *ÚLTIMAS 5 PROCESADAS (VENTAS):*\n`;
  try {
    const snap = await db.collection('ventas').orderBy('fecha_venta', 'desc').limit(5).get();
    if(snap.empty) msj += `_Sin ventas registradas._\n`;
    else {
      snap.forEach(doc => {
        const v = doc.data();
        msj += `• #${v.ordenId}\n👤 Perfil: [Toca para ir a su chat](tg://user?id=${v.clienteId})\n🆔 ID (Toca para copiar): \`${v.clienteId}\`\n✅ ${v.servicio}\n\n`;
      });
    }
  } catch(e) {}

  msj += `\n_Para escribirle al privado a cualquier cliente, usa el botón "🔍 Buscar Cliente" en el Menú Central y pega su ID._`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_mantenimiento', async (ctx) => {
  modoMantenimiento = !modoMantenimiento;
  await ctx.answerCbQuery(`Mantenimiento ${modoMantenimiento ? 'Activado' : 'Desactivado'}`).catch(()=>{});
  const menu = await obtenerMenuAdmin();
  await ctx.editMessageText('👑 *PANEL DE CONTROL - NIVEL GERENCIAL*', { parse_mode: 'Markdown', reply_markup: menu }).catch(()=>{});
});

botAdmin.action('admin_buscar_inicio', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BUSCAR_CLIENTE');
  await ctx.editMessageText(`🔍 *BUSCADOR DE CLIENTES*\n\nEnvía el ID numérico del cliente para localizar su ficha y poder escribirle al privado.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action(/stock_si_(\d+)_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const sId = ctx.match[2];
  const servicio = agente.servicios.find(s => s.id === sId);
  await ctx.editMessageText(`✅ Le confirmaste a \`${userId}\` que SÍ HAY STOCK.`).catch(()=>{});

  if(servicio) {
     await botTienda.telegram.sendMessage(userId, `✅ *¡Buenas noticias!*\n\nSí tenemos disponibilidad inmediata para *${servicio.nombre}*.\n\nPuedes proceder con tu compra ahora mismo:`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💳 Pagar con Pago Móvil", callback_data: `pago_${sId}` }]] } }).catch(()=>{});
  }
});

botAdmin.action(/stock_no_(\d+)_(.+)/, async (ctx) => {
  const userId = ctx.match[1];
  const sId = ctx.match[2];
  const servicio = agente.servicios.find(s => s.id === sId) || { nombre: 'este servicio' };
  await ctx.editMessageText(`❌ Le indicaste a \`${userId}\` que ESTÁ AGOTADO.`).catch(()=>{});
  await botTienda.telegram.sendMessage(userId, `❌ *Aviso de Disponibilidad*\n\nLamentamos informarte que *${servicio.nombre}* se encuentra temporalmente agotado.\n\nPor favor, consulta nuevamente más tarde o revisa nuestro catálogo para otras opciones.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🛒 Ver Catálogo", callback_data: "menu_catalogo" }]] } }).catch(()=>{});
});

botAdmin.action(/admin_clientes_(\d+)/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  const limit = 10;
  await ctx.answerCbQuery('Consultando BD...').catch(()=>{});
  try {
    const snapshot = await db.collection('usuarios').orderBy('ultimo_inicio', 'desc').offset(page).limit(limit).get();
    let botonesClientes = [];
    snapshot.forEach(doc => { const u = doc.data(); botonesClientes.push([{ text: `👤 ${u.nombre}`, callback_data: `ficha_${u.id}` }]); });
    let navRow = [];
    if (page > 0) navRow.push({ text: "⬅️ Ant.", callback_data: `admin_clientes_${Math.max(0, page - limit)}` });
    if (snapshot.size === limit) navRow.push({ text: "Sig. ➡️", callback_data: `admin_clientes_${page + limit}` });
    if (navRow.length > 0) botonesClientes.push(navRow);
    botonesClientes.push([{ text: "🔙 Volver", callback_data: "admin_inicio" }]);

    await ctx.editMessageText(`👥 *BASE DE CLIENTES*\nPagina: ${Math.floor(page/limit)+1}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: botonesClientes } }).catch(()=>{});
  } catch (error) { ctx.editMessageText('❌ Error al consultar.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
});

botAdmin.action(/ficha_(.+)/, async (ctx) => {
  const uId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  let msj = `👤 *FICHA TÉCNICA DEL CLIENTE*\n🆔 ID: \`${uId}\`\n\n⭐ *Suscripciones Actuales:*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  try {
    const snap = await db.collection('usuarios').doc(uId).collection('suscripciones').orderBy('fecha_corte', 'desc').limit(5).get();
    if(snap.empty) msj += `_Sin suscripciones._\n`;
    else {
      snap.forEach(doc => { 
        const sub = doc.data();
        const fIn = new Date(sub.fecha_compra).toLocaleDateString('es-VE');
        const fCo = new Date(sub.fecha_corte).toLocaleDateString('es-VE');
        msj += `📺 *${sub.servicio}* (${sub.estado})\n📅 Inició: ${fIn} | ⌛ Vence: ${fCo}\n`; 
      });
    }
  } catch(e) {}
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💬 Enviar Mensaje", callback_data: `soporte_res_${uId}` }], [{ text: "🔙 Clientes", callback_data: "admin_clientes_0" }]]}}).catch(()=>{});
});

botAdmin.action('admin_menu_reportes', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const botonesRep = { inline_keyboard: [
    [{ text: "📊 Reporte Histórico Total", callback_data: "rep_historico" }, { text: "💵 Corte Diario (Hoy)", callback_data: "rep_hoy" }],
    [{ text: "🔥 Top Clientes VIP", callback_data: "rep_vip" }, { text: "📈 Rentabilidad por Serv.", callback_data: "rep_renta" }],
    [{ text: "📥 Exportar Ventas a CSV", callback_data: "rep_csv" }, { text: "💾 Respaldar BD (JSON)", callback_data: "rep_json" }],
    [{ text: "🔙 Volver al Menú Central", callback_data: "admin_inicio" }]
  ]};
  await ctx.editMessageText(`📊 *ÁREA CONTABLE Y REPORTES*\nSelecciona el análisis que deseas ver:`, { parse_mode: 'Markdown', reply_markup: botonesRep }).catch(()=>{});
});

botAdmin.action('rep_historico', async (ctx) => {
  await ctx.answerCbQuery('Calculando...').catch(()=>{});
  let totalV = 0, totalG = 0, count = 0;
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { totalV += doc.data().venta_usd; totalG += doc.data().ganancia_usd; count++; });
  await ctx.editMessageText(`📊 *HISTÓRICO TOTAL*\n🛒 Ventas: ${count}\n💵 Bruto: $${totalV.toFixed(2)}\n💎 Neta: $${totalG.toFixed(2)}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_hoy', async (ctx) => {
  await ctx.answerCbQuery('Calculando...').catch(()=>{});
  let totalV = 0, totalG = 0, count = 0;
  const hoyStr = new Date().toISOString().split('T')[0];
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { 
    if(doc.data().fecha_venta.startsWith(hoyStr)) { totalV += doc.data().venta_usd; totalG += doc.data().ganancia_usd; count++; }
  });
  await ctx.editMessageText(`💵 *CORTE DE CAJA (HOY)*\n🛒 Ventas Hoy: ${count}\n💵 Ingreso Hoy: $${totalV.toFixed(2)}\n💎 Ganancia Hoy: $${totalG.toFixed(2)}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_vip', async (ctx) => {
  await ctx.answerCbQuery('Escaneando clientes...').catch(()=>{});
  let clientes = {};
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); clientes[v.clienteId] = (clientes[v.clienteId] || 0) + v.venta_usd; });
  const sorted = Object.entries(clientes).sort((a,b) => b[1] - a[1]).slice(0, 5);
  let msj = `🔥 *TOP 5 CLIENTES VIP*\n`;
  sorted.forEach((c, i) => { msj += `${i+1}️⃣ ID: \`${c[0]}\` - Gastó: $${c[1].toFixed(2)}\n`; });
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_renta', async (ctx) => {
  await ctx.answerCbQuery('Calculando rentabilidad...').catch(()=>{});
  let rent = {};
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); rent[v.servicio] = (rent[v.servicio] || 0) + v.ganancia_usd; });
  const sorted = Object.entries(rent).sort((a,b) => b[1] - a[1]);
  let msj = `📈 *RENTABILIDAD POR SERVICIO*\n`;
  sorted.forEach(c => { msj += `• *${c[0]}*: $${c[1].toFixed(2)} Neta\n`; });
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard:[[{text:"🔙", callback_data:"admin_menu_reportes"}]] } }).catch(()=>{});
});

botAdmin.action('rep_csv', async (ctx) => {
  await ctx.answerCbQuery('Generando Excel...').catch(()=>{});
  let csv = 'OrdenID,ClienteID,Servicio,MontoUSD,GananciaUSD,Fecha\n';
  const snap = await db.collection('ventas').get();
  snap.forEach(doc => { const v = doc.data(); csv += `${v.ordenId},${v.clienteId},${v.servicio},${v.venta_usd},${v.ganancia_usd},${v.fecha_venta}\n`; });
  await botAdmin.telegram.sendDocument(MI_ID, { source: Buffer.from(csv), filename: 'Reporte_Ventas.csv' }, { caption: "📥 Archivo Excel Generado" }).catch(()=>{});
});

botAdmin.action('rep_json', async (ctx) => {
  await ctx.answerCbQuery('Respaldando...').catch(()=>{});
  const snap = await db.collection('usuarios').get();
  let obj = [];
  snap.forEach(doc => { obj.push(doc.data()); });
  await botAdmin.telegram.sendDocument(MI_ID, { source: Buffer.from(JSON.stringify(obj, null, 2)), filename: 'Respaldo_Usuarios.json' }, { caption: "💾 Respaldo BD Generado" }).catch(()=>{});
});

botAdmin.action('admin_radar', async (ctx) => {
  await ctx.answerCbQuery('Escaneando cuentas...').catch(()=>{});
  let msj = `⏳ *RADAR DE VENCIMIENTOS (<= 3 DÍAS)*\n〰️〰️〰️〰️〰️〰️〰️〰️\n`;
  let hayCuentas = false;
  try {
    const users = await db.collection('usuarios').get();
    for (let user of users.docs) {
      const subs = await user.ref.collection('suscripciones').where('estado', '==', 'Activo').get();
      subs.forEach(docSub => {
        const sub = docSub.data();
        const dias = Math.ceil((new Date(sub.fecha_corte) - new Date()) / (1000 * 60 * 60 * 24));
        if(dias <= 3 && dias > 0) {
          msj += `⚠️ *${sub.servicio}* (Vence en ${dias} días)\n👤 Cliente ID: \`${user.id}\`\n\n`;
          hayCuentas = true;
        }
      });
    }
    if(!hayCuentas) msj += `No hay cuentas a punto de vencer.`;
  } catch(e) {}
  
  if (msj.length > 4000) {
    const buffer = Buffer.from(msj, 'utf-8');
    await ctx.deleteMessage().catch(()=>{});
    await botAdmin.telegram.sendDocument(ctx.from.id, { source: buffer, filename: 'Reporte_Vencimientos.txt' }, { caption: "⚠️ La lista excedió el límite de la pantalla. Aquí tienes el reporte completo.", reply_markup: btnVolverAdmin }).catch(()=>{});
  } else {
    await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }
});

botAdmin.action('admin_menu_baneos', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  await ctx.editMessageText('🛑 *SISTEMA DE BLACKLIST*', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [
    [{ text: "🚫 Banear Cliente", callback_data: "admin_banear" }, { text: "🔓 Desbanear", callback_data: "admin_unban" }],
    [{ text: "🔙 Volver", callback_data: "admin_inicio" }]
  ] } }).catch(()=>{});
});

botAdmin.action('admin_banear', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'BANEADO');
  await ctx.editMessageText('🚫 Envía el ID numérico del usuario para BLOQUEARLO.', { reply_markup: btnVolverAdmin }).catch(()=>{});
});
botAdmin.action('admin_unban', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DESBANEAR');
  await ctx.editMessageText('🔓 Envía el ID numérico del usuario para PERDONARLO.', { reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_difusion', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('accion', 'DIFUSION');
  await ctx.editMessageText('📢 Escribe el mensaje masivo (O envía CANCELAR).', { reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_tasas', async (ctx) => {
  await ctx.answerCbQuery('Consultando Motor...').catch(()=>{});
  await agente.actualizarTasas();
  await ctx.editMessageText(`✅ *Tasas Actualizadas*\nUSDT: ${agente.tasas.usdt}\nEURO: ${agente.tasas.euro}\nBCV: ${agente.tasas.bcv}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

botAdmin.action('admin_tasas_manual', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  const msj = `✏️ *ACTUALIZACIÓN MANUAL DE TASAS*\n〰️〰️〰️〰️〰️〰️〰️〰️\n\nComo tu tienda opera en base al *EURO*, esta es la tasa principal que debes ajustar para proteger tu capital si la automatización llega a fallar.\n\nPara cambiar la tasa en tiempo real, simplemente escribe y envía un mensaje aquí con este formato exacto:\n\n👉 \`TASA EURO 45.50\`\n\n_(Recuerda usar punto en lugar de coma. También puedes usar \`TASA BCV 45.00\` si lo necesitas)._`;
  await ctx.editMessageText(msj, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// --- APROBACIÓN DE ÓRDENES (CORREGIDO) ---
botAdmin.action(/aprobar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const docOrden = await db.collection('ordenes_pendientes').doc(ordenId).get();
  
  if (!docOrden.exists) return ctx.answerCbQuery('Esta orden ya fue procesada o no existe.', { show_alert: true }).catch(()=>{});
  
  const orden = docOrden.data();
  adminEstados.set('ENTREGANDO', orden);
  await ctx.deleteMessage().catch(()=>{});
  const msg = `✅ *APROBANDO ORDEN #${ordenId}*\n\nCopia, llena y envía:\n\n\`Correo: \nClave: \nPin: \``;
  await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "❌ Cancelar Entrega", callback_data: "admin_inicio" }]] } }).catch(()=>{});
});

botAdmin.action(/rechazar_(.+)/, async (ctx) => {
  const ordenId = ctx.match[1];
  const docOrden = await db.collection('ordenes_pendientes').doc(ordenId).get();
  
  if (!docOrden.exists) return ctx.answerCbQuery('Orden ya procesada.', { show_alert: true }).catch(()=>{});
  const orden = docOrden.data();
  
  await botTienda.telegram.sendMessage(orden.userId, '❌ *Pago Rechazado*\n\nVerifica tu pago y contacta a Soporte.', { parse_mode: 'Markdown' }).catch(()=>{});
  await ctx.deleteMessage().catch(()=>{}); 
  
  await db.collection('ordenes_pendientes').doc(ordenId).delete().catch(()=>{});
  await ctx.answerCbQuery('Rechazada exitosamente.').catch(()=>{}); 
});

botAdmin.action(/soporte_res_(.+)/, async (ctx) => {
  const targetId = ctx.match[1];
  await ctx.answerCbQuery().catch(()=>{});
  adminEstados.set('RESPONDIENDO_SOPORTE', targetId);
  await ctx.editMessageText(`✍️ Escribe tu respuesta para el cliente.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
});

// ==========================================
// 🛠️ MOTOR CEREBRAL DEL ADMIN (TEXTOS Y ANTI-SCROLL)
// ==========================================
botAdmin.use(async (ctx, next) => {
  if (ctx.message && ADMIN_IDS.includes(ctx.from?.id)) {
    await ctx.deleteMessage().catch(()=>{});
    if (ctx.message.text && ctx.message.text.startsWith('/start')) return next();
    if (!ctx.message.text) return;
  }
  return next();
});

botAdmin.on('text', async (ctx, next) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return next();
  const texto = ctx.message.text;
  const estadoActual = adminEstados.get('accion');

  // BUSCADOR CLIENTE
  if (estadoActual === 'BUSCAR_CLIENTE') {
    adminEstados.clear();
    const uId = texto.trim();
    const doc = await db.collection('usuarios').doc(uId).get();
    if(!doc.exists) return ctx.reply(`❌ Cliente ID no encontrado.`, { reply_markup: btnVolverAdmin }).catch(()=>{});
    
    let msj = `👤 *FICHA DEL CLIENTE*\n🆔 ID: \`${uId}\`\n🪪 Nombre: ${doc.data().nombre}\n`;
    const snap = await db.collection('usuarios').doc(uId).collection('suscripciones').orderBy('fecha_corte', 'desc').limit(2).get();
    if(!snap.empty) snap.forEach(d => { msj += `• ${d.data().servicio} (${d.data().estado})\n`; });
    
    return ctx.reply(msj, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "💬 Enviar Mensaje Directo", callback_data: `soporte_res_${uId}` }], [{ text: "🔙 Volver", callback_data: "admin_inicio" }]]}}).catch(()=>{});
  }

  // TASA MANUAL
  if (texto.toUpperCase().startsWith('TASA ')) {
    const partes = texto.toUpperCase().split(' ');
    if (partes.length === 3) {
      const moneda = partes[1];
      const valor = parseFloat(partes[2].replace(',', '.'));
      if (valor > 0 && ['BCV', 'USDT', 'EURO'].includes(moneda)) {
        await agente.setTasaManual(moneda, valor);
        return ctx.reply(`✅ *TASA FIJADA:* ${moneda} = ${valor}`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
      }
    }
  }

  // DIFUSIÓN (PROTECCIÓN ANTI-SPAM)
  if (estadoActual === 'DIFUSION') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Acción cancelada.', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    const snap = await db.collection('usuarios').get();
    let enviados = 0;
    await ctx.reply('⏳ Enviando difusión masiva con sistema anti-bloqueo... (Esto tomará tiempo)').catch(()=>{});
    
    for (let doc of snap.docs) { 
      try { 
        await botTienda.telegram.sendMessage(doc.id, `📢 *Anuncio*\n\n${texto}`, { parse_mode: 'Markdown' }); 
        enviados++; 
        await new Promise(resolve => setTimeout(resolve, 500)); 
      } catch(e){} 
    }
    return ctx.reply(`✅ Difusión segura completada. Entregado a ${enviados} usuarios.`, { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // BANEAR / DESBANEAR
  if (estadoActual === 'BANEADO' || estadoActual === 'DESBANEAR') {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado', { reply_markup: btnVolverAdmin }); }
    adminEstados.clear();
    const cleanId = parseInt(texto);
    if(estadoActual === 'BANEADO') {
      baneados.add(cleanId);
      await db.collection('blacklist').doc(texto).set({ fecha: new Date().toISOString() }).catch(()=>{});
      return ctx.reply(`✅ Usuario \`${texto}\` BANEADO.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
    } else {
      baneados.delete(cleanId);
      await db.collection('blacklist').doc(texto).delete().catch(()=>{});
      return ctx.reply(`✅ Usuario \`${texto}\` DESBANEADO.`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
    }
  }

  // SOPORTE
  if (adminEstados.has('RESPONDIENDO_SOPORTE')) {
    const targetId = adminEstados.get('RESPONDIENDO_SOPORTE');
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Cancelado.', { reply_markup: btnVolverAdmin }); }
    await botTienda.telegram.sendMessage(targetId, `👨‍💻 *Respuesta de Administración:*\n\n${texto}`, { parse_mode: 'Markdown' }).catch(()=>{});
    adminEstados.clear();
    return ctx.reply('✅ Respuesta enviada.', { reply_markup: btnVolverAdmin }).catch(()=>{});
  }

  // ENTREGA Y ANCLAJE
  if (adminEstados.has('ENTREGANDO')) {
    if (texto.toUpperCase() === 'CANCELAR') { adminEstados.clear(); return ctx.reply('❌ Entrega cancelada.', { reply_markup: btnVolverAdmin }).catch(()=>{}); }
    const orden = adminEstados.get('ENTREGANDO');
    
    const fechaActual = new Date();
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaActual.getDate() + 30);
    
    const strInicio = fechaActual.toLocaleDateString('es-VE');
    const strVencimiento = fechaVencimiento.toLocaleDateString('es-VE');
    
    const msjCliente = `🎉 *¡TU PAGO HA SIDO APROBADO!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAquí están los accesos de tu cuenta de *${orden.compraData.servicio}*:\n\n${texto}\n\n📅 *Inicio:* ${strInicio}\n⌛ *Corte:* ${strVencimiento}\n⏳ *RESTANTE:* 30 Días 🟢\n\n_¡Gracias por tu compra! Este mensaje quedará anclado aquí._`;
    
    let sentMsg = await botTienda.telegram.sendMessage(orden.userId, msjCliente, { parse_mode: 'Markdown' }).catch(()=>{});
    if (sentMsg) await botTienda.telegram.pinChatMessage(orden.userId, sentMsg.message_id).catch(()=>{});

    const hoyISO = fechaActual.toISOString();
    const vencimientoISO = fechaVencimiento.toISOString();
    const msgIdParaGuardar = sentMsg ? sentMsg.message_id : null;
    
    await db.collection('usuarios').doc(orden.userId.toString()).collection('suscripciones').add({ servicio: orden.compraData.servicio, datos_acceso: texto, fecha_compra: hoyISO, fecha_corte: vencimientoISO, estado: 'Activo', pinned_msg_id: msgIdParaGuardar }).catch(()=>{});
    await db.collection('usuarios').doc(orden.userId.toString()).collection('pagos').add({ servicio: orden.compraData.servicio, monto: orden.compraData.venta, moneda: orden.compraData.moneda, fecha: hoyISO }).catch(()=>{});
    await db.collection('ventas').doc(orden.ordenId).set({ ordenId: orden.ordenId, clienteId: orden.userId, servicio: orden.compraData.servicio, venta_usd: parseFloat(orden.compraData.venta), ganancia_usd: parseFloat(orden.compraData.ganancia), fecha_venta: hoyISO }).catch(()=>{});

    adminEstados.clear();
    await db.collection('ordenes_pendientes').doc(orden.ordenId).delete().catch(()=>{});
    return ctx.reply(`✅ *Cuenta Entregada y Mensaje Anclado.*`, { parse_mode: 'Markdown', reply_markup: btnVolverAdmin }).catch(()=>{});
  }
  return next();
});

// ==========================================
// ⏱️ ACTUALIZADOR DIARIO DE CUENTAS REGRESIVAS
// ==========================================
async function actualizarCuentasRegresivas() {
  try {
    const usersSnap = await db.collection('usuarios').get();
    for (let userDoc of usersSnap.docs) {
      const subsSnap = await userDoc.ref.collection('suscripciones').where('estado', '==', 'Activo').get();
      for (let docSub of subsSnap.docs) {
        const sub = docSub.data();
        if (sub.pinned_msg_id) {
          const diasRestantes = Math.ceil((new Date(sub.fecha_corte) - new Date()) / (1000 * 60 * 60 * 24));
          if (diasRestantes > 0) {
            let semaforo = diasRestantes <= 3 ? '🟡 (Por Vencer)' : '🟢';
            const strIn = new Date(sub.fecha_compra).toLocaleDateString('es-VE');
            const strVn = new Date(sub.fecha_corte).toLocaleDateString('es-VE');
            const msj = `🎉 *¡SUSCRIPCIÓN ACTIVA!*\n〰️〰️〰️〰️〰️〰️〰️〰️\nAccesos de *${sub.servicio}*:\n\n${sub.datos_acceso}\n\n📅 *Inicio:* ${strIn}\n⌛ *Corte:* ${strVn}\n⏳ *RESTANTE:* ${diasRestantes} Días ${semaforo}`;
            await botTienda.telegram.editMessageText(userDoc.id, sub.pinned_msg_id, null, msj, { parse_mode: 'Markdown' }).catch(()=>{});
          } else {
            await docSub.ref.update({ estado: 'Vencido' }).catch(()=>{});
            await botTienda.telegram.unpinChatMessage(userDoc.id, sub.pinned_msg_id).catch(()=>{});
            await botTienda.telegram.sendMessage(userDoc.id, `⚠️ *Suscripción Vencida*\nTu servicio de *${sub.servicio}* ha expirado.`, { parse_mode: 'Markdown' }).catch(()=>{});
          }
        }
      }
    }
  } catch (e) {}
}
setInterval(actualizarCuentasRegresivas, 6 * 60 * 60 * 1000);

botTienda.launch().then(async () => {
  await botTienda.telegram.setMyCommands([{ command: 'start', description: '🏠 Abrir Tienda Principal' }]).catch(()=>{});
  console.log("Tienda Premium Iniciada.");
}).catch(console.error);

botAdmin.launch().then(() => console.log("Panel Admin Iniciado.")).catch(console.error);

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Sistema Total Operativo'); });
server.listen(process.env.PORT || 3000);

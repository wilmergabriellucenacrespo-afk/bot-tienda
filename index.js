const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const http = require('http');

// 1. Conectar con la Base de Datos (Firebase)
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 2. Conectar con Telegram (¡Aquí definimos el bot!)
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// 3. Crear el menú principal de la tienda
bot.start((ctx) => {
  ctx.reply(`¡Hola ${ctx.from.first_name}! Bienvenido a la tienda. 📺🍿\n\nSelecciona el servicio que deseas adquirir hoy:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Netflix 🔴", callback_data: "item_netflix" }],
        [{ text: "Spotify Premium 🟢", callback_data: "item_spotify" }],
        [{ text: "Disney+ 🔵", callback_data: "item_disney" }]
      ]
    }
  });
});
// --- SISTEMA DE RECEPCIÓN DE PAGOS ---
const ADMIN_ID = 8264753970; // Tu ID de administrador

bot.on('photo', async (ctx) => {
  const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
  
  // 1. Respuesta automática para el cliente
  await ctx.reply('📸 ¡Comprobante recibido exitosamente!\n\nEstamos verificando el pago. En breve te enviaremos los datos de acceso por aquí mismo. ⏳');

  // 2. Alerta silenciosa para ti (Administrador)
  await ctx.telegram.sendPhoto(ADMIN_ID, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
    caption: `💰 *NUEVO PAGO RECIBIDO*\n\n👤 Cliente: ${username}\n\nRevisa el comprobante. Si todo está correcto, escríbele para entregarle su cuenta.`,
    parse_mode: 'Markdown'
  });
});
// --------------------------------------
// 4. Mantener el bot encendido
bot.launch();
console.log("¡El servidor del bot está encendido y funcionando!");

// 5. El puerto web falso para Render
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('El servidor del bot de Telegram esta funcionando al 100%');
});
server.listen(process.env.PORT || 3000);

// Detener el bot de forma segura
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

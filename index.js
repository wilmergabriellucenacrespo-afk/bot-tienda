const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');

// 1. Conectar con la Base de Datos (Firebase)
const serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// 2. Conectar con Telegram
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// 3. Crear el comando de bienvenida
bot.start((ctx) => {
  ctx.reply(`¡Hola ${ctx.from.first_name}! Bienvenido a la tienda. \n\nEl sistema está en línea y conectado a la base de datos correctamente. ✅`);
});

// 4. Mantener el bot encendido
bot.launch();
console.log("¡El servidor del bot está encendido y funcionando!");

// Detener el bot de forma segura si se cierra Replit
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

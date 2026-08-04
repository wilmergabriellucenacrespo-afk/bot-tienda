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

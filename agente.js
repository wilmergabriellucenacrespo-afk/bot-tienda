// agente.js - Motor financiero camuflado (Cero tasas falsas)
const tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando..." };

async function actualizarTasas() {
  try {
    // Camuflaje: Le decimos a la página que somos un navegador Chrome de Windows, no un bot.
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };

    const req = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar', { headers });
    const data = await req.json();
    
    const reqEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro', { headers });
    const dataEur = await reqEur.json();

    // Actualiza solo si lee un número real
    if (data.monitors && data.monitors.bcv && data.monitors.bcv.price > 0) tasas.bcv = data.monitors.bcv.price;
    if (data.monitors && data.monitors.binance && data.monitors.binance.price > 0) tasas.usdt = data.monitors.binance.price;
    if (dataEur.monitors && dataEur.monitors.bcv && dataEur.monitors.bcv.price > 0) tasas.euro = dataEur.monitors.bcv.price;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    
    console.log(`[Agente Real] BCV ${tasas.bcv} | USDT ${tasas.usdt} | EURO ${tasas.euro}`);
  } catch (error) { 
    console.log("Reintentando conexión para obtener tasas reales..."); 
  }
}

// Se ejecuta al instante y luego cada 12 horas (43,200,000 ms = 2 AM y 2 PM aprox dependiendo del arranque)
actualizarTasas();
setInterval(actualizarTasas, 43200000);

module.exports = { tasas, actualizarTasas };

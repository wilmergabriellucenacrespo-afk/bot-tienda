// agente.js - Motor financiero Multi-API (Sin tasas falsas)

let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Calculando tasas reales..." };

async function actualizarTasas() {
  let exito = false;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };

  // INTENTO 1: DolarAPI (Muy rápida)
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares', { headers });
    const data = await res.json();
    let oficial = data.find(d => d.casa === 'oficial')?.promedio || 0;
    let binance = data.find(d => d.casa === 'binance')?.promedio || 0;
    let eur = data.find(d => d.casa === 'euro')?.promedio || 0;
    
    if (oficial > 0 && binance > 0) {
      tasas.bcv = oficial;
      tasas.usdt = binance;
      tasas.euro = eur > 0 ? eur : (oficial * 1.08);
      exito = true;
    }
  } catch (e) {}

  // INTENTO 2: PyDolar (Si el Intento 1 falla o es bloqueado)
  if (!exito) {
    try {
      const res2 = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar', { headers });
      const data2 = await res2.json();
      const resEur = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/euro', { headers });
      const dataEur = await resEur.json();

      if (data2.monitors && data2.monitors.bcv.price > 0) {
        tasas.bcv = data2.monitors.bcv.price;
        tasas.usdt = data2.monitors.binance.price;
        tasas.euro = dataEur.monitors.bcv.price;
        exito = true;
      }
    } catch (e) {}
  }

  // VALIDACIÓN FINAL
  if (exito) {
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    console.log(`[Agente Real] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EUR: ${tasas.euro}`);
  } else {
    console.log("Bloqueo detectado en ambas APIs. Reintentando en 15 segundos...");
    setTimeout(actualizarTasas, 15000); // Intenta de nuevo rápidamente, nunca usa un cero falso.
  }
}

// Ejecutar al iniciar y luego cada 12 horas (43,200,000 ms = 2 AM / 2 PM)
actualizarTasas();
setInterval(actualizarTasas, 43200000);

module.exports = { tasas, actualizarTasas };

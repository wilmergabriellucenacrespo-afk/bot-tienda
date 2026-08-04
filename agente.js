// agente.js - Motor financiero independiente
const tasas = { 
  usdt: 40.00, // Valores de respaldo por si la API falla
  euro: 43.50, 
  bcv: 36.60, 
  fecha: "Verificando..." 
};

async function actualizarTasas() {
  try {
    const [reqBcv, reqBinance, reqEuro] = await Promise.all([
      fetch('https://ve.dolarapi.com/v1/dolares/oficial'),
      fetch('https://ve.dolarapi.com/v1/dolares/binance'),
      fetch('https://ve.dolarapi.com/v1/dolares/euro')
    ]);
    
    const dataBcv = await reqBcv.json();
    const dataBinance = await reqBinance.json();
    const dataEuro = await reqEuro.json();

    // Solo actualiza si la API devuelve un número válido mayor a 0
    if (dataBcv.promedio > 0) tasas.bcv = dataBcv.promedio;
    if (dataBinance.promedio > 0) tasas.usdt = dataBinance.promedio;
    if (dataEuro.promedio > 0) tasas.euro = dataEuro.promedio;
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'short', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);
    
    console.log(`[Agente] Tasas actualizadas: BCV ${tasas.bcv} | USDT ${tasas.usdt}`);
  } catch (error) { 
    console.log("Advertencia: No se pudo conectar a la API, usando tasas de respaldo."); 
  }
}

actualizarTasas();
setInterval(actualizarTasas, 43200000); // Se actualiza cada 12 horas

module.exports = { tasas, actualizarTasas };

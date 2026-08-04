// agente.js - Motor Financiero Inmune (Conexión vía Google Apps Script - Blindado)
const https = require('https');

let tasas = { usdt: 0, euro: 0, bcv: 0, fecha: "Actualizando..." };
let dbLocal = null;

// 👇 PEGA AQUÍ TU URL DE GOOGLE ENTRE LAS COMILLAS 👇
const LINK_GOOGLE = 'https://script.google.com/macros/s/AKfycbygubr9rTBpzd8hDQqggb3nIZ5dX8fcLpfepd1FlUGz116O7PugaUvbw1HnzhjKPlu-/exec';

const servicios = [
  { id: "netflix", nombre: "Netflix 🔴", duracion: "30 días", costo: 2.20, precio_usdt: 3.80, precio_euro: 4.00, precio_bcv: 4.50 },
  { id: "spotify", nombre: "Spotify Premium 🟢", duracion: "30 días", costo: 1.00, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 },
  { id: "disney", nombre: "Disney+ 🔵", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "max", nombre: "Max (HBO) 🟣", duracion: "30 días", costo: 1.20, precio_usdt: 2.50, precio_euro: 2.80, precio_bcv: 3.00 },
  { id: "prime", nombre: "Prime Video 🟡", duracion: "30 días", costo: 0.90, precio_usdt: 2.00, precio_euro: 2.20, precio_bcv: 2.50 }
];

function pedirAGoogle(url) {
  return new Promise((resolve) => {
    console.log("🌐 Intentando conectar con Google...");
    https.get(url, (res) => {
      // Si Google nos redirige (Comportamiento normal)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (resRedir) => {
          let data = '';
          resRedir.on('data', (chunk) => data += chunk);
          resRedir.on('end', () => {
            try { 
              const json = JSON.parse(data);
              resolve(json); 
            } catch (e) { 
              console.log("❌ GOOGLE RESPONDIÓ CON TEXTO NO VÁLIDO. Aquí está lo que envió Google:");
              console.log("RAW DATA:", data.substring(0, 300)); // Imprimimos los primeros 300 caracteres del error real
              resolve(null); 
            }
          });
        }).on('error', (err) => {
          console.log("❌ ERROR DE RED AL REDIRIGIR:", err.message);
          resolve(null);
        });
      } else {
        // Si no hay redirección
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { 
            const json = JSON.parse(data);
            resolve(json); 
          } catch (e) { 
            console.log("❌ GOOGLE RESPONDIÓ SIN REDIRECCIÓN Y CON ERROR:");
            console.log("RAW DATA:", data.substring(0, 300));
            resolve(null); 
          }
        });
      }
    }).on('error', (err) => {
      console.log("❌ ERROR DE RED FATAL. Render no tiene internet:", err.message);
      resolve(null);
    });
  });
}

async function iniciar(db) {
  dbLocal = db;
  try {
    const doc = await dbLocal.collection('sistema').doc('tasas_memoria').get();
    if (doc.exists && doc.data().bcv > 0) Object.assign(tasas, doc.data());
  } catch (error) { 
    console.log("Firebase no leído:", error.message); 
  }
  
  await actualizarTasas();
  setInterval(actualizarTasas, 43200000); // Se actualiza cada 12 horas
}

async function actualizarTasas() {
  console.log("🔄 Preguntando tasas al Puente de Google...");
  
  const datos = await pedirAGoogle(LINK_GOOGLE);
  
  // 👇 ESTA ES LA LÍNEA NUEVA PARA SABER LA VERDAD 👇
  console.log("📦 RESPUESTA DE GOOGLE:", datos);

  if (datos && datos.bcv > 0 && datos.binance > 0) {
    tasas.bcv = parseFloat(datos.bcv);
    tasas.usdt = parseFloat(datos.binance);
    tasas.euro = parseFloat(datos.euro > 0 ? datos.euro : datos.bcv * 1.05);
    
    const opcionesFecha = { timeZone: 'America/Caracas', dateStyle: 'long', timeStyle: 'short' };
    tasas.fecha = new Date().toLocaleString('es-VE', opcionesFecha);

    if (dbLocal) {
      await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
    }
    console.log(`✅ [TASAS OBTENIDAS VÍA GOOGLE] BCV: ${tasas.bcv} | USDT: ${tasas.usdt} | EURO: ${tasas.euro}`);
  } else {
    console.log("🚨 Falló la lectura (Los valores vinieron en cero). Se mantiene la tasa anterior.");
  }
}
async function setTasaManual(moneda, valor) {
  if (moneda === 'BCV') tasas.bcv = parseFloat(valor);
  if (moneda === 'USDT') tasas.usdt = parseFloat(valor);
  if (moneda === 'EURO') tasas.euro = parseFloat(valor);
  tasas.fecha = "Fijada Manualmente";
  
  if (dbLocal) {
    await dbLocal.collection('sistema').doc('tasas_memoria').set(tasas).catch(()=>{});
  }
}

module.exports = { tasas, servicios, iniciar, actualizarTasas, setTasaManual };

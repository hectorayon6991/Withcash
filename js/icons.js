/* WithCash — íconos propios (línea, 24×24, trazo redondeado). Sustituyen a los emojis.
   Se insertan una vez como <symbol> y se usan con ico("clave"). */
(() => {
  "use strict";
  const dot = (cx, cy, r = 1) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;
  const P = {
    // ---- Interfaz ----
    home: '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v10.5h13V9"/><path d="M10 19.5v-5h4v5"/>',
    receipt: '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
    calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>${dot(12, 14.5, 1.3)}`,
    chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="7" width="3" height="10" rx="1"/><rect x="15.5" y="4" width="3" height="13" rx="1"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    chevL: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    chevR: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.6 2.6 5-5.4"/>',
    alert: `<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5"/>${dot(12, 17, 0.9)}`,
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/>${dot(12, 12, 1.3)}`,
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    bulb: '<path d="M9 17.5h6M10 20.5h4"/><path d="M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.8.6 1.3 1.5 1.3 2.5v1.6h4v-1.6c0-1 .5-1.9 1.3-2.5A5.5 5.5 0 0 0 12 3.5z"/>',
    trendUp: '<path d="M3.5 17 9.5 11l4 4 7-7.5"/><path d="M15 7.5h5.5V13"/>',
    trendDown: '<path d="M3.5 7 9.5 13l4-4 7 7.5"/><path d="M15 16.5h5.5V11"/>',
    arrowUp: '<path d="M12 19.5v-15M6 10.5l6-6 6 6"/>',
    arrowDown: '<path d="M12 4.5v15M6 13.5l6 6 6-6"/>',
    coins: '<ellipse cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7"/><path d="M9.5 16.3c.9.8 2.9 1.2 5 1.2 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4"/>',
    pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    star: '<path d="m12 3.5 2.4 5.1 5.6.7-4.1 3.9 1 5.6L12 16.1l-4.9 2.7 1-5.6L4 9.3l5.6-.7z"/>',
    piggy: `<path d="M4.5 12.5c0-3.3 3.1-5.8 7-5.8 1.6 0 3 .4 4.2 1.1L18.5 6.5l-.4 3.2c.8.7 1.4 1.6 1.6 2.6l1.3.3v2.6l-1.6.5c-.5 1-1.3 1.8-2.3 2.4v2.4h-2.6v-1.6a8 8 0 0 1-3 0v1.6H8.9v-2.5c-2.6-1.2-4.4-3.4-4.4-5.5z"/>${dot(15.6, 11.3, 0.9)}`,
    download: '<path d="M12 4v11M7 10.5l5 5 5-5"/><path d="M4.5 19.5h15"/>',
    file: '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z"/><path d="M14 3.5v5h5M9 13h6M9 16.5h6"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    swap: '<path d="M4 8.5h14l-3.5-3.5M20 15.5H6l3.5 3.5"/>',
    zap: '<path d="M13 3 5.5 13.5H12L11 21l7.5-10.5H12z"/>',
    question: `<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.6"/>${dot(12, 16.8, 0.9)}`,
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="11" rx="2.5"/><path d="M16 13.5h1.5"/>',
    // ---- Categorías / cuentas ----
    food: '<path d="M7 3.5v7.5M4.5 3.5v4.5a2.5 2.5 0 0 0 5 0V3.5M7 11v9.5"/><path d="M17 20.5V3.5c-2 0-3.5 2.5-3.5 6v3.5H17"/>',
    cart: '<path d="M3 4h2.5l2 11h10.5l2-8H6.5"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    car: '<path d="M4 15.5V12l2.2-5h11.6l2.2 5v3.5z"/><path d="M4 12h16"/><circle cx="8" cy="16.5" r="1.7"/><circle cx="16" cy="16.5" r="1.7"/>',
    fuel: '<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15.5M3.5 20.5h12M5 10h9"/><path d="M14 8l3.5 3v6a1.5 1.5 0 0 0 3 0V9l-2.5-3"/>',
    card: '<rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M3 10.5h18M7 15h4"/>',
    school: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5v4c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2v-4M21.5 9.5v5"/>',
    health: '<rect x="2.8" y="8.6" width="18.4" height="6.8" rx="3.4" transform="rotate(-45 12 12)"/><path d="m9.6 9.6 4.8 4.8"/>',
    film: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9.5h17M8 5l2 4.5M13 5l2 4.5"/>',
    shirt: '<path d="M8.5 4 4 6.5l1.8 4L8 9.6V20h8V9.6l2.2.9 1.8-4L15.5 4c-.5 1.4-1.8 2.3-3.5 2.3S9 5.4 8.5 4z"/>',
    child: '<circle cx="12" cy="6.5" r="2.8"/><path d="M7 21v-5.5L5 12.5l3-2.5h8l3 2.5-2 3V21M10 21v-4h4v4"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8.5 21h7M9 2.8 12 6l3-3.2"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12"/><path d="M12 8.5C10 8.5 7.5 7.8 7.5 6a1.8 1.8 0 0 1 3.2-1.1L12 8.5l1.3-3.6A1.8 1.8 0 0 1 16.5 6c0 1.8-2.5 2.5-4.5 2.5z"/>',
    box: '<path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M8.5 7.5V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5v2M3 12.5h18"/>',
    cash: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
    tag: '<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.5"/>',
    refund: '<path d="M9 7.5 4.5 12 9 16.5"/><path d="M4.5 12H15a4.5 4.5 0 0 0 0-9h-2"/>',
    bank: '<path d="M3 9.5 12 4l9 5.5z"/><path d="M5 10v7.5M9.7 10v7.5M14.3 10v7.5M19 10v7.5M3 20.5h18"/>',
    wifi: `<path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/>${dot(12, 19, 1)}`,
    drop: '<path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    music: '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    racket: `<path d="M12 3c3.6 0 6 2.6 6 6.2 0 3.5-2.6 6-6 6s-6-2.5-6-6C6 5.6 8.4 3 12 3z"/><path d="M10.6 15.1 10 20.5h4l-.6-5.4"/>${dot(10, 7.5, .8)}${dot(14, 7.5, .8)}${dot(12, 10, .8)}${dot(10, 12.3, .8)}${dot(14, 12.3, .8)}`,
    coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5"/>',
    pet: '<circle cx="7" cy="9.5" r="1.8"/><circle cx="17" cy="9.5" r="1.8"/><circle cx="10" cy="5.5" r="1.6"/><circle cx="14" cy="5.5" r="1.6"/><path d="M12 11.5c-2.5 0-5 3.5-5 5.8 0 1.7 1.5 2.2 2.8 2.2.9 0 1.4-.4 2.2-.4s1.3.4 2.2.4c1.3 0 2.8-.5 2.8-2.2 0-2.3-2.5-5.8-5-5.8z"/>',
  };

  // Emojis guardados antes → ícono propio
  const EMOJI = {
    "🍔": "food", "🍕": "food", "🌮": "food", "🍽️": "food", "🛒": "cart", "🚗": "car", "🚕": "car", "🚌": "car", "⛽": "fuel",
    "🏠": "home", "🏡": "home", "💡": "bulb", "⚡": "zap", "💳": "card", "🎓": "school", "📚": "school", "💊": "health", "🏥": "health",
    "🎬": "film", "🎮": "film", "👕": "shirt", "👗": "shirt", "👧": "child", "👦": "child", "👶": "child", "📺": "tv", "🎁": "gift",
    "📦": "box", "💼": "briefcase", "💵": "cash", "💰": "cash", "🏷️": "tag", "↩️": "refund", "🏦": "bank", "🌐": "wifi", "🚰": "drop",
    "💧": "drop", "📱": "phone", "🎵": "music", "🎧": "music", "🏋️": "dumbbell", "💪": "dumbbell", "🎾": "racket", "🏓": "racket",
    "☕": "coffee", "🐶": "pet", "🐱": "pet", "🐾": "pet", "👛": "wallet", "🐷": "piggy", "🎯": "target", "🧾": "receipt", "❔": "question",
  };
  // Si el ícono no se reconoce, se adivina por el nombre
  const WORDS = [
    [/comida|restaur|antojo|almuerzo|cena/, "food"], [/s[uú]per|despensa|mandado/, "cart"], [/gasolin|combust/, "fuel"],
    [/transporte|uber|taxi|auto|carro|metro|cami[oó]n/, "car"], [/casa|renta|hogar|hipoteca/, "home"], [/servicio|luz|electric/, "bulb"],
    [/cr[eé]dito|tarjeta/, "card"], [/educa|colegio|escuela|curso/, "school"], [/salud|m[eé]dic|farmacia|doctor/, "health"],
    [/entreten|cine|juego|salida/, "film"], [/ropa|zapato/, "shirt"], [/hij|ni[nñ]|beb[eé]/, "child"], [/suscrip|netflix|disney|hbo|prime/, "tv"],
    [/regalo/, "gift"], [/sueldo|salario|n[oó]mina|quincena/, "briefcase"], [/extra|efectivo/, "cash"], [/venta/, "tag"],
    [/reembolso|devoluci/, "refund"], [/d[eé]bito|banco|ahorro/, "bank"], [/internet|wifi/, "wifi"], [/agua/, "drop"],
    [/tel[eé]fono|celular|plan/, "phone"], [/spotify|m[uú]sica/, "music"], [/gimnasio|gym/, "dumbbell"], [/p[aá]del|tenis|deporte/, "racket"],
    [/caf[eé]/, "coffee"], [/mascota|perro|gato|veterin/, "pet"],
  ];
  const norm = (s) => String(s || "").toLowerCase();
  function iconKey(value, name, fallback = "box") {
    if (value && P[value]) return value;
    if (value && EMOJI[value]) return EMOJI[value];
    const n = norm(name);
    for (const [re, k] of WORDS) if (re.test(n)) return k;
    return fallback;
  }
  const ico = (key, cls = "") => `<svg class="i${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${P[key] ? key : "box"}"></use></svg>`;
  // Íconos que se pueden elegir para cuentas y categorías
  const PICKABLE = ["food", "cart", "car", "fuel", "home", "bulb", "card", "bank", "cash", "wallet", "school", "health", "film", "shirt",
    "child", "tv", "gift", "briefcase", "tag", "refund", "wifi", "drop", "phone", "music", "dumbbell", "racket", "coffee", "pet",
    "piggy", "star", "target", "receipt", "box"];

  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${
    Object.entries(P).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join("")
  }</svg>`;
  document.body.insertAdjacentHTML("afterbegin", sprite);
  window.WCIcons = { ico, iconKey, PICKABLE, has: (k) => !!P[k] };
})();

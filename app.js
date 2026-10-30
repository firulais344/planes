(function () {
  "use strict";

  var PLANES = window.PLANES || [];

  var CATEGORIAS = {
    "fiesta": { nombre: "Fiestas y noche", emoji: "🪩" },
    "aire-libre": { nombre: "Aire libre", emoji: "🌿" },
    "comida-cultura": { nombre: "Comida y cultura", emoji: "🎭" }
  };
  var PRECIOS = {
    gratis: "Gratis",
    barato: "$ Económico",
    medio: "$$ Medio",
    alto: "$$$ Alto",
    consultar: "Precio por confirmar"
  };
  var CON = { pareja: "Pareja", amigos: "Amigos", familia: "Familia", solo: "Solo/a" };
  var CUANDO_TXT = {
    hoy: "hoy", manana: "mañana", finde: "este fin de semana",
    semana: "los próximos 7 días", todo: "lo que viene"
  };

  var state = { cuando: "hoy", cat: "todas", precio: "todos", con: "todos", zona: "todas", q: "", siempre: true };

  // ---------- Fechas ----------
  function parse(iso) {
    var p = iso.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function hoy() {
    // ?hoy=AAAA-MM-DD sirve para probar con otra fecha.
    var m = /[?&]hoy=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (m) return parse(m[1]);
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function same(a, b) { return a.getTime() === b.getTime(); }

  var HOY = hoy();

  function rango(cuando) {
    switch (cuando) {
      case "hoy": return [HOY, HOY];
      case "manana": var m = addDays(HOY, 1); return [m, m];
      case "finde":
        var dow = HOY.getDay(); // 0 dom ... 6 sáb
        if (dow === 0) return [HOY, HOY];
        if (dow >= 5) return [HOY, addDays(HOY, 7 - dow)];
        return [addDays(HOY, 5 - dow), addDays(HOY, 7 - dow)];
      case "semana": return [HOY, addDays(HOY, 6)];
      default: return [HOY, new Date(2100, 0, 1)];
    }
  }

  var fmtDia = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
  var fmtCorto = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  var fmtSemCorto = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function limpio(s) { return s.replace(/\./g, ""); }

  function inicio(p) { return parse(p.inicio); }
  function fin(p) { return parse(p.fin || p.inicio); }

  function etiquetaFecha(p) {
    var i = inicio(p), f = fin(p);
    if (same(i, f)) {
      if (same(i, HOY)) return "Hoy";
      if (same(i, addDays(HOY, 1))) return "Mañana";
      return cap(limpio(fmtSemCorto.format(i)));
    }
    if (i <= HOY) return "En curso · hasta " + limpio(fmtCorto.format(f));
    return limpio(fmtCorto.format(i)) + " – " + limpio(fmtCorto.format(f));
  }

  function tituloDia(d) {
    if (same(d, HOY)) return ["Hoy", cap(fmtDia.format(d))];
    if (same(d, addDays(HOY, 1))) return ["Mañana", cap(fmtDia.format(d))];
    return [cap(fmtDia.format(d)), ""];
  }

  // ---------- Filtros ----------
  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function pasaComunes(p) {
    if (state.cat !== "todas" && p.categoria !== state.cat) return false;
    if (state.precio === "gratis" && p.precio !== "gratis") return false;
    if (state.precio === "economico" && ["gratis", "barato", "medio"].indexOf(p.precio) === -1) return false;
    if (state.con !== "todos" && (p.con || []).indexOf(state.con) === -1) return false;
    if (state.zona !== "todas" && p.zona !== state.zona) return false;
    if (state.q) {
      var texto = norm([p.titulo, p.lugar, p.zona, p.descripcion, CATEGORIAS[p.categoria].nombre].join(" "));
      var palabras = norm(state.q).split(/\s+/).filter(Boolean);
      for (var i = 0; i < palabras.length; i++) if (texto.indexOf(palabras[i]) === -1) return false;
    }
    return true;
  }

  function eventosVisibles() {
    var r = rango(state.cuando);
    return PLANES.filter(function (p) {
      if (p.tipo !== "evento" || !pasaComunes(p)) return false;
      if (fin(p) < HOY) return false; // ya pasó
      return inicio(p) <= r[1] && fin(p) >= r[0];
    }).sort(function (a, b) {
      return inicio(a) - inicio(b) || a.titulo.localeCompare(b.titulo);
    });
  }

  function permanentesVisibles() {
    if (!state.siempre) return [];
    return PLANES.filter(function (p) { return p.tipo === "permanente" && pasaComunes(p); });
  }

  // ---------- Render ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function tarjeta(p) {
    var cat = CATEGORIAS[p.categoria];
    var card = el("article", "card");
    card.id = "plan-" + p.id;

    var art = el("div", "card__art art--" + p.categoria);
    var emoji = el("span", "card__emoji", cat.emoji);
    emoji.setAttribute("aria-hidden", "true");
    art.appendChild(emoji);
    art.appendChild(el("span", "card__date", p.tipo === "evento" ? etiquetaFecha(p) : "Siempre disponible"));
    card.appendChild(art);

    var body = el("div", "card__body");
    body.appendChild(el("span", "card__cat", cat.nombre));
    body.appendChild(el("h3", "card__title", p.titulo));
    var donde = p.lugar + (p.zona && p.zona !== p.lugar ? " · " + p.zona : "");
    if (p.hora) donde += " · " + p.hora;
    body.appendChild(el("p", "card__where", donde));
    body.appendChild(el("p", "card__desc", p.descripcion));
    if (p.precioTexto) body.appendChild(el("p", "card__note", p.precioTexto));

    var tags = el("div", "card__tags");
    tags.appendChild(el("span", "tag " + (p.precio === "gratis" ? "tag--gratis" : "tag--precio"), PRECIOS[p.precio] || PRECIOS.consultar));
    (p.con || []).forEach(function (c) { tags.appendChild(el("span", "tag", CON[c])); });
    body.appendChild(tags);

    var texto = p.tipo === "evento" ? "Ver detalles y entradas ↗" : "Ver más ↗";
    var a = el("a", "card__link", texto);
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute("aria-label", texto.replace(" ↗", "") + ": " + p.titulo + " (se abre en otra pestaña)");
    body.appendChild(a);

    card.appendChild(body);
    return card;
  }

  function render() {
    var lista = document.getElementById("lista");
    lista.textContent = "";

    var eventos = eventosVisibles();
    var fijos = permanentesVisibles();

    // Agrupar eventos por su primer día visible
    var r = rango(state.cuando);
    var grupos = [];
    eventos.forEach(function (p) {
      var d = inicio(p) < r[0] ? r[0] : inicio(p);
      var g = grupos[grupos.length - 1];
      if (!g || !same(g.dia, d)) { g = { dia: d, items: [] }; grupos.push(g); }
      g.items.push(p);
    });

    grupos.forEach(function (g) {
      var t = tituloDia(g.dia);
      var h = el("h2", "day", t[0]);
      if (t[1]) h.appendChild(el("small", "", t[1]));
      lista.appendChild(h);
      var grid = el("div", "grid");
      g.items.forEach(function (p) { grid.appendChild(tarjeta(p)); });
      lista.appendChild(grid);
    });

    if (fijos.length) {
      var h2 = el("h2", "day", "Lugares y planes de siempre");
      h2.appendChild(el("small", "", "Disponibles cualquier día"));
      lista.appendChild(h2);
      var grid2 = el("div", "grid");
      fijos.forEach(function (p) { grid2.appendChild(tarjeta(p)); });
      lista.appendChild(grid2);
    }

    var total = eventos.length + fijos.length;
    document.getElementById("vacio").hidden = total > 0;

    var partes = [];
    if (eventos.length) partes.push(eventos.length + (eventos.length === 1 ? " evento" : " eventos") + " para " + CUANDO_TXT[state.cuando]);
    if (fijos.length) partes.push(fijos.length + (fijos.length === 1 ? " plan de siempre" : " planes de siempre"));
    document.getElementById("count").textContent = total ? partes.join(" + ") : "";
  }

  // ---------- Controles ----------
  function marcar(grupoSel, attr, valor) {
    document.querySelectorAll(grupoSel + " .chip").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === valor));
    });
  }

  function iniciarZonas() {
    var zonas = {};
    PLANES.forEach(function (p) { if (p.zona) zonas[p.zona] = true; });
    var sel = document.getElementById("zona");
    Object.keys(zonas).sort(function (a, b) { return a.localeCompare(b, "es"); }).forEach(function (z) {
      var o = document.createElement("option");
      o.value = z; o.textContent = z;
      sel.appendChild(o);
    });
  }

  function sorprender() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#lista .card"));
    if (!cards.length) return;
    var c = cards[Math.floor(Math.random() * cards.length)];
    c.scrollIntoView({ behavior: "smooth", block: "center" });
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }

  function reset() {
    state = { cuando: "todo", cat: "todas", precio: "todos", con: "todos", zona: "todas", q: "", siempre: true };
    document.getElementById("q").value = "";
    document.getElementById("precio").value = "todos";
    document.getElementById("con").value = "todos";
    document.getElementById("zona").value = "todas";
    document.getElementById("siempre").checked = true;
    marcar("#cuando", "data-cuando", state.cuando);
    marcar("#cats", "data-cat", state.cat);
    render();
  }

  function init() {
    iniciarZonas();
    document.getElementById("actualizado").textContent = window.ACTUALIZADO || "";

    // Si no hay nada para hoy, empezar en "Este fin de semana" o "Todo".
    state.cuando = "hoy";
    if (!eventosVisibles().length) {
      state.cuando = "finde";
      if (!eventosVisibles().length) state.cuando = "todo";
    }
    marcar("#cuando", "data-cuando", state.cuando);

    document.getElementById("cuando").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cuando]");
      if (!b) return;
      state.cuando = b.getAttribute("data-cuando");
      marcar("#cuando", "data-cuando", state.cuando);
      render();
    });
    document.getElementById("cats").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      state.cat = b.getAttribute("data-cat");
      marcar("#cats", "data-cat", state.cat);
      render();
    });
    ["precio", "con", "zona"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function (e) { state[id] = e.target.value; render(); });
    });
    document.getElementById("siempre").addEventListener("change", function (e) { state.siempre = e.target.checked; render(); });
    document.getElementById("q").addEventListener("input", function (e) { state.q = e.target.value.trim(); render(); });
    document.getElementById("sorprende").addEventListener("click", sorprender);
    document.getElementById("reset").addEventListener("click", reset);

    render();
  }

  init();
})();

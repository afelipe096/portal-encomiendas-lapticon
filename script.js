const BASE_URL = "https://lapticon-backend-ed.onrender.com";
const FIREBASE_API_KEY = "AIzaSyAuh64b_I2OtC7KYuubCVx9plEe2pojp2M";

let idToken = null;
let uid = null;
let ciudadesDisponibles = [];

const $ = (id) => document.getElementById(id);

function mostrarEstado(elemento, mensaje, tipo = "") {
  elemento.textContent = mensaje;
  elemento.className = tipo ? `status ${tipo}` : "status";
}

async function leerRespuesta(res) {
  const texto = await res.text();
  if (!texto) return {};
  try {
    return JSON.parse(texto);
  } catch {
    return { message: texto };
  }
}

function mensajeError(data, fallback) {
  return data?.error?.message || data?.message || data?.mensaje || data?.error || fallback;
}

function obtenerLista(data, posiblesClaves) {
  if (Array.isArray(data)) return data;
  for (const clave of posiblesClaves) {
    if (Array.isArray(data?.[clave])) return data[clave];
    if (Array.isArray(data?.data?.[clave])) return data.data[clave];
  }
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function idCiudad(ciudad) {
  return ciudad?._id ?? ciudad?.id ?? ciudad?.uid ?? ciudad?.nombre ?? ciudad?.name ?? "";
}

function nombreCiudad(ciudad) {
  return ciudad?.nombre ?? ciudad?.name ?? ciudad?.ciudad ?? ciudad?.nombreCiudad ?? "Ciudad sin nombre";
}

function nombrePais(ciudad) {
  const pais = ciudad?.pais ?? ciudad?.country ?? ciudad?.nombrePais ?? "";
  if (typeof pais === "string") return pais;
  return pais?.nombre ?? pais?.name ?? "";
}

function llenarSelect(select, ciudades, textoInicial) {
  select.replaceChildren();
  const inicial = document.createElement("option");
  inicial.value = "";
  inicial.textContent = textoInicial;
  select.appendChild(inicial);

  ciudades.forEach((ciudad) => {
    const option = document.createElement("option");
    option.value = String(idCiudad(ciudad));
    const pais = nombrePais(ciudad);
    option.textContent = pais ? `${nombreCiudad(ciudad)}, ${pais}` : nombreCiudad(ciudad);
    select.appendChild(option);
  });
}

// Bloque 1: inicio de sesión con Firebase.
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const boton = $("login-button");

  boton.disabled = true;
  boton.textContent = "Ingresando...";
  mostrarEstado($("login-status"), "Verificando credenciales...");

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await leerRespuesta(res);

    if (!res.ok) {
      mostrarEstado($("login-status"), mensajeError(data, "No fue posible iniciar sesión."), "error");
      return;
    }

    idToken = data.idToken;
    uid = data.localId;

    if (!idToken || !uid) {
      mostrarEstado($("login-status"), "La respuesta de autenticación no contiene el token esperado.", "error");
      return;
    }

    $("login-section").hidden = true;
    $("app-section").hidden = false;
    $("welcome-message").textContent = `Bienvenido, ${data.email || email}`;
    mostrarEstado($("login-status"), "");
    await Promise.all([cargarCiudades(), cargarEncomiendas()]);
  } catch (error) {
    mostrarEstado($("login-status"), `Error de conexión: ${error.message}`, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Ingresar";
  }
});

// Bloque 2: catálogo público de países y ciudades.
async function cargarCiudades() {
  const origen = $("origen-select");
  const destino = $("destino-select");
  origen.disabled = true;
  destino.disabled = true;
  llenarSelect(origen, [], "Cargando ciudades...");
  llenarSelect(destino, [], "Cargando ciudades...");

  try {
    const [paisesRes, ciudadesRes] = await Promise.all([
      fetch(`${BASE_URL}/api/ciudades/paises`),
      fetch(`${BASE_URL}/api/ciudades/ciudades`),
    ]);
    const [paisesData, ciudadesData] = await Promise.all([
      leerRespuesta(paisesRes),
      leerRespuesta(ciudadesRes),
    ]);

    if (!paisesRes.ok) throw new Error(mensajeError(paisesData, "No se pudieron consultar los países."));
    if (!ciudadesRes.ok) throw new Error(mensajeError(ciudadesData, "No se pudieron consultar las ciudades."));

    const paises = obtenerLista(paisesData, ["paises", "countries"]);
    ciudadesDisponibles = obtenerLista(ciudadesData, ["ciudades", "cities"]);

    if (!ciudadesDisponibles.length) {
      throw new Error("La API no devolvió ciudades disponibles.");
    }

    // Si la ciudad solo trae el identificador del país, se agrega su nombre para mostrarlo.
    const paisPorId = new Map(paises.map((pais) => [
      String(pais?._id ?? pais?.id ?? pais?.uid ?? ""),
      pais?.nombre ?? pais?.name ?? "",
    ]));
    ciudadesDisponibles = ciudadesDisponibles.map((ciudad) => {
      if (nombrePais(ciudad)) return ciudad;
      const referenciaPais = ciudad?.paisId ?? ciudad?.pais_id ?? ciudad?.countryId ?? ciudad?.pais;
      const nombre = paisPorId.get(String(referenciaPais ?? "")) || "";
      return nombre ? { ...ciudad, nombrePais: nombre } : ciudad;
    });

    llenarSelect(origen, ciudadesDisponibles, "Selecciona el origen");
    llenarSelect(destino, ciudadesDisponibles, "Selecciona el destino");
    origen.disabled = false;
    destino.disabled = false;
  } catch (error) {
    llenarSelect(origen, [], "No se pudieron cargar las ciudades");
    llenarSelect(destino, [], "No se pudieron cargar las ciudades");
    mostrarEstado($("encomienda-status"), error.message, "error");
  }
}

// Bloque 3: registro de encomiendas.
$("encomienda-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const body = {
    ciudadOrigen: $("origen-select").value,
    ciudadDestino: $("destino-select").value,
    valor: Number($("valor-input").value),
    moneda: $("moneda-select").value,
    observaciones: $("observaciones-input").value.trim(),
  };

  if (!body.ciudadOrigen || !body.ciudadDestino || !body.valor || body.valor <= 0 || !body.moneda || !body.observaciones) {
    mostrarEstado($("encomienda-status"), "Completa origen, destino, valor y moneda. El valor debe ser mayor que cero.", "error");
    return;
  }
  if (body.ciudadOrigen === body.ciudadDestino) {
    mostrarEstado($("encomienda-status"), "La ciudad de origen y destino deben ser diferentes.", "error");
    return;
  }

  const boton = $("create-button");
  boton.disabled = true;
  boton.textContent = "Registrando...";
  mostrarEstado($("encomienda-status"), "Enviando encomienda...");

  try {
    const res = await fetch(`${BASE_URL}/api/encomiendas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });
    const data = await leerRespuesta(res);

    if (!res.ok) {
      mostrarEstado($("encomienda-status"), mensajeError(data, "No se pudo crear la encomienda."), "error");
      return;
    }

    mostrarEstado($("encomienda-status"), data?.message || data?.mensaje || "La encomienda se registró correctamente.", "success");
    $("encomienda-form").reset();
    await cargarEncomiendas();
  } catch (error) {
    mostrarEstado($("encomienda-status"), `Error de conexión: ${error.message}`, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = "Crear encomienda";
  }
});

// Bloque 4: consulta y renderizado de las encomiendas del usuario.
function textoCampo(valor, alternativa = "—") {
  if (valor === null || valor === undefined || valor === "") return alternativa;
  if (typeof valor === "object") return valor.nombre ?? valor.name ?? valor.ciudad ?? alternativa;
  return String(valor);
}

function crearCelda(fila, valor) {
  const celda = document.createElement("td");
  celda.textContent = valor;
  fila.appendChild(celda);
  return celda;
}

function valorEncomienda(encomienda) {
  const valor = encomienda?.valor ?? encomienda?.precio ?? "";
  const moneda = encomienda?.moneda ?? "COP";
  if (valor === "") return "—";
  const numero = Number(valor);
  return Number.isFinite(numero)
    ? new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda }).format(numero)
    : `${valor} ${moneda}`;
}

async function cargarEncomiendas() {
  const cuerpo = $("encomiendas-body");
  cuerpo.replaceChildren();
  const filaCarga = document.createElement("tr");
  const celdaCarga = document.createElement("td");
  celdaCarga.colSpan = 5;
  celdaCarga.className = "empty-cell";
  celdaCarga.textContent = "Cargando encomiendas...";
  filaCarga.appendChild(celdaCarga);
  cuerpo.appendChild(filaCarga);

  try {
    const res = await fetch(`${BASE_URL}/api/encomiendas`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = await leerRespuesta(res);
    if (!res.ok) throw new Error(mensajeError(data, "No se pudieron consultar las encomiendas."));

    const encomiendas = obtenerLista(data, ["encomiendas", "results"]);
    cuerpo.replaceChildren();

    if (!encomiendas.length) {
      const fila = document.createElement("tr");
      const celda = document.createElement("td");
      celda.colSpan = 5;
      celda.className = "empty-cell";
      celda.textContent = "Todavía no tienes encomiendas registradas.";
      fila.appendChild(celda);
      cuerpo.appendChild(fila);
      mostrarEstado($("list-status"), "");
      return;
    }

    encomiendas.forEach((encomienda) => {
      const fila = document.createElement("tr");
      const id = encomienda?._id ?? encomienda?.id;
      fila.dataset.id = id ?? "";
      const origen = encomienda?.ciudadOrigen ?? encomienda?.origen;
      const destino = encomienda?.ciudadDestino ?? encomienda?.destino;
      const estado = textoCampo(encomienda?.estado, "Pendiente");

      crearCelda(fila, textoCampo(origen));
      crearCelda(fila, textoCampo(destino));
      const celdaEstado = crearCelda(fila, estado);
      celdaEstado.classList.add("estado-cell");
      crearCelda(fila, valorEncomienda(encomienda));

      const acciones = document.createElement("td");
      if (id && estado.toLowerCase() !== "cancelada") {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.className = "button-danger";
        boton.textContent = "Cancelar";
        boton.addEventListener("click", () => cancelarEncomienda(id));
        acciones.appendChild(boton);
      } else if (estado.toLowerCase() === "cancelada") {
        acciones.textContent = "Sin acciones";
      } else {
        acciones.textContent = "—";
      }
      fila.appendChild(acciones);
      cuerpo.appendChild(fila);
    });
    mostrarEstado($("list-status"), `${encomiendas.length} encomienda(s) encontrada(s).`);
  } catch (error) {
    cuerpo.replaceChildren();
    const fila = document.createElement("tr");
    const celda = document.createElement("td");
    celda.colSpan = 5;
    celda.className = "empty-cell";
    celda.textContent = error.message;
    fila.appendChild(celda);
    cuerpo.appendChild(fila);
    mostrarEstado($("list-status"), error.message, "error");
  }
}

// Bloque 5: cancelar una encomienda y actualizar únicamente su fila.
async function cancelarEncomienda(encomiendaId) {
  if (!confirm("¿Deseas cancelar esta encomienda?")) return;
  const fila = [...$("encomiendas-body").rows].find((row) => row.dataset.id === String(encomiendaId));
  const boton = fila?.querySelector("button");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Cancelando...";
  }

  try {
    const res = await fetch(`${BASE_URL}/api/encomiendas/${encodeURIComponent(encomiendaId)}/estado`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ estado: "cancelada" }),
    });
    const data = await leerRespuesta(res);
    if (!res.ok) throw new Error(mensajeError(data, "No se pudo cancelar la encomienda."));

    if (fila) {
      const celdaEstado = fila.querySelector(".estado-cell");
      if (celdaEstado) celdaEstado.textContent = "cancelada";
      const acciones = fila.lastElementChild;
      acciones.textContent = "Sin acciones";
    }
    mostrarEstado($("list-status"), "La encomienda se canceló correctamente.", "success");
  } catch (error) {
    mostrarEstado($("list-status"), error.message, "error");
    if (boton) {
      boton.disabled = false;
      boton.textContent = "Cancelar";
    }
  }
}

$("refresh-button").addEventListener("click", cargarEncomiendas);

$("logout-button").addEventListener("click", () => {
  idToken = null;
  uid = null;
  ciudadesDisponibles = [];
  $("app-section").hidden = true;
  $("login-section").hidden = false;
  $("login-form").reset();
  $("encomienda-form").reset();
  $("encomiendas-body").replaceChildren();
  mostrarEstado($("login-status"), "Se cerró la sesión correctamente.", "success");
});

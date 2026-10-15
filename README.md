# Validador de Cobertura

Página web (HTML + CSS + JavaScript, sin instalaciones ni compilación) para que los operadores de televentas
validen al instante la cobertura de despacho en **Chile, Perú y Paraguay**:

- si el lugar tiene **cobertura** y, cuando la matriz lo trae, qué **courier** lo atiende, cómo **paga** el cliente
  y qué **productos** se pueden vender,
- la **fecha estimada de entrega**: días hábiles, feriados de cada país, **días de reparto** de cada lugar y el corte
  diario a las **00:00 UTC** (19:00 en Perú),
- y **dónde está el cliente en el mapa**: se ubica su dirección, se compara con el lugar elegido (distancia y aviso
  si parece lejos) y se proponen los lugares de la matriz que calzan con esa dirección.

Cada campaña tiene su color, sus filtros y sus columnas. Se cambia con los botones de banderas del encabezado.

| Campaña | Se busca por | Filtros | Columnas del Excel |
|---|---|---|---|
| Chile | Localidad, comuna, código postal, siglas | Región → Comuna, Courier | LOCALIDAD, COMUNA, PROVINCIA, REGION, SIGLAS, ZIPCODE, DIAS DE REPARTO, COBERTURA, TIEMPO DE ENTREGA, COURIER |
| Perú | Urbanización, distrito, provincia, UBIGEO | Departamento → Provincia → Distrito | (Departamento), Provincia, Distrito, Urbanizacion, UBIGEO, Cobertura |
| Paraguay | Ciudad, barrio, departamento, ZIP code | Departamento, Courier, Productos | Courier, ZIP CODE, Barrios, Ciudad, Departamento, Tiempo de entrega, Dias de entrega, (productos) |

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página de los operadores |
| `admin.html` | Convierte el Excel de una campaña en su archivo de datos cifrado |
| `datos/chile.js`, `datos/peru.js`, `datos/paraguay.js` | Datos cifrados de cada campaña. Se reemplazan en cada actualización |
| `js/campanas.js` | **Todo lo de cada país**: columnas, filtros, textos, reglas de pago, feriados |
| `js/config.js` | Hora de corte (00:00 UTC) y distancia de aviso en el mapa |
| `js/*.js` | Buscador, fechas, cifrado, mapa, importación del Excel |

## Seguridad de los datos

GitHub Pages gratis exige que el repositorio sea público. Por eso los archivos de `datos/` van **cifrados** con el
código del equipo (PBKDF2 + AES-256-GCM): sin el código solo se ve texto ilegible.

- Cada campaña puede tener su propio código o compartir uno. Si un operador ya entró con un código, la página lo
  prueba sola en las otras campañas.
- Usa códigos de **al menos 10 caracteres** que mezclen letras y números.
- El botón **Bloquear** olvida los códigos guardados en ese equipo.
- Los Excel **nunca** se suben al repositorio (`.gitignore` los bloquea).

## Publicar en GitHub Pages (una sola vez)

1. Crea un repositorio en GitHub (público) y sube todos estos archivos.
2. **Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. En 1–2 minutos la página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Actualizar una campaña

1. Descarga la hoja de la campaña como Excel (.xlsx).
2. Abre `admin.html` (enlace **Administración** al pie de la página) y elige la campaña con las banderas.
3. Escribe el código del equipo (el mismo de siempre, así verás qué cambia respecto a lo publicado).
4. Arrastra el Excel, revisa el reporte y presiona **Generar** (descarga `chile.js`, `peru.js` o `paraguay.js`).
5. En GitHub, carpeta `datos` → **Add file → Upload files** → arrastra el archivo → **Commit changes**.

Los operadores ven los datos nuevos al recargar la página (1–2 minutos).

## Agregar una campaña nueva

En `js/campanas.js` se copia el bloque de una campaña parecida y se ajustan: nombre, país, archivo de datos,
nombres de columnas, filtros, textos y feriados. El color se define en `css/estilos.css`
(`body[data-campana='...']`).

## Probar en el computador

Abrir `index.html` con doble clic funciona para buscar, ver fechas y copiar mensajes. La **ubicación en el mapa** solo
funciona en la página publicada (OpenStreetMap rechaza consultas que no vienen de un sitio web).

## Servicios externos (gratuitos, sin clave)

- Mapa: [Leaflet](https://leafletjs.com) + [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Direcciones: [Nominatim](https://nominatim.org), máximo 1 consulta por segundo (la página lo respeta y guarda las
  ubicaciones ya consultadas). Respaldo: [Photon](https://photon.komoot.io).
- Lectura de Excel en `admin.html`: [SheetJS](https://sheetjs.com).

## Mantenimiento

- **Feriados** de cada país: en `js/campanas.js` (revisar cada año; en Paraguay algunos se trasladan por decreto).
- **Reglas de pago:** hoy solo Chile las tiene definidas (`pagos` en `js/campanas.js`).
- `TIEMPO DE ENTREGA` se interpreta como **días hábiles**.

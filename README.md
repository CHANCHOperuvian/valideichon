# Validador de Cobertura Chile

Página web (HTML + CSS + JavaScript, sin instalaciones ni compilación) para que los operadores de televentas
validen al instante:

- si una localidad de Chile tiene **cobertura** (activa o inactiva),
- qué **courier** la atiende y cómo **paga** el cliente (Contraentrega: efectivo o transferencia · Blue Express: solo efectivo),
- la **fecha estimada de entrega**: días hábiles en hora de Chile, feriados, hora de corte (15:00) y **días de reparto**
  de cada localidad,
- y **dónde está el cliente en el mapa**: se busca su dirección, se marca con un pin y se compara con la localidad
  (distancia y aviso si parece lejos). Si solo tienes la dirección, la página propone las localidades de la matriz
  que calzan.

También: búsqueda tolerante a tildes y errores de tipeo, por código postal o siglas, aviso de localidades con el
mismo nombre en otras comunas, mensaje listo para copiar al cliente y resumen interno.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La página de los operadores |
| `admin.html` | Convierte el Excel de cobertura en `datos/cobertura.js` (cifrado) |
| `datos/cobertura.js` | Los datos cifrados. **Se reemplaza en cada actualización** |
| `js/config.js` | Reglas del negocio: hora de corte, reglas de pago, **feriados**, distancia de aviso |
| `js/*.js` | Buscador, fechas, cifrado, mapa, importación del Excel |
| `css/estilos.css` | Estilos |

## Seguridad de los datos

GitHub Pages gratis exige que el repositorio sea público. Por eso `datos/cobertura.js` va **cifrado** con el código del
equipo (PBKDF2 + AES-256-GCM, estándar del navegador): quien abra el archivo solo ve texto ilegible. Los operadores
escriben el código una vez y pueden dejarlo recordado en su equipo (botón **Bloquear** para olvidarlo).

- Usa un código de **al menos 10 caracteres** que mezcle letras y números (la página exige mínimo 8).
- Si alguien que no debe conoce el código: genera el archivo de nuevo con un código nuevo y súbelo.
- El Excel **nunca** se sube al repositorio (`.gitignore` lo bloquea): se procesa solo en el navegador del administrador.

## Publicar en GitHub Pages (una sola vez)

1. Crea un repositorio en GitHub (público) y sube todos estos archivos.
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   rama `main`, carpeta `/ (root)` → **Save**.
3. En 1–2 minutos la página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.
   Ese es el link para los operadores.

## Actualizar la cobertura

1. En Google Sheets, **Archivo → Descargar → Microsoft Excel (.xlsx)** de la hoja *Cobertura Chile*.
2. Abre `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/admin.html`.
3. Escribe el código del equipo (el mismo de siempre, así verás qué cambia respecto a lo publicado).
4. Arrastra el Excel. Si tiene varias pestañas, elige cuál usar (por defecto *Matriz*).
5. Revisa el reporte (localidades, inactivas, filas descartadas, avisos, cambios) y presiona **Generar cobertura.js**.
6. En GitHub entra a la carpeta `datos` → **Add file → Upload files** → arrastra el `cobertura.js` descargado →
   **Commit changes**.

Los operadores ven los datos nuevos al recargar la página (GitHub puede tardar hasta ~10 minutos en dejar de entregar
la versión anterior).

## Probar en el computador

Abrir `index.html` con doble clic funciona para buscar localidades, ver fechas y copiar mensajes. La **búsqueda de
direcciones en el mapa** solo funciona en la página publicada: el servicio de mapas (OpenStreetMap) rechaza consultas
que no vienen de un sitio web.

## Servicios externos (gratuitos, sin clave)

- Mapa: [Leaflet](https://leafletjs.com) + mapa base de [OpenStreetMap](https://www.openstreetmap.org/copyright).
- Direcciones: [Nominatim](https://nominatim.org) (OpenStreetMap), máximo 1 consulta por segundo (la página lo
  respeta y guarda en el navegador las ubicaciones ya consultadas). Respaldo: [Photon](https://photon.komoot.io).
- Lectura de Excel en `admin.html`: [SheetJS](https://sheetjs.com).

Estos servicios son para uso moderado. Si el equipo crece mucho, conviene pasar a un servicio de mapas con cuenta propia.

## Mantenimiento

- **Feriados:** agrega los de cada año en `js/config.js`.
- **Reglas de pago u hora de corte:** también en `js/config.js`.
- `TIEMPO DE ENTREGA` se interpreta como **días hábiles**.

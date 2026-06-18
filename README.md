# WhatsApp Organizer

> Descarga y organiza automáticamente archivos recibidos por WhatsApp.

Aplicación de escritorio (Electron) que se conecta a WhatsApp, descarga los archivos multimedia que recibes y los organiza en carpetas por cliente y fecha.

![License](https://img.shields.io/badge/license-ISC-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Electron](https://img.shields.io/badge/electron-42-blue)

---

## Características

- **Autenticación QR** — Escanea con tu celular y la sesión se guarda para usos futuros.
- **Barrido automático** — Al conectarse, revisa mensajes antiguos de los últimos N días.
- **Procesamiento en tiempo real** — Detecta y descarga archivos nuevos al instante.
- **Organización automática** — Guarda los archivos en `~/Documents/Clientes3D/{Empresa}/{Fecha}/{Archivo}`.
- **Gestión de clientes** — Asigna números de teléfono a nombres de empresa.
- **Filtros de descarga** — Elige qué tipos de archivos descargar (documentos, imágenes, videos, audio, stickers).
- **Tema oscuro/claro** — Alterna entre modos con persistencia en `localStorage`.
- **Ruta de guardado configurable** — Cambia la carpeta de destino desde la interfaz.
- **Abrir archivo / carpeta** — Botones para abrir cada archivo o mostrar su ubicación.
- **Cancelar barrido** — Detén la búsqueda de mensajes antiguos en cualquier momento.
- **Limpieza de base de datos** — Elimina registros de más de 90 días.
- **Deduplicación** — Los archivos ya procesados no se descargan de nuevo.
- **Cerrar sesión** — Borra la sesión guardada y vuelve a escanear QR.

---

## Requisitos

- Node.js 18+
- pnpm (`npm i -g pnpm`)
- Una cuenta de WhatsApp activa

---

## Instalación

```bash
# Clonar el repositorio
git clone <url>
cd Laura

# Instalar dependencias
pnpm install

# (Opcional) Configurar clientes
cp clientes.example.json clientes.json
# Edita clientes.json con tus números y empresas
```

### Formato de `clientes.json`

```json
{
  "573001234567@c.us": "Mi Empresa",
  "573009876543@c.us": "Otra Empresa"
}
```

Los números deben incluir el código de país sin el signo `+`. Los contactos no configurados se clasifican como **"Sin clasificar"**.

---

## Uso

```bash
# Modo desarrollo
pnpm dev

# Compilar instalador para Windows
pnpm build
```

---

## Cómo funciona

1. La aplicación inicia una ventana de Electron e inicializa el cliente de WhatsApp.
2. Si no hay sesión guardada, muestra un código QR para escanear desde WhatsApp (Dispositivos vinculados).
3. Al autenticarse, construye un mapa de nombres de contacto → empresas y barre los mensajes antiguos.
4. Por cada chat, obtiene los últimos mensajes dentro del rango configurado.
5. Descarga los archivos que coinciden con los tipos seleccionados.
6. Guarda cada archivo en `~/Documents/Clientes3D/{Empresa}/{Fecha}/{Nombre}`.
7. Registra el ID del mensaje en SQLite para evitar duplicados.
8. Escucha mensajes nuevos en tiempo real y los procesa igual que los antiguos.

---

## Arquitectura

```
Laura/
├── src/
│   ├── main.js          # Proceso principal: WhatsApp, SQLite, IPC, archivos
│   ├── preload.js        # Puente seguro (contextBridge) entre main y renderer
│   └── ui/
│       ├── index.html    # Estructura HTML (4 pantallas + modal)
│       ├── renderer.js   # Lógica de la interfaz
│       └── style.css     # Estilos con modo oscuro y animaciones
├── clientes.json         # Mapeo de teléfonos → empresas
├── electron-builder.yml  # Configuración del empaquetado
├── package.json          # Dependencias y scripts
└── assets/
    └── icon.ico          # Ícono de la aplicación
```

---

## Canales IPC

### Eventos (Main → Renderer)

| Canal        | Descripción                     |
|-------------|---------------------------------|
| `qr`         | URL del código QR en base64     |
| `status`     | Estado de conexión              |
| `new-file`   | Notificación de archivo nuevo   |

### Invocaciones (Renderer → Main)

| Método           | Descripción                         |
|-----------------|-------------------------------------|
| `openFolder`    | Abrir carpeta base en el explorador |
| `getBasePath`   | Obtener ruta de guardado actual     |
| `selectFolder`  | Selector nativo de carpeta          |
| `setBasePath`   | Cambiar ruta de guardado            |
| `openFile`      | Abrir un archivo                    |
| `showInFolder`  | Mostrar archivo en el explorador    |
| `getClients`    | Obtener mapeo de clientes           |
| `getContacts`   | Obtener contactos de WhatsApp       |
| `saveClients`   | Guardar mapeo de clientes           |
| `getConfig`     | Obtener configuración               |
| `setConfig`     | Guardar configuración               |
| `sweepMessages` | Iniciar barrido de mensajes         |
| `cancelSweep`   | Cancelar barrido en curso           |
| `cleanDB`       | Limpiar registros antiguos (>90d)   |
| `logout`        | Cerrar sesión y reiniciar           |

---

## Estados de conexión

| Estado            | Significado                         |
|------------------|-------------------------------------|
| `starting`       | Inicializando cliente               |
| `authenticated`  | Sesión autenticada                  |
| `ready`          | Cliente listo                       |
| `sweeping`       | Revisando mensajes anteriores       |
| `connected`      | Conectado y escuchando              |
| `disconnected`   | Desconectado (se muestra QR de nuevo) |
| `error-auth`     | Error de autenticación              |
| `error-init`     | Error al iniciar                    |

---

## Almacenamiento

| Elemento          | Ubicación                                          |
|------------------|----------------------------------------------------|
| Archivos descargados | `~/Documents/Clientes3D/{Empresa}/{Fecha}/`     |
| Base de datos     | `%APPDATA%/whatsapp-organizer/procesados.db`       |
| Configuración     | `%APPDATA%/whatsapp-organizer/config.json`         |
| Sesión WhatsApp   | `%APPDATA%/whatsapp-organizer/wwebjs_auth/`        |
| Cache             | `.wwebjs_cache/` (en la raíz del proyecto)         |

---

## Tech Stack

| Tecnología       | Versión   | Propósito                    |
|-----------------|-----------|------------------------------|
| Electron        | 42.4.1    | Ventana de escritorio        |
| whatsapp-web.js | 1.34.7    | Cliente de WhatsApp          |
| better-sqlite3  | 12.11.1   | Base de datos de dedup       |
| qrcode          | 1.5.4     | Generar QR en el cliente     |
| date-fns        | 4.4.0     | Utilidades de fecha          |
| electron-builder| 26.15.3   | Empaquetado para Windows     |
| pnpm            | 10.29.3   | Gestor de paquetes           |

---

## Autor

Creado por **Choklitos**.

```
Copyright © 2025 Cho
```

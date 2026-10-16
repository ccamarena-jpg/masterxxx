# MDMGC30 · Campus

Frontend Next.js para el proyecto existente `masterup` en Vercel. Conserva los componentes y estilos del Campus original.

## Desarrollo

Node.js 22.13 o posterior y pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm start
```

`vercel.json` selecciona Next.js y `pnpm run build`, sin directorio de salida estático. En el proyecto existente masterup, usar el preset Next.js y quitar cualquier override antiguo de salida o compilación de Vinext.

## Registros compartidos

`app/api/records/route.ts` reenvía GET y POST a https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site/api/records. Cloudflare D1 permanece en Sites como única fuente compartida. Vercel no necesita credenciales D1 ni conserva copias locales. El proxy mantiene las respuestas de validación, desactiva la caché y rechaza escrituras desde otros orígenes.

Los enlaces `/silabos/` se resuelven mediante una reescritura a la publicación original. Los PDF y datos personales de cumpleaños no se distribuyen en el código ni en el ZIP. Las listas de cumpleaños del frontend público están vacías.

El servicio depende de la disponibilidad del Campus original. Los archivos históricos de integración Sites no forman parte de la compilación Next.js y no deben usarse para desplegar este frontend sobre el backend original.

Producción prevista: https://masterup.vercel.app

## Integración con Google Sheets y Drive

Variables de entorno en Vercel (proyecto `masterup`). Ninguna URL ni clave va en el repositorio.

| Variable | Para qué |
| --- | --- |
| `CALENDAR_SHEET_CSV_URL` | Pestaña "Calendario y entregas" publicada como CSV. Sin ella se usa `lib/data.json`. |
| `COURSES_SHEET_CSV_URL` | Pestaña "Cursos" publicada como CSV. Columnas: `ID, Docente, Correo, Teléfono, Sílabo` (enlace de Drive). |
| `BIRTHDAYS_SHEET_CSV_URL` | Opcional. Pestaña "Cumpleaños" (`Nombre, Mes, Día, Mostrar en Campus`). |
| `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`, `DRIVE_FOLDER_ID` | Subida de PDF de tareas a una carpeta de Drive (límite 4 MB). Sin ellas el formulario pide pegar un enlace. |

Calendario para suscribirse: `/api/calendario/ics` (admite `?curso=ES` y `?id=…`). Los cumpleaños nunca se incluyen.

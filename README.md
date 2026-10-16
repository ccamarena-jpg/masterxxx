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

## Integración con Google Sheets y Drive (Apps Script)

El Sheet **no se publica ni se comparte**. Un Apps Script ligado al Sheet (corre como su dueño) lo lee y guarda los PDF en Drive. La web lo llama desde el servidor con un token secreto.

1. En el Sheet: **Extensiones → Apps Script**. Pega [docs/apps-script/Code.gs](docs/apps-script/Code.gs).
2. **Configuración del proyecto → Propiedades del script**: `TOKEN` (texto largo aleatorio), `FOLDER_ID` (carpeta de Drive para los PDF) y, opcional, `SHOW_BIRTHDAYS=true`.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como **Yo**, acceso **Cualquier persona**. Copia la URL `.../exec`. Sin el token, la URL no devuelve datos.
4. La URL del script ya está fija en `lib/sheet-server.ts` (`APPS_SCRIPT_URL` la reemplaza si hace falta). En Vercel (proyecto `masterup`, Production) crea solo `APPS_SCRIPT_TOKEN` (el mismo valor de `TOKEN`) y haz Redeploy. El token nunca va en el código.

Pestañas esperadas: `Calendario y entregas`, `Cursos` (con `Docente, Correo, Teléfono, Sílabo`) y `Cumpleaños`. Sin estas variables el sitio usa `lib/data.json`.

Calendario para suscribirse: `/api/calendario/ics` (admite `?curso=ES` y `?id=…`). Los cumpleaños nunca se incluyen. Subida de PDF: máximo 4 MB.

Sílabos: desde el detalle de cada curso se sube el PDF (máx. 4 MB); se guarda en Drive y el enlace se escribe solo en la columna `Sílabo` de la pestaña Cursos. Opcional: `SYLLABUS_UPLOAD_CODE` en Vercel exige un código de clase para subir o reemplazar sílabos. En el script, ejecuta una vez `prepararColumnasCursos()` para crear las columnas `Correo` y `Teléfono`.

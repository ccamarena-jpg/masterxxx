# MDMGC30 Campus

Plataforma informativa y colaborativa de la promoción 30: calendario, cursos y sílabos, casos y tareas compartidos.

## Desarrollo

Requiere Node.js 22.13 o superior. Ejecuta `pnpm install`, `pnpm dev` y `pnpm build`.

React y Vinext con Cloudflare Workers. Los registros compartidos usan D1, binding `DB`. Migraciones en `drizzle/`.

## Datos y documentos

Los PDF originales y la lista personal de cumpleaños no se incluyen en este repositorio público. Para una instalación independiente, agrega tus propios documentos en `public/silabos/` y los cumpleaños autorizados en `lib/data.json`. La publicación actual conserva sus documentos y datos.

## Sitio activo

https://mdmgc30-campus.claudia-camarena-vel.chatgpt.site

Este repositorio conserva el código fuente. La publicación y la base de datos siguen administradas por Sites.

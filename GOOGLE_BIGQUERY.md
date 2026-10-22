# Google Patents BigQuery — configuración

La interfaz llama a `/api/patents` (Cloudflare Pages Functions). En desarrollo local con `vite`, esta ruta no existe; para probarla en Cloudflare utiliza un despliegue Preview o Wrangler Pages Dev.

1. En Google Cloud, habilita BigQuery API en el proyecto que facturará las consultas.
2. Crea una cuenta de servicio con permiso `BigQuery Job User` **en tu proyecto de facturación** y acceso de lectura a la tabla pública `patents-public-data.patents.publications`. Descarga su JSON de credenciales. Nunca lo subas a GitHub.
3. En Cloudflare Pages → Settings → Variables and Secrets, crea los **Secrets** `GOOGLE_SERVICE_ACCOUNT_JSON` (contenido JSON íntegro, incluida private_key) y `BIGQUERY_PROJECT_ID` (ID de tu proyecto, p. ej. `adept-cycle-435916-p3`). Opcional: `PATENTS_API_KEY` para exigir una clave desde la interfaz.
4. Configura presupuesto y alertas de facturación en Google Cloud. La función fija `maximumBytesBilled` en 10 GiB por consulta; si se excede, BigQuery rechazará la consulta. **Esto no es un presupuesto mensual ni una garantía de gratuidad.**
5. Haz `git add .`, `git commit -m "Integrar Google Patents BigQuery"`, `git push`. Cloudflare publicará el frontend y detectará `functions/api/patents.ts`.

**Seguridad**: para uso público, no dejes el endpoint abierto. Define `PATENTS_API_KEY` como mínimo y considera Cloudflare Access, cuotas, rate limiting y autenticación real por usuario. La clave opcional de la interfaz no equivale a un sistema de cuentas.

**Alcance**: se recuperan hasta 50 publicaciones por consulta; los conceptos se combinan con AND y los términos con OR. La búsqueda usa expresiones regulares seguras derivadas de palabras clave y `*`. No interpreta sintaxis avanzada de Espacenet. La clasificación `cl` se busca en IPC/CPC. Las reivindicaciones y descripción completas no están disponibles para todas las jurisdicciones. Las coincidencias no constituyen una evaluación automática de novedad. No hay paginación ni clasificación por relevancia en esta primera integración.

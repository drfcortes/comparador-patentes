# BigQuery: recuperación puntual de reivindicaciones

La aplicación **no realiza búsquedas de texto en Google Patents**. La pestaña Comparación envía un número de publicación a `/api/patents` para intentar recuperar sus reivindicaciones desde `patents-public-data.patents.publications`.

Variables de Cloudflare Pages Production:
- `BIGQUERY_PROJECT_ID`: ID del proyecto de Google Cloud.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Secret con JSON completo de la cuenta de servicio.
- `PATENTS_API_KEY`: Secret opcional, muy recomendable para restringir consultas; introducirlo en el campo de clave de la interfaz.

**Seguridad de costos:** la función ejecuta primero un `dryRun` y rechaza consultas estimadas por encima de 10 GiB; la consulta real también usa `maximumBytesBilled` de 10 GiB. **Un filtro por número de publicación no garantiza una consulta barata**: la tabla puede exigir leer muchos datos aun cuando devuelva una sola patente. En ese caso la interfaz indica usar la importación manual. No aumentar el límite sin evaluar costo y presupuesto. El límite es por consulta, no mensual.

**Cobertura:** las reivindicaciones de muchas publicaciones fuera de EE. UU. no están presentes en este conjunto público. Comprueba número, fecha, reivindicaciones y versión de la publicación contra la fuente original antes de fundamentar un examen.

La función ya no expone el diagnóstico temporal de variables ni acepta estrategias de búsqueda por palabras.

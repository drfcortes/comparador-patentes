/** Recuperación puntual de reivindicaciones por número de publicación. No realiza búsquedas de texto. */
interface Env { GOOGLE_SERVICE_ACCOUNT_JSON?: string; BIGQUERY_PROJECT_ID?: string; PATENTS_API_KEY?: string }
type BqResponse = { jobComplete?: boolean; rows?: { f: { v: unknown }[] }[]; errors?: { message: string }[]; error?: { message: string }; totalBytesProcessed?: string; totalBytesBilled?: string }
const LIMIT_BYTES = 10 * 1024 ** 3
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const encode = (text: string) => b64url(new TextEncoder().encode(text))
async function accessToken(raw: string): Promise<string> {
  const account = JSON.parse(raw) as { client_email: string; private_key: string }
  if (!account.client_email || !account.private_key) throw new Error('Cuenta de servicio incompleta')
  const now = Math.floor(Date.now() / 1000)
  const payload = encode(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/bigquery', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3500 }))
  const unsigned = `${encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${payload}`
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const binary = atob(pem)
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(binary, c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)))
  const assertion = `${unsigned}.${b64url(signature)}`
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) })
  const data = await response.json() as { access_token?: string; error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'No se pudo autenticar con Google')
  return data.access_token
}
function normalize(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.BIGQUERY_PROJECT_ID) return json({ error: 'Faltan las variables de BigQuery en Cloudflare.' }, 503)
    if (env.PATENTS_API_KEY && request.headers.get('X-Patents-Key') !== env.PATENTS_API_KEY) return json({ error: 'Clave de acceso incorrecta.' }, 401)
    if (Number(request.headers.get('content-length') || 0) > 4000) return json({ error: 'Solicitud demasiado grande.' }, 413)
    const input = await request.json() as { numbers?: unknown }
    if (!Array.isArray(input.numbers) || input.numbers.length < 1 || input.numbers.length > 4 || input.numbers.some(x => typeof x !== 'string' || x.length > 50 || !/^[A-Za-z0-9\s-]+$/.test(x))) return json({ error: 'Indica entre 1 y 4 números de publicación válidos.' }, 400)
    const numbers = [...new Set((input.numbers as string[]).map(normalize))]
    if (numbers.some(x => x.length < 5 || x.length > 25)) return json({ error: 'Número de publicación inválido.' }, 400)
    const sql = `SELECT publication_number, publication_date, country_code, (SELECT x.text FROM UNNEST(title_localized) x ORDER BY IF(x.language='en',0,1) LIMIT 1) AS title, (SELECT x.text FROM UNNEST(claims_localized) x ORDER BY IF(x.language='en',0,1) LIMIT 1) AS claims FROM \`patents-public-data.patents.publications\` WHERE REGEXP_REPLACE(UPPER(publication_number), r'[^A-Z0-9]', '') IN UNNEST(@numbers) LIMIT 4`
    const token = await accessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(env.BIGQUERY_PROJECT_ID)}/queries`
    const common = { query: sql, useLegacySql: false, parameterMode: 'NAMED', queryParameters: [{ name: 'numbers', parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } }, parameterValue: { arrayValues: numbers.map(value => ({ value })) } }], maximumBytesBilled: String(LIMIT_BYTES), timeoutMs: 15000, maxResults: 4, location: 'US' }
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const dryResponse = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...common, dryRun: true }) })
    const dry = await dryResponse.json() as BqResponse
    if (!dryResponse.ok || dry.error || dry.errors?.length) return json({ error: dry.error?.message || dry.errors?.[0]?.message || 'No se pudo estimar la consulta.' }, 502)
    const estimated = Number(dry.totalBytesProcessed || 0)
    if (!Number.isFinite(estimated) || estimated > LIMIT_BYTES) return json({ error: 'La consulta supera el límite seguro de 10 GiB. BigQuery no permite recuperar estas reivindicaciones económicamente con esta tabla; utiliza la importación manual.', estimatedBytes: dry.totalBytesProcessed || null, manualFallback: true }, 422)
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(common) })
    const data = await response.json() as BqResponse
    if (!response.ok || data.errors?.length || data.error) return json({ error: data.error?.message || data.errors?.[0]?.message || 'Error de BigQuery.' }, 502)
    if (!data.jobComplete) return json({ error: 'La consulta excedió el tiempo permitido. Puedes importar las reivindicaciones manualmente.', manualFallback: true }, 504)
    const results = (data.rows || []).map(row => ({ publication_number: String(row.f[0]?.v || ''), publication_date: row.f[1]?.v, country_code: row.f[2]?.v, title: String(row.f[3]?.v || ''), claims: String(row.f[4]?.v || '') }))
    return json({ results, missing: numbers.filter(n => !results.some(r => normalize(r.publication_number) === n)), bytesProcessed: data.totalBytesProcessed || null })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 500) }
}

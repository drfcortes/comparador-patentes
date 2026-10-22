interface Env { GOOGLE_SERVICE_ACCOUNT_JSON: string; BIGQUERY_PROJECT_ID: string; PATENTS_API_KEY?: string }
type Concept = { concept: string; field: string; terms: string[]; enabled: boolean; required: boolean }
type Parameter = { name: string; parameterType: { type: string }; parameterValue: { value: string } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const encode = (text: string) => b64url(new TextEncoder().encode(text))
async function accessToken(raw: string): Promise<string> {
  const account = JSON.parse(raw) as { client_email: string; private_key: string; token_uri?: string }
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
const fieldSQL: Record<string, string> = {
  ti: 'title_localized', ab: 'abstract_localized', claims: 'claims_localized', desc: 'description_localized',
  ctxt: 'title_localized,abstract_localized,claims_localized',
  ftxt: 'title_localized,abstract_localized,claims_localized,description_localized',
  nftxt: 'title_localized,abstract_localized,claims_localized,description_localized',
}
function searchSQL(concepts: Concept[]) {
  const parameters: Parameter[] = []
  const predicates: string[] = []
  for (const [i, concept] of concepts.entries()) {
    const alternatives: string[] = []
    for (const [j, term] of concept.terms.entries()) {
      const name = `p${i}_${j}`
      const regex = term.trim().split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      parameters.push({ name, parameterType: { type: 'STRING' }, parameterValue: { value: regex } })
      const pattern = `@${name}`
      if (['cl', 'ipc', 'cpc'].includes(concept.field)) {
        const columns = concept.field === 'cl' ? ['ipc', 'cpc'] : [concept.field]
        alternatives.push(`(${columns.map(col => `EXISTS (SELECT 1 FROM UNNEST(p.${col}) AS x WHERE REGEXP_CONTAINS(LOWER(x.code), LOWER(${pattern})))`).join(' OR ')})`)
      } else {
        const columns = fieldSQL[concept.field]?.split(',')
        if (!columns) throw new Error(`Campo no admitido: ${concept.field}`)
        alternatives.push(`(${columns.map(col => `EXISTS (SELECT 1 FROM UNNEST(p.${col}) AS x WHERE REGEXP_CONTAINS(LOWER(x.text), LOWER(${pattern})))`).join(' OR ')})`)
      }
    }
    predicates.push(`(${alternatives.join(' OR ')})`)
  }
  return { sql: `SELECT p.publication_number, p.publication_date, p.family_id, p.country_code, (SELECT x.text FROM UNNEST(p.title_localized) x ORDER BY IF(x.language='en',0,1) LIMIT 1) title, (SELECT x.text FROM UNNEST(p.abstract_localized) x ORDER BY IF(x.language='en',0,1) LIMIT 1) abstract, (SELECT x.text FROM UNNEST(p.claims_localized) x ORDER BY IF(x.language='en',0,1) LIMIT 1) claims, ARRAY(SELECT DISTINCT x.code FROM UNNEST(p.ipc) x LIMIT 12) ipc, ARRAY(SELECT DISTINCT x.code FROM UNNEST(p.cpc) x LIMIT 12) cpc FROM \`patents-public-data.patents.publications\` p WHERE ${predicates.join(' AND ')} ORDER BY p.publication_date DESC LIMIT 50`, parameters }
}
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.BIGQUERY_PROJECT_ID) return json({ error: 'Configura GOOGLE_SERVICE_ACCOUNT_JSON y BIGQUERY_PROJECT_ID en Cloudflare.' }, 503)
    if (env.PATENTS_API_KEY && request.headers.get('X-Patents-Key') !== env.PATENTS_API_KEY) return json({ error: 'Acceso no autorizado.' }, 401)
    if (Number(request.headers.get('content-length') || 0) > 24000) return json({ error: 'Solicitud demasiado grande.' }, 413)
    const input = await request.json() as { concepts?: Concept[] }
    if (!Array.isArray(input.concepts)) return json({ error: 'Falta la estrategia.' }, 400)
    const concepts = input.concepts.filter(c => c.enabled && c.terms?.some(t => t.trim()))
    if (!concepts.length || concepts.length > 10 || concepts.some(c => !Array.isArray(c.terms) || c.terms.length > 12 || c.terms.some(t => typeof t !== 'string' || t.length > 100 || !t.trim()) || !Object.hasOwn(fieldSQL, c.field) && !['cl', 'ipc', 'cpc'].includes(c.field))) return json({ error: 'Estrategia inválida: máximo 10 conceptos, 12 términos por concepto y 100 caracteres por término.' }, 400)
    const { sql, parameters } = searchSQL(concepts)
    const token = await accessToken(env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(env.BIGQUERY_PROJECT_ID)}/queries`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, useLegacySql: false, parameterMode: 'NAMED', queryParameters: parameters, maximumBytesBilled: '10737418240', timeoutMs: 20000, maxResults: 50, location: 'US' }) })
    const data = await response.json() as { jobComplete?: boolean; rows?: { f: { v: unknown }[] }[]; errors?: { message: string }[]; error?: { message: string }; totalBytesProcessed?: string }
    if (!response.ok || data.errors?.length || data.error) return json({ error: data.error?.message || data.errors?.[0]?.message || 'Error de BigQuery. Revisa permisos y presupuesto.' }, 502)
    if (!data.jobComplete) return json({ error: 'La consulta tardó demasiado. Reduce los conceptos o acota la búsqueda.' }, 504)
    const results = (data.rows || []).map(row => {
      const v = row.f.map(x => x.v)
      const arr = (item: unknown) => { const obj = item as { v?: { f?: { v: string }[] }[] } | null; return obj?.v?.map(x => x.f?.[0]?.v).filter(Boolean) || [] }
      return { publication_number: v[0], publication_date: v[1], family_id: v[2], country_code: v[3], title: v[4], abstract: v[5], claims: v[6], ipc: arr(v[7]), cpc: arr(v[8]) }
    })
    return json({ results, bytesProcessed: data.totalBytesProcessed || null })
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, 500) }
}

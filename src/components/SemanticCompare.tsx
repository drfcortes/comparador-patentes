import { useEffect, useState } from 'react'
import type { SearchConcept } from '../utils/strategy'

type Doc = { id: string; number: string; claims: string }
type Match = { doc: string; number: string; concept: string; score: number; evidence: string }
const STORE = 'comparador-documentos-semanticos-v1'
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

function chunks(text: string): string[] {
  const parts = text.split(/\n\s*(?=\d+[.\)]\s)|(?<=\.)\s+(?=\d+[.\)]\s)/).map(s => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const part of parts) {
    if (part.length <= 900) out.push(part)
    else for (let i = 0; i < part.length; i += 700) out.push(part.slice(i, i + 900))
  }
  return out.slice(0, 100)
}
function cosine(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2 }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}
export function SemanticCompare({ concepts }: { concepts: SearchConcept[] }) {
  const [docs, setDocs] = useState<Doc[]>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v.filter((d): d is Doc => !!d && typeof d.id === 'string' && typeof d.number === 'string' && typeof d.claims === 'string') : [] } catch { return [] }
  })
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [error, setError] = useState('')
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(docs)) } catch { /* almacenamiento lleno */ } }, [docs])
  const active = concepts.filter(c => c.enabled && c.terms.some(t => t.trim()) && !['ipc','cpc','cl'].includes(c.field))
  function update(id: string, patch: Partial<Doc>) { setDocs(ds => ds.map(d => d.id === id ? { ...d, ...patch } : d)) }
  async function compare() {
    setBusy(true); setError(''); setMatches([])
    try {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowRemoteModels = true
      setProgress('Descargando o cargando modelo multilingüe (la primera vez puede tardar)…')
      const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm' })
      const cache = new Map<string, number[]>()
      async function vector(s: string): Promise<number[]> {
        const previous = cache.get(s); if (previous) return previous
        const tensor = await extractor(s, { pooling: 'mean', normalize: true })
        const v = Array.from(tensor.data as Float32Array)
        cache.set(s, v); return v
      }
      const output: Match[] = []
      for (const c of active) {
        const terms = c.terms.map(t => t.trim()).filter(Boolean)
        const queries = [c.concept, ...terms].filter(Boolean)
        const qVectors = await Promise.all(queries.map(vector))
        for (const d of docs.filter(d => d.claims.trim())) {
          let best = { score: -1, evidence: '' }
          for (const passage of chunks(d.claims)) {
            setProgress(`Comparando ${c.concept} con ${d.number || d.id}…`)
            const v = await vector(passage)
            const score = Math.max(...qVectors.map(q => cosine(q, v)))
            if (score > best.score) best = { score, evidence: passage }
          }
          if (best.evidence) output.push({ doc: d.id, number: d.number, concept: c.concept, ...best })
        }
      }
      setMatches(output.sort((a, b) => b.score - a.score))
      setProgress('Comparación terminada')
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible cargar el modelo semántico.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">Comparación semántica de reivindicaciones</h2><p className="mt-2 text-sm text-slate-600">Compara los conceptos de tu estrategia con las reivindicaciones de D1, D2, etc., incluso si utilizan palabras diferentes. El modelo se ejecuta en este navegador, sin API de IA de pago. Los documentos se guardan localmente.</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-cyan-700 px-4 py-2 text-white" onClick={() => setDocs(ds => [...ds, { id: crypto.randomUUID(), number: '', claims: '' }])}>Agregar documento D</button><span className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{active.length} conceptos activos · {docs.length} documentos</span></div>
    {docs.map((d, i) => <div key={d.id} className="rounded-lg border p-4"><div className="mb-2 flex items-center gap-3"><strong>D{i + 1}</strong><input aria-label={`Número de patente D${i + 1}`} className="min-w-0 flex-1 rounded border p-2" placeholder="US3056665A, WO..." value={d.number} onChange={e => update(d.id, { number: e.target.value })}/><button type="button" className="text-sm text-red-700" onClick={() => setDocs(ds => ds.filter(x => x.id !== d.id))}>Eliminar</button></div><textarea aria-label={`Reivindicaciones D${i + 1}`} className="w-full rounded border p-3 text-sm" rows={5} placeholder="Pega aquí las reivindicaciones del documento…" value={d.claims} onChange={e => update(d.id, { claims: e.target.value })}/><input type="file" accept=".txt,.md" className="mt-2 text-xs" onChange={async e => { const file = e.target.files?.[0]; if (file) update(d.id, { claims: await file.text() }); e.target.value = '' }}/></div>)}
    <button type="button" className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white disabled:opacity-40" disabled={busy || !active.length || !docs.some(d => d.claims.trim())} onClick={() => void compare()}>{busy ? 'Analizando…' : 'Comparar semánticamente'}</button>
    {progress && <p role="status" className="text-sm text-slate-600">{progress}</p>}{error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!!matches.length && <div className="space-y-3"><h3 className="text-lg font-semibold">Posibles correspondencias técnicas</h3><p className="text-xs text-slate-500">La puntuación representa cercanía semántica, no porcentaje de novedad ni prueba de equivalencia técnica. Revisa cada fragmento antes de decidir.</p>{matches.map((m, i) => <article key={`${m.doc}-${m.concept}-${i}`} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{m.number || 'Documento sin número'} · {m.concept}</strong><span className="text-sm">Similitud: {(m.score * 100).toFixed(1)}%</span></div><p className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{m.evidence}</p></article>)}</div>}
  </div>
}

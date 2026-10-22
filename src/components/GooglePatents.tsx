import { useState } from 'react'
import type { SearchConcept } from '../utils/strategy'

type Patent = { publication_number: string; publication_date: number | string; family_id: string | null; country_code: string; title: string | null; abstract: string | null; claims: string | null; ipc: string[]; cpc: string[] }
export function GooglePatents({ concepts, validationError }: { concepts: SearchConcept[]; validationError: string | null }) {
  const [results, setResults] = useState<Patent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const [key, setKey] = useState('')
  const enabled = concepts.filter(c => c.enabled && c.terms.some(t => t.trim()))
  async function search() {
    setBusy(true); setError(''); setResults([]); setSearched(false)
    try {
      const response = await fetch('/api/patents', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Patents-Key': key } : {}) }, body: JSON.stringify({ concepts: enabled.map(c => ({ ...c, terms: c.terms.map(t => t.trim()).filter(Boolean) })) }) })
      const data = await response.json() as { results?: Patent[]; error?: string }
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`)
      setResults(data.results || []); setSearched(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión') }
    finally { setBusy(false) }
  }
  return <section className="mt-8 border-t border-slate-200 pt-6">
    <h3 className="text-lg font-semibold">Google Patents · BigQuery</h3>
    <p className="mt-2 text-sm text-slate-600">Busca publicaciones sin salir de la aplicación. Las alternativas de cada concepto se combinan con OR y los conceptos con AND. Los asteriscos funcionan como comodines. La búsqueda se realiza en los campos elegidos; el texto completo de reivindicaciones y descripción tiene cobertura limitada, principalmente US.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">Clave de acceso (solo si el administrador la configuró)<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Opcional" /></label>
      <button type="button" disabled={busy || !!validationError || !enabled.length || enabled.length > 10 || enabled.some(c => c.terms.filter(t => t.trim()).length > 12)} onClick={() => void search()} className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{busy ? 'Consultando BigQuery…' : 'Buscar en Google Patents'}</button>
    </div>
    {enabled.length > 10 && <p className="mt-2 text-sm text-amber-700">Selecciona como máximo 10 conceptos.</p>}
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {searched && <p className="mt-4 text-sm font-medium">{results.length} publicaciones recuperadas (máximo 50 por consulta; no es el total de coincidencias).</p>}
    <div className="mt-4 space-y-3">{results.map(p => {
      const open = expanded.includes(p.publication_number)
      const number = p.publication_number.replace(/-/g, '')
      return <article key={p.publication_number} className="rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{p.publication_number}</h4><span className="text-xs text-slate-500">{String(p.publication_date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1')}</span></div>
        <p className="mt-1 text-sm font-medium">{p.title || 'Sin título disponible'}</p>
        <p className="mt-1 text-xs text-slate-500">Familia: {p.family_id || 'No disponible'} · IPC: {(p.ipc || []).join(', ') || '—'} · CPC: {(p.cpc || []).join(', ') || '—'}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm"><button type="button" onClick={() => setExpanded(prev => open ? prev.filter(x => x !== p.publication_number) : [...prev, p.publication_number])} className="font-semibold text-cyan-700">{open ? 'Ocultar texto' : 'Ver resumen y reivindicaciones'}</button><a href={`https://patents.google.com/patent/${encodeURIComponent(number)}`} target="_blank" rel="noopener noreferrer" className="text-cyan-700 underline">Ver publicación original</a></div>
        {open && <div className="mt-3 space-y-3 text-sm"><div><strong>Resumen</strong><p className="mt-1 whitespace-pre-wrap">{p.abstract || 'No disponible'}</p></div><div><strong>Reivindicaciones</strong><p className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{p.claims || 'No disponibles en esta fuente para esta publicación.'}</p></div></div>}
      </article>
    })}</div>
  </section>
}

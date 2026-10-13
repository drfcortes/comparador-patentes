
import * as XLSX from 'xlsx'

export type SearchField =
  | 'ti' | 'ab' | 'claims' | 'desc'
  | 'ctxt' | 'ftxt' | 'nftxt'
  | 'cl' | 'ipc' | 'cpc'

export interface SearchConcept {
  id: string
  concept: string
  field: SearchField
  terms: string[]
  required: boolean
  weight: number
  core: boolean
  enabled: boolean
}

const fields: SearchField[] = [
  'ti', 'ab', 'claims', 'desc', 'ctxt',
  'ftxt', 'nftxt', 'cl', 'ipc', 'cpc',
]

const normalize = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const header = (value: unknown): string =>
  normalize(value).replace(/[^a-z0-9]+/g, ' ').trim()

const isYes = (value: unknown): boolean =>
  ['si', 'yes', 'true', '1'].includes(normalize(value))

export async function loadStrategy(
  file: File,
): Promise<SearchConcept[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: '' },
    )

    for (let rowIndex = 0; rowIndex < Math.min(40, rows.length); rowIndex++) {
      const headings = rows[rowIndex].map(header)
      const conceptCol = headings.findIndex(h =>
        ['concepto', 'concept', 'caracteristica'].includes(h),
      )
      const fieldCol = headings.findIndex(h =>
        ['campo', 'field'].includes(h),
      )
      const termCols = headings
        .map((h, i) =>
          /^(palabra clave|keyword|termino)/.test(h) ? i : -1,
        )
        .filter(i => i >= 0)

      if (conceptCol < 0 || termCols.length === 0) continue

      const column = (name: string) => headings.indexOf(name)
      const concepts: SearchConcept[] = []

      for (let i = rowIndex + 1; i < rows.length; i++) {
        const row = rows[i]
        const cell = (index: number): string =>
          index < 0 ? '' : String(row[index] ?? '').trim()

        const terms = [...new Set(
          termCols.map(cell).filter(Boolean),
        )]

        if (!terms.length) continue

        let field = normalize(cell(fieldCol) || 'nftxt')
        field = ({
          title: 'ti',
          abstract: 'ab',
          description: 'desc',
        } as Record<string, string>)[field] ?? field

        if (!fields.includes(field as SearchField)) {
          throw new Error(
            `Fila ${i + 1}: campo no reconocido: ${field}`,
          )
        }

        const rawWeight = cell(column('peso')) || '1'
        const weight = Number(rawWeight.replace(',', '.'))

        if (!Number.isFinite(weight) || weight <= 0 || weight >= 10000) {
          throw new Error(`Fila ${i + 1}: peso no válido`)
        }

        for (const term of terms) {
          if (/["\r\n]/.test(term)) {
            throw new Error(`Fila ${i + 1}: término no válido`)
          }
          if (term.includes('*')) {
            const prefix = term.split('*')[0].replace(/[^\p{L}\p{N}_]/gu, '')
            if (prefix.length < 3) {
              throw new Error(
                `Fila ${i + 1}: se requieren tres caracteres antes de *`,
              )
            }
          }
        }

        concepts.push({
          id: `${sheetName}-${i}`,
          concept: cell(conceptCol) || `Concepto ${concepts.length + 1}`,
          field: field as SearchField,
          terms,
          required: isYes(cell(column('obligatorio'))),
          weight,
          core: isYes(cell(column('nucleo'))),
          enabled: !['no', 'false', '0'].includes(
            normalize(cell(column('incluir'))),
          ),
        })
      }

      if (!concepts.length) {
        throw new Error('La tabla no contiene palabras clave')
      }

      return concepts
    }
  }

  throw new Error(
    'No se encontraron columnas Concepto y Palabra clave 1, 2, etc.',
  )
}

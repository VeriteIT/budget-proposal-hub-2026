'use client'

import { useState, useEffect, useRef } from 'react'

interface LangFields { en: string; si: string; ta: string }

interface AdminProposal {
  fileId: string
  title: LangFields
  summary: LangFields
  category: LangFields
  costLKR: LangFields
  badge: string
  thumbUrl: string
  added_date: string
  vectorized: boolean
  auto_generated: boolean
  hasPdf: boolean
  pdfUrl: string
}

type EditableField = 'title' | 'summary' | 'category' | 'costLKR'
type Lang = 'en' | 'si' | 'ta'

// Placeholder strings written for language versions that have no real content
const PLACEHOLDERS = new Set([
  'Unknown', 'No summary available', 'No Costing Available', 'Uncategorized',
  'No data available', 'Not available', 'N/A',
])

// Returns the field's value in `lang`, falling back to en/si/ta (in that order)
// if the requested language has no real content (empty or a placeholder string).
function localizedField(fields: LangFields | undefined, lang: Lang): string {
  if (!fields) return ''
  for (const l of [lang, 'en', 'si', 'ta'] as Lang[]) {
    const v = (fields[l] ?? '').trim()
    if (v && !PLACEHOLDERS.has(v)) return v
  }
  return ''
}

const TERMINAL_STATUSES = new Set([
  'COMPLETED', 'FAILED', 'CANCELED', 'CRASHED', 'SYSTEM_FAILURE', 'TIMED_OUT', 'EXPIRED',
])

interface RunStatus<T = unknown> {
  status: string
  output?: T
  error?: { message?: string }
}

// Polls a Trigger.dev run until it reaches a terminal state.
async function pollRun<T = unknown>(runId: string, intervalMs = 2000): Promise<RunStatus<T>> {
  while (true) {
    const res  = await fetch(`/api/admin/runs/${runId}`)
    const data = await res.json() as RunStatus<T>
    if (TERMINAL_STATUSES.has(data.status)) return data
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

const BADGES = ['New', 'Public', 'VR', '']

const C = {
  bg:       '#f1f5f9',
  card:     '#ffffff',
  border:   '#e2e8f0',
  blue:     '#2563eb',
  blueLt:   '#eff6ff',
  green:    '#059669',
  greenLt:  '#ecfdf5',
  red:      '#dc2626',
  redLt:    '#fef2f2',
  amber:    '#b45309',
  amberLt:  '#fffbeb',
  text:     '#0f172a',
  muted:    '#64748b',
  inputBg:  '#f8fafc',
}

const field: React.CSSProperties = {
  padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8,
  fontSize: 14, background: C.inputBg, color: C.text, width: '100%', boxSizing: 'border-box',
}
const fieldTA: React.CSSProperties = { ...field, resize: 'vertical' as const }

function Chip({ ok, warn, label }: { ok?: boolean; warn?: boolean; label: string }) {
  const bg  = warn ? C.amberLt : ok ? C.greenLt : C.redLt
  const col = warn ? C.amber   : ok ? C.green   : C.red
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
      background: bg, color: col, whiteSpace: 'nowrap' as const }}>
      {label}
    </span>
  )
}

function BadgeChip({ badge }: { badge: string }) {
  if (!badge) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>
  const colors: Record<string, [string, string]> = {
    VR:     ['#dbeafe', '#1d4ed8'],
    Public: ['#f3e8ff', '#7c3aed'],
    New:    ['#dcfce7', '#15803d'],
  }
  const [bg, col] = colors[badge] ?? ['#f1f5f9', '#475569']
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: bg, color: col }}>
      {badge}
    </span>
  )
}

function Btn({
  children, onClick, type = 'button', variant = 'primary', size = 'md',
  disabled, title, style: extra,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'success' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  style?: React.CSSProperties
}) {
  const bg: Record<string, string> = {
    primary: C.blue, success: C.green, danger: C.red, ghost: 'transparent', outline: 'transparent',
  }
  const col: Record<string, string> = {
    primary: '#fff', success: '#fff', danger: '#fff', ghost: C.muted, outline: C.blue,
  }
  const border: Record<string, string> = {
    primary: 'none', success: 'none', danger: 'none', ghost: 'none', outline: `1px solid ${C.blue}`,
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: size === 'sm' ? '5px 12px' : '9px 20px',
        fontSize: size === 'sm' ? 12 : 14,
        fontWeight: 500,
        background: bg[variant],
        color: col[variant],
        border: border[variant],
        borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity .15s',
        whiteSpace: 'nowrap' as const,
        ...extra,
      }}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 5 }}>{children}</label>
}

function SectionCard({ children, style: extra }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: 28, marginBottom: 28, boxShadow: '0 1px 3px rgba(0,0,0,.06)', ...extra,
    }}>
      {children}
    </div>
  )
}

export default function AdminPage() {
  const [proposals, setProposals]       = useState<AdminProposal[]>([])
  const [loading, setLoading]           = useState(true)
  const [uploading, setUploading]       = useState(false)
  const [uploadMsg, setUploadMsg]       = useState<{ text: string; ok: boolean } | null>(null)
  const [badge, setBadge]               = useState('New')
  const [uploadLang, setUploadLang]     = useState<Lang>('en')
  const [uploadMeta, setUploadMeta]     = useState({
    title:    { en: '', si: '', ta: '' },
    summary:  { en: '', si: '', ta: '' },
    category: { en: '', si: '', ta: '' },
    costLKR:  { en: '', si: '', ta: '' },
  })
  const [editId, setEditId]             = useState<string | null>(null)
  const [editForm, setEditForm]         = useState<AdminProposal | null>(null)
  const [editLang, setEditLang]         = useState<Lang>('en')
  const [saving, setSaving]             = useState(false)
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [vectorizing, setVectorizing]   = useState<Set<string>>(new Set())
  const [vectorizeMsg, setVectorizeMsg] = useState<Record<string, string>>({})
  const [bulkOp, setBulkOp]             = useState<'refit' | 'index-all' | 'clear' | null>(null)
  const [bulkMsg, setBulkMsg]           = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [adminLang, setAdminLang]       = useState<Lang>('en')
  const [categoryMap, setCategoryMap]   = useState<Record<string, { color: string; hex: string }>>({})
  const [newCatName, setNewCatName]     = useState('')
  const [newCatHex, setNewCatHex]       = useState('#3b82f6')
  const [catMsg, setCatMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [catSaving, setCatSaving]       = useState(false)
  const [deleteCatName, setDeleteCatName] = useState<string | null>(null)
  const [catDeleting, setCatDeleting]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbFileRef = useRef<HTMLInputElement>(null)
  const editThumbFileRef = useRef<HTMLInputElement>(null)
  const [thumbUploading, setThumbUploading] = useState(false)
  const [thumbUploadMsg, setThumbUploadMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function fetchCategories() {
    try {
      const res  = await fetch('/api/admin/categories')
      const data = await res.json() as Record<string, { color: string; hex: string }>
      setCategoryMap(data)
    } catch { /* ignore */ }
  }

  async function handleAddCategory() {
    const name = newCatName.trim()
    if (!name) return
    setCatSaving(true); setCatMsg(null)
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hex: newCatHex, color: name.toLowerCase().replace(/\s+/g, '-') }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setCatMsg({ text: `Added "${name}"`, ok: true })
      setNewCatName(''); setNewCatHex('#3b82f6')
      await fetchCategories()
    } catch (err) {
      setCatMsg({ text: err instanceof Error ? err.message : 'Failed', ok: false })
    } finally { setCatSaving(false) }
  }

  async function handleDeleteCategory() {
    if (!deleteCatName) return
    setCatDeleting(true)
    try {
      await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deleteCatName }),
      })
      await fetchCategories()
      setDeleteCatName(null)
    } catch { /* ignore */ } finally { setCatDeleting(false) }
  }

  async function fetchProposals() {
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/proposals')
      const data = await res.json() as { proposals: AdminProposal[] }
      setProposals(data.proposals ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProposals(); fetchCategories() }, [])

  function setMeta(field: keyof typeof uploadMeta, lang: Lang, value: string) {
    setUploadMeta((m) => ({ ...m, [field]: { ...m[field], [lang]: value } }))
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const titleFilled = uploadMeta.title[uploadLang].trim().length > 0
    setUploading(true)
    setUploadMsg({ text: titleFilled ? 'Embedding — skipping Gemini extraction…' : 'Processing with Gemini (~30 s)…', ok: true })
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('badge', badge)
      const thumbFile = thumbFileRef.current?.files?.[0]
      if (thumbFile) fd.append('thumbnail', thumbFile)
      if (titleFilled) {
        // Only send the active language's fields — other langs stay blank
        for (const [k, v] of Object.entries(uploadMeta)) {
          for (const [lang, val] of Object.entries(v)) {
            fd.append(`${k}_${lang}`, lang === uploadLang ? (val as string) : '')
          }
        }
      }
      const res  = await fetch('/api/admin/proposals', { method: 'POST', body: fd })
      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      setUploadMsg({ text: 'Ingesting in background — parsing PDF, embedding, indexing…', ok: true })
      const run = await pollRun<{ fileId: string; entry: { title: LangFields; category: LangFields } }>(data.runId!)
      if (run.status !== 'COMPLETED' || !run.output) {
        throw new Error(run.error?.message ?? `Ingestion ${run.status.toLowerCase()}`)
      }

      const title = run.output.entry.title.en || run.output.entry.title.si || run.output.entry.title.ta
      setUploadMsg({ text: `Ingested: "${title}"`, ok: true })
      if (fileRef.current) fileRef.current.value = ''
      setUploadMeta({ title: { en: '', si: '', ta: '' }, summary: { en: '', si: '', ta: '' }, category: { en: '', si: '', ta: '' }, costLKR: { en: '', si: '', ta: '' } })
      await fetchProposals()
    } catch (err) {
      setUploadMsg({ text: err instanceof Error ? err.message : 'Upload failed', ok: false })
    } finally {
      setUploading(false)
    }
  }

  function startEdit(p: AdminProposal) {
    setEditId(p.fileId)
    setEditLang('en')
    setEditForm(JSON.parse(JSON.stringify(p)) as AdminProposal)
    setThumbUploadMsg(null)
    if (editThumbFileRef.current) editThumbFileRef.current.value = ''
  }

  async function handleThumbnailUpload() {
    if (!editId) return
    const file = editThumbFileRef.current?.files?.[0]
    if (!file) return
    setThumbUploading(true)
    setThumbUploadMsg(null)
    try {
      const fd = new FormData()
      fd.append('thumbnail', file)
      const res  = await fetch(`/api/admin/proposals/${encodeURIComponent(editId)}/thumbnail`, { method: 'POST', body: fd })
      const data = await res.json() as { thumbUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Thumbnail upload failed')
      setEditForm((f) => f ? { ...f, thumbUrl: data.thumbUrl ?? f.thumbUrl } : f)
      setThumbUploadMsg({ text: 'Thumbnail updated', ok: true })
      await fetchProposals()
    } catch (err) {
      setThumbUploadMsg({ text: err instanceof Error ? err.message : 'Thumbnail upload failed', ok: false })
    } finally {
      setThumbUploading(false)
    }
  }

  function updateField(field: EditableField, lang: Lang, value: string) {
    setEditForm((f) => f ? { ...f, [field]: { ...f[field], [lang]: value } } : f)
  }

  async function handleSave() {
    if (!editId || !editForm) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/proposals/${encodeURIComponent(editId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editForm.title, summary: editForm.summary, category: editForm.category, costLKR: editForm.costLKR, badge: editForm.badge }),
      })
      if (!res.ok) throw new Error('Save failed')
      setEditId(null)
      await fetchProposals()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleVectorize(fileId: string) {
    setVectorizing((v) => new Set(v).add(fileId))
    setVectorizeMsg((m) => ({ ...m, [fileId]: 'Embedding…' }))
    try {
      const res  = await fetch(`/api/admin/proposals/${encodeURIComponent(fileId)}/vectorize`, { method: 'POST' })
      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed')

      const run = await pollRun<{ fileId: string; chunks: number }>(data.runId!)
      if (run.status !== 'COMPLETED' || !run.output) {
        throw new Error(run.error?.message ?? `Vectorization ${run.status.toLowerCase()}`)
      }
      setVectorizeMsg((m) => ({ ...m, [fileId]: `✓ ${run.output!.chunks} chunks` }))
      await fetchProposals()
    } catch (err) {
      setVectorizeMsg((m) => ({ ...m, [fileId]: `✗ ${err instanceof Error ? err.message : 'Error'}` }))
    } finally {
      setVectorizing((v) => { const n = new Set(v); n.delete(fileId); return n })
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/proposals/${encodeURIComponent(deleteId)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteId(null)
      await fetchProposals()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function handleRefitBM25() {
    setBulkOp('refit'); setBulkMsg({ text: 'Refitting BM25 on metadata + chunk corpus…', ok: true })
    try {
      const res  = await fetch('/api/admin/refit-bm25', { method: 'POST' })
      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Refit failed')

      const run = await pollRun<{ vocabSize: number; metaDocs: number; chunkDocs: number }>(data.runId!)
      if (run.status !== 'COMPLETED' || !run.output) {
        throw new Error(run.error?.message ?? `Refit ${run.status.toLowerCase()}`)
      }
      const out = run.output
      setBulkMsg({ text: `BM25 refit — ${out.vocabSize.toLocaleString()} terms, ${out.metaDocs} metadata + ${out.chunkDocs} chunk docs`, ok: true })
    } catch (err) {
      setBulkMsg({ text: err instanceof Error ? err.message : 'Refit failed', ok: false })
    } finally { setBulkOp(null) }
  }

  async function handleIndexAll() {
    setBulkOp('index-all'); setBulkMsg({ text: 'Indexing all unvectorized proposals — this may take several minutes…', ok: true })
    try {
      const res  = await fetch('/api/admin/index-all', { method: 'POST' })
      const data = await res.json() as { runId?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Index-all failed')

      const run = await pollRun<{ indexed: number; skipped: number; errors: string[] }>(data.runId!, 5000)
      if (run.status !== 'COMPLETED' || !run.output) {
        throw new Error(run.error?.message ?? `Index-all ${run.status.toLowerCase()}`)
      }
      const out = run.output
      const errLine = out.errors.length ? ` • ${out.errors.length} error(s)` : ''
      setBulkMsg({ text: `Done — ${out.indexed} indexed, ${out.skipped} skipped${errLine}`, ok: true })
      await fetchProposals()
    } catch (err) {
      setBulkMsg({ text: err instanceof Error ? err.message : 'Index-all failed', ok: false })
    } finally { setBulkOp(null) }
  }

  async function handleClearVectors() {
    setConfirmClear(false); setBulkOp('clear'); setBulkMsg({ text: 'Clearing all vectors from Pinecone…', ok: true })
    try {
      const res  = await fetch('/api/admin/clear-vectors', { method: 'POST' })
      const data = await res.json() as { reset?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Clear failed')
      setBulkMsg({ text: `Cleared — ${data.reset} proposals marked as unindexed`, ok: true })
      await fetchProposals()
    } catch (err) {
      setBulkMsg({ text: err instanceof Error ? err.message : 'Clear failed', ok: false })
    } finally { setBulkOp(null) }
  }

  const stats = {
    total:      proposals.length,
    vectorized: proposals.filter((p) => p.vectorized).length,
    missing:    proposals.filter((p) => !p.hasPdf).length,
  }

  // Categories for the proposals table/edit modal — keyed by adminLang
  const localisedCategories = Array.from(
    new Set(proposals.map((p) => p.category[adminLang]).filter(Boolean))
  ).sort()

  // Categories for the upload form dropdown — keyed by uploadLang
  const uploadCategories = Array.from(
    new Set(proposals.map((p) => p.category[uploadLang]).filter(Boolean))
  ).sort()

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: C.bg, minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0 }}>
              Budget Proposals
            </h1>
            <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>
              Manage, index, and update proposals in Pinecone
            </p>
          </div>
          {/* Language switcher */}
          <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 4 }}>
            {([['en', 'English'], ['si', 'සිංහල'], ['ta', 'தமிழ்']] as const).map(([l, label]) => (
              <button key={l} type="button" onClick={() => setAdminLang(l)}
                style={{
                  padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: adminLang === l ? C.blue : 'transparent',
                  color: adminLang === l ? '#fff' : C.muted,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total proposals', value: stats.total,      color: C.blue  },
            { label: 'Indexed in Pinecone', value: stats.vectorized, color: C.green },
            { label: 'Missing PDF file',   value: stats.missing,  color: stats.missing > 0 ? C.amber : C.green },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Bulk operations ── */}
        <SectionCard>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 6 }}>Index Management</h2>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            New documents uploaded below are indexed automatically. Use these for bulk operations.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Btn variant="primary" disabled={!!bulkOp} onClick={handleIndexAll}>
              {bulkOp === 'index-all' ? 'Indexing…' : 'Index All Unindexed'}
            </Btn>
            <Btn variant="outline" disabled={!!bulkOp} onClick={handleRefitBM25}>
              {bulkOp === 'refit' ? 'Refitting…' : 'Refit BM25'}
            </Btn>
            <Btn variant="danger" disabled={!!bulkOp} onClick={() => setConfirmClear(true)}
              style={{ marginLeft: 'auto' }}>
              Clear All Vectors
            </Btn>
          </div>
          {bulkMsg && (
            <p style={{ marginTop: 14, fontSize: 13, fontWeight: 500, color: bulkMsg.ok ? C.green : C.red }}>
              {bulkMsg.ok ? '✓ ' : '✗ '}{bulkMsg.text}
            </p>
          )}
        </SectionCard>

        {/* ── Categories card ── */}
        <SectionCard>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 6 }}>Manage Categories</h2>
          <p style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
            Categories defined here appear in all upload dropdowns and determine card header colours.
          </p>

          {/* Existing categories */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {Object.entries(categoryMap).map(([name, def]) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '7px 12px',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  background: def.hex, border: `1px solid rgba(0,0,0,.12)`,
                }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{name}</span>
                <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{def.hex}</span>
                <button
                  type="button"
                  onClick={() => setDeleteCatName(name)}
                  title="Delete category"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                >✕</button>
              </div>
            ))}
            {Object.keys(categoryMap).length === 0 && (
              <span style={{ fontSize: 13, color: C.muted }}>No categories defined yet.</span>
            )}
          </div>

          {/* Add new category */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <Label>Category Name</Label>
              <input
                type="text" style={{ ...field, width: 220 }}
                placeholder="e.g. Social Welfare"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
            </div>
            <div>
              <Label>Colour</Label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="color" value={newCatHex}
                  onChange={(e) => setNewCatHex(e.target.value)}
                  style={{ width: 48, height: 38, padding: 2, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', background: C.inputBg }}
                />
                <span style={{ fontSize: 12, color: C.muted, fontFamily: 'monospace' }}>{newCatHex}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <Btn variant="primary" disabled={catSaving || !newCatName.trim()} onClick={handleAddCategory}>
                {catSaving ? 'Adding…' : '+ Add Category'}
              </Btn>
              {catMsg && (
                <span style={{ fontSize: 13, fontWeight: 500, color: catMsg.ok ? C.green : C.red }}>
                  {catMsg.ok ? '✓ ' : '✗ '}{catMsg.text}
                </span>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── Upload card ── */}
        <SectionCard>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, marginBottom: 22 }}>
            Add New Proposal
          </h2>
          <form onSubmit={handleUpload}>

            {/* Step 1: file + badge */}
            <div style={{ background: C.bg, borderRadius: 10, padding: '16px 18px', marginBottom: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>
                Step 1 — PDF &amp; Badge
              </p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Label>PDF file <span style={{ color: C.red }}>*</span></Label>
                  <input ref={fileRef} type="file" accept=".pdf" required
                    style={{ ...field, padding: '7px 10px', cursor: 'pointer' }} />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <Label>Thumbnail image (optional)</Label>
                  <input ref={thumbFileRef} type="file" accept="image/*"
                    style={{ ...field, padding: '7px 10px', cursor: 'pointer' }} />
                </div>
                <div>
                  <Label>Badge</Label>
                  <select value={badge} onChange={(e) => setBadge(e.target.value)} style={{ ...field, width: 120 }}>
                    {BADGES.map((b) => <option key={b} value={b}>{b || '(none)'}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Step 2: metadata — one language per upload */}
            <div style={{ background: C.bg, borderRadius: 10, padding: '16px 18px', marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Step 2 — Metadata
                </p>
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 99,
                  background: uploadMeta.title[uploadLang].trim() ? C.blueLt : C.amberLt,
                  color: uploadMeta.title[uploadLang].trim() ? C.blue : C.amber, fontWeight: 600,
                }}>
                  {uploadMeta.title[uploadLang].trim() ? 'Manual mode' : 'Auto-extract with Gemini'}
                </span>
              </div>

              {/* Language selector */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: C.card, borderRadius: 8, padding: 4, border: `1px solid ${C.border}` }}>
                {([['en', 'English'], ['si', 'Sinhala'], ['ta', 'Tamil']] as const).map(([l, label]) => (
                  <button key={l} type="button" onClick={() => setUploadLang(l)}
                    style={{
                      flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600,
                      background: uploadLang === l ? C.blue : 'transparent',
                      color: uploadLang === l ? '#fff' : C.muted,
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
                Each PDF is uploaded once per language. The same proposal may be uploaded 3 times (EN, SI, TA) as separate entries.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <Label>Title</Label>
                  <input type="text" style={field}
                    placeholder={uploadLang === 'en' ? 'e.g. Proposal to reform EPF taxation' : uploadLang === 'si' ? 'e.g. EPF බදු ප්‍රතිසංස්කරණ යෝජනාව' : 'e.g. EPF வரி சீர்திருத்த முன்மொழிவு'}
                    value={uploadMeta.title[uploadLang]}
                    onChange={(e) => setMeta('title', uploadLang, e.target.value)} />
                </div>
                <div>
                  <Label>Category</Label>
                  <select style={field} value={uploadMeta.category[uploadLang]}
                    onChange={(e) => setMeta('category', uploadLang, e.target.value)}>
                    <option value="">— auto-detect —</option>
                    {uploadCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <Label>Summary</Label>
                <textarea rows={2} style={fieldTA}
                  placeholder={uploadLang === 'en' ? 'Two-sentence summary of the proposal' : 'යෝජනාවේ කෙටි සාරාංශය…'}
                  value={uploadMeta.summary[uploadLang]}
                  onChange={(e) => setMeta('summary', uploadLang, e.target.value)} />
              </div>

              <div>
                <Label>Cost (LKR)</Label>
                <input type="text" style={{ ...field, width: 280 }}
                  placeholder="e.g. Cost = LKR 2.5 billion"
                  value={uploadMeta.costLKR[uploadLang]}
                  onChange={(e) => setMeta('costLKR', uploadLang, e.target.value)} />
              </div>
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Btn type="submit" disabled={uploading}>
                {uploading ? 'Processing…' : 'Upload & Index'}
              </Btn>
              {uploadMsg && (
                <span style={{ fontSize: 14, color: uploadMsg.ok ? C.green : C.red, fontWeight: 500 }}>
                  {uploadMsg.ok ? '✓ ' : '✗ '}{uploadMsg.text}
                </span>
              )}
            </div>
          </form>
        </SectionCard>

        {/* ── Proposals table ── */}
        <SectionCard>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>
              Proposals
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: C.muted }}>
                {stats.vectorized}/{stats.total} indexed
              </span>
            </h2>
            <Btn variant="outline" size="sm" onClick={fetchProposals}>Refresh</Btn>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>Loading proposals…</div>
          ) : proposals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted }}>No proposals yet.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                    {['Title', 'Category', 'Badge', 'Date', 'PDF', 'Indexed', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12,
                        fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '.04em',
                        whiteSpace: 'nowrap', background: C.bg }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p, i) => (
                    <tr key={p.fileId} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.card : '#fafbfc' }}>
                      <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                        <div style={{ fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={localizedField(p.title, adminLang) || p.fileId}>
                          {localizedField(p.title, adminLang) || <span style={{ color: C.muted, fontStyle: 'italic' }}>Untitled</span>}
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}
                          title={p.fileId}>
                          {p.fileId}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                        {localizedField(p.category, adminLang) || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <BadgeChip badge={p.badge} />
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: C.muted, fontSize: 12 }}>
                        {p.added_date ? p.added_date.split('T')[0] : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {p.hasPdf ? (
                          <a href={p.pdfUrl || `/assets/pdfs/${p.fileId}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, color: C.blue, fontWeight: 500, textDecoration: 'none' }}>
                            View ↗
                          </a>
                        ) : (
                          <Chip warn label="Missing" />
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <Chip ok={p.vectorized} label={p.vectorized ? 'Indexed' : 'Not indexed'} />
                          {vectorizeMsg[p.fileId] && (
                            <span style={{ fontSize: 11, color: vectorizeMsg[p.fileId].startsWith('✓') ? C.green : C.red }}>
                              {vectorizeMsg[p.fileId]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {!p.vectorized && (
                            <Btn
                              variant="success" size="sm"
                              disabled={vectorizing.has(p.fileId) || !p.hasPdf}
                              title={!p.hasPdf ? 'PDF file missing — upload the PDF first' : 'Add to Pinecone'}
                              onClick={() => handleVectorize(p.fileId)}
                            >
                              {vectorizing.has(p.fileId) ? '…' : 'Index'}
                            </Btn>
                          )}
                          <Btn variant="outline" size="sm" onClick={() => startEdit(p)}>Edit</Btn>
                          <Btn variant="danger" size="sm" onClick={() => setDeleteId(p.fileId)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── Edit modal ── */}
      {editId && editForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex',
          alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', zIndex: 1000, overflowY: 'auto' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: '100%', maxWidth: 680, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Edit Proposal</h2>
              <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: C.muted, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 20, wordBreak: 'break-all' }}>{editId}</p>

            {/* Thumbnail */}
            <div style={{ marginBottom: 24 }}>
              <Label>Thumbnail image</Label>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {editForm.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editForm.thumbUrl.startsWith('http') ? editForm.thumbUrl : `/${editForm.thumbUrl}`}
                    alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }}
                  />
                )}
                <input ref={editThumbFileRef} type="file" accept="image/*"
                  style={{ ...field, padding: '7px 10px', cursor: 'pointer', width: 'auto', flex: 1, minWidth: 180 }} />
                <Btn variant="outline" size="sm" disabled={thumbUploading} onClick={handleThumbnailUpload}>
                  {thumbUploading ? 'Uploading…' : 'Upload'}
                </Btn>
              </div>
              {thumbUploadMsg && (
                <span style={{ fontSize: 12, fontWeight: 500, color: thumbUploadMsg.ok ? C.green : C.red, display: 'block', marginTop: 6 }}>
                  {thumbUploadMsg.ok ? '✓ ' : '✗ '}{thumbUploadMsg.text}
                </span>
              )}
            </div>

            {/* Language tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: C.bg, borderRadius: 8, padding: 4 }}>
              {(['en', 'si', 'ta'] as const).map((lang) => (
                <button key={lang} type="button" onClick={() => setEditLang(lang)}
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: editLang === lang ? C.card : 'transparent',
                    color: editLang === lang ? C.blue : C.muted,
                    boxShadow: editLang === lang ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  }}>
                  {lang === 'en' ? '🇬🇧 English' : lang === 'si' ? '🇱🇰 Sinhala' : '🇮🇳 Tamil'}
                </button>
              ))}
            </div>

            {/* Fields for selected language */}
            {(['title', 'summary', 'category', 'costLKR'] as const).map((f) => (
              <div key={f} style={{ marginBottom: 16 }}>
                <Label>{f === 'costLKR' ? 'Cost (LKR)' : f.charAt(0).toUpperCase() + f.slice(1)}</Label>
                {f === 'summary' ? (
                  <textarea rows={3} style={fieldTA} value={editForm[f][editLang]}
                    onChange={(e) => updateField(f, editLang, e.target.value)} />
                ) : f === 'category' ? (
                  <select style={field} value={editForm[f][editLang]}
                    onChange={(e) => updateField(f, editLang, e.target.value)}>
                    <option value="">— select —</option>
                    {Array.from(new Set(proposals.map((p) => p.category[editLang]).filter(Boolean))).sort()
                      .map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <input type="text" style={field} value={editForm[f][editLang]}
                    onChange={(e) => updateField(f, editLang, e.target.value)} />
                )}
              </div>
            ))}

            <div style={{ marginBottom: 24 }}>
              <Label>Badge</Label>
              <select style={{ ...field, width: 140 }} value={editForm.badge}
                onChange={(e) => setEditForm((f) => f ? { ...f, badge: e.target.value } : f)}>
                {BADGES.map((b) => <option key={b} value={b}>{b || '(none)'}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
              <Btn variant="success" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '24px 16px', zIndex: 1000 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
              🗑️
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete Proposal?</h2>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 8, lineHeight: 1.6 }}>
              This permanently removes the entry from <strong>dynamic_metadata.json</strong> and all its vectors from <strong>Pinecone</strong>.
            </p>
            <p style={{ fontSize: 12, color: C.muted, wordBreak: 'break-all', marginBottom: 24,
              background: C.bg, padding: '8px 10px', borderRadius: 6 }}>
              {deleteId}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Btn>
              <Btn variant="danger" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete category confirmation ── */}
      {deleteCatName && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '24px 16px', zIndex: 1000 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
              🗑️
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Delete Category?</h2>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 8, lineHeight: 1.6 }}>
              This removes the category and its colour from <strong>categories.json</strong>. Proposals using this category will lose their card colour until reassigned.
            </p>
            <p style={{ fontSize: 12, color: C.muted, wordBreak: 'break-all', marginBottom: 24,
              background: C.bg, padding: '8px 10px', borderRadius: 6 }}>
              {deleteCatName}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setDeleteCatName(null)}>Cancel</Btn>
              <Btn variant="danger" disabled={catDeleting} onClick={handleDeleteCategory}>
                {catDeleting ? 'Deleting…' : 'Delete'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear vectors confirmation ── */}
      {confirmClear && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '24px 16px', zIndex: 1000 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.redLt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Clear All Vectors?</h2>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
              This will delete <strong>all vectors from Pinecone</strong> and mark every proposal as unindexed.
              Metadata in <strong>dynamic_metadata.json</strong> is kept. You will need to re-index afterwards.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Btn>
              <Btn variant="danger" onClick={handleClearVectors}>Clear All Vectors</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

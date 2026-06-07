'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

type ProductForm = {
  name: string
  description: string
  category: string
  price: string
  stock: string
  unit: string
  reorder_point: string
}

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [form, setForm] = useState<ProductForm>({
    name: '', description: '', category: '',
    price: '', stock: '', unit: 'pcs', reorder_point: '5',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.product) {
          const p = data.product
          setForm({
            name:          p.name          ?? '',
            description:   p.description   ?? '',
            category:      p.category      ?? '',
            price:         String(p.price  ?? ''),
            stock:         String(p.stock  ?? ''),
            unit:          p.unit          ?? 'pcs',
            reorder_point: String(p.reorder_point ?? 5),
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nama produk wajib diisi'
    if (!form.price || Number(form.price) <= 0) errs.price = 'Harga harus lebih dari 0'
    return errs
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          form.name.trim(),
          description:   form.description.trim() || null,
          category:      form.category.trim() || null,
          price:         Number(form.price),
          stock:         Number(form.stock),
          unit:          form.unit.trim() || 'pcs',
          reorder_point: Number(form.reorder_point) || 5,
        }),
      })
      if (res.ok) {
        router.push('/dashboard/products')
        router.refresh()
      } else {
        const data = await res.json()
        setErrors({ submit: data.error ?? 'Gagal menyimpan' })
        setSaving(false)
      }
    } catch {
      setErrors({ submit: 'Terjadi kesalahan jaringan' })
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <p className="text-sm text-gray-400">Memuat produk...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
        >
          ←
        </button>
        <h1 className="text-base font-semibold text-gray-800">Edit Produk</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto pb-24">
        <div className="bg-white rounded-2xl mx-3 mt-3 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Informasi Produk</p>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <input
              type="text" maxLength={60}
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })) }}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition ${errors.name ? 'border-red-400' : 'border-gray-200'}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Deskripsi</label>
            <textarea
              rows={3} maxLength={200}
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Kategori</label>
            <input
              type="text" maxLength={40}
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl mx-3 mt-3 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Harga & Stok</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Harga <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                <input
                  type="number" min={0}
                  value={form.price}
                  onChange={e => { setForm(p => ({ ...p, price: e.target.value })); setErrors(p => ({ ...p, price: '' })) }}
                  className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition ${errors.price ? 'border-red-400' : 'border-gray-200'}`}
                />
              </div>
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Stok</label>
              <input
                type="number" min={0}
                value={form.stock}
                onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Satuan</label>
              <input
                type="text" maxLength={10}
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Reorder Point</label>
              <input
                type="number" min={0}
                value={form.reorder_point}
                onChange={e => setForm(p => ({ ...p, reorder_point: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition"
              />
            </div>
          </div>
        </div>

        {errors.submit && (
          <p className="mx-3 mt-2 text-xs text-red-500">{errors.submit}</p>
        )}

        <div className="mx-3 mt-4 space-y-2">
          <button
            type="submit" disabled={saving}
            className="w-full bg-[var(--color-primary)] hover:opacity-90 active:scale-[0.99] text-white font-semibold py-3.5 rounded-2xl text-sm transition disabled:opacity-60"
          >
            {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
          <button
            type="button" onClick={() => router.back()}
            className="w-full bg-white border border-gray-200 text-gray-500 font-medium py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  )
}

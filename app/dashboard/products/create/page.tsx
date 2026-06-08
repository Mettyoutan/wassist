
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['Makanan', 'Minuman', 'Snack', 'Paket', 'Lainnya']

type Status = 'aman' | 'menipis' | 'habis'

export default function CreateProduct() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    price: '',
    stock: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

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

    setLoading(true)
    try {
      let image_url = ""
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const uploadRes = await fetch("/api/products/upload-image", {
          method: "POST",
          body: fd,
        })
        if (uploadRes.ok) {
          const { url } = await uploadRes.json()
          image_url = url
        }
      }

      await fetch("/api/products", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        form.name.trim(),
          description: form.description.trim() || null,
          price:       Number(form.price),
          stock:       Number(form.stock) || 0,
          category:    form.category || null,
          image_url,
        }),
      })
      router.push('/dashboard/products')
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  const statusOptions: { value: Status; label: string; style: string }[] = [
    { value: 'aman', label: 'Aman', style: 'bg-green-50 border-green-400 text-green-700' },
    { value: 'menipis', label: 'Menipis', style: 'bg-red-50 border-red-400 text-yellow-700' },
    { value: 'habis', label: 'Habis', style: 'bg-gray-100 border-gray-400 text-red-600' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition"
        >
          ←
        </button>
        <h1 className="text-base font-semibold text-gray-800">Tambah Produk Baru</h1>
      </div>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto pb-24">

        {/* Upload Foto */}
        <div className="bg-white rounded-2xl mx-3 mt-3 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Foto Produk</p>
          <label className="block cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
            {preview ? (
              <div className="relative rounded-xl overflow-hidden h-40">
                <img src={preview} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-sm font-medium">
                  Ganti foto
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl">📷</div>
                <p className="text-sm text-gray-500 text-center">
                  <span className="font-medium text-gray-700">Tap untuk upload foto</span><br />
                  JPG, PNG — maks. 5MB
                </p>
              </div>
            )}
          </label>
        </div>

        {/* Informasi Produk */}
        <div className="bg-white rounded-2xl mx-3 mt-3 p-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Informasi Produk</p>

          {/* Nama */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Nama Produk <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={60}
              placeholder="cth. Ayam Penyet Spesial"
              value={form.name}
              onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: '' })) }}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition placeholder:text-gray-300 ${errors.name ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
            />
            <div className="flex justify-between mt-1">
              {errors.name ? <p className="text-xs text-red-500">{errors.name}</p> : <span />}
              <p className="text-xs text-gray-300">{form.name.length}/60</p>
            </div>
          </div>

          {/* Deskripsi */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Deskripsi</label>
            <textarea
              rows={3}
              maxLength={200}
              placeholder="Tambahkan deskripsi produk..."
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition placeholder:text-gray-300 resize-none"
            />
            <p className="text-xs text-gray-300 text-right mt-1">{form.description.length}/200</p>
          </div>

          {/* Kategori */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, category: cat }))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition font-medium ${
                    form.category === cat
                      ? 'bg-blue-100 border-blue-400 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Harga & Stok */}
        <div className="bg-white rounded-2xl mx-3 mt-3 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Harga & Stok</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Harga <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.price}
                  onChange={e => { setForm(p => ({ ...p, price: e.target.value })); setErrors(p => ({ ...p, price: '' })) }}
                  className={`w-full rounded-xl border pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition ${errors.price ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                />
              </div>
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Stok Awal</label>
              <input
                type="number"
                min={0}
                placeholder="0"
                value={form.stock}
                onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-gray-50 text-gray-800 outline-none focus:bg-white focus:border-blue-400 transition"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="mx-3 mt-4 space-y-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold py-3.5 rounded-2xl text-sm transition disabled:opacity-60"
          >
            {loading ? 'Menyimpan...' : '+ Simpan Produk'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="w-full bg-white border border-gray-200 text-gray-500 font-medium py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  )
}
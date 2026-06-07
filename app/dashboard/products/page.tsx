"use client";

import { useEffect, useState } from "react";
import StatusBadge from "@/components/dashboard/StatusBadge";

interface Product {
  id: string;
  name: string;
  stock: number;
  price: number;
  unit: string;
  soldToday: number;
  image: string;
  status: "habis" | "menipis" | "aman";
  reorder_point?: number;
  category?: string;
  description?: string;
}

export default function StockManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stok" | "katalog">("stok");
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    stock: "",
    unit: "pcs",
    reorder_point: "5",
    image_url: "",
    category: "",
    description: "",
  });

  async function fetchProducts() {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (err) {
      console.error("[Products page] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      price: "",
      stock: "",
      unit: "pcs",
      reorder_point: "5",
      image_url: "",
      category: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: String(product.price),
      stock: String(product.stock),
      unit: product.unit,
      reorder_point: String(product.reorder_point ?? 5),
      image_url: product.image,
      category: product.category ?? "",
      description: product.description ?? "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus produk ini dari katalog aktif?")) return;
    
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
      } else {
        alert("Gagal menghapus produk");
      }
    } catch (err) {
      console.error("[Products CRUD] delete error:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const meta_retailer_id = formData.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    
    const payload = {
      name: formData.name,
      price: Number(formData.price),
      stock: Number(formData.stock),
      unit: formData.unit,
      reorder_point: Number(formData.reorder_point),
      image_url: formData.image_url,
      category: formData.category,
      description: formData.description,
      meta_retailer_id: meta_retailer_id,
    };

    try {
      if (editingProduct) {
        // Update
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setShowModal(false);
          fetchProducts();
        } else {
          alert("Gagal memperbarui produk");
        }
      } else {
        // Create
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          setShowModal(false);
          fetchProducts();
        } else {
          alert("Gagal membuat produk baru");
        }
      }
    } catch (err) {
      console.error("[Products CRUD] submit error:", err);
    }
  };

  const alertProducts = products.filter((p) => p.status === "habis" || p.status === "menipis");

  return (
    <div className="pb-3 position-relative">
      {/* Tab Switcher */}
      <div className="card border-0 shadow-sm mb-3" style={{ borderRadius: "14px" }}>
        <div className="card-body p-2 d-flex gap-2">
          <button
            onClick={() => setActiveTab("stok")}
            className={`btn btn-sm flex-grow-1 rounded-pill py-2 fw-semibold ${
              activeTab === "stok" ? "btn-dark" : "btn-light text-muted"
            }`}
            style={{ fontSize: "12px" }}
          >
            ⚠️ Peringatan Stok ({alertProducts.length})
          </button>
          <button
            onClick={() => setActiveTab("katalog")}
            className={`btn btn-sm flex-grow-1 rounded-pill py-2 fw-semibold ${
              activeTab === "katalog" ? "btn-dark" : "btn-light text-muted"
            }`}
            style={{ fontSize: "12px" }}
          >
            📦 Kelola Katalog ({products.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border spinner-border-sm text-secondary" role="status" />
        </div>
      ) : activeTab === "stok" ? (
        /* TAB 1: STOCK ALERTS */
        <div className="card border-0 shadow-sm" style={{ borderRadius: "14px" }}>
          <div className="card-body p-3">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="fw-bold text-dark" style={{ fontSize: "14px" }}>Pemberitahuan Stok</span>
              <span className="badge bg-warning text-dark px-2.5 py-1" style={{ fontSize: "10px", borderRadius: "20px" }}>
                {alertProducts.length} Produk Kritis
              </span>
            </div>
            {alertProducts.length === 0 ? (
              <div className="text-center py-5 text-muted" style={{ fontSize: "13px" }}>
                <i className="bi bi-shield-check-fill text-success fs-2 d-block mb-2"></i>
                Stok semua produk aman!
              </div>
            ) : (
              <div className="row g-2">
                {alertProducts.map((item) => {
                  const isHabis = item.status === "habis";
                  return (
                    <div key={item.id} className="col-6">
                      <div 
                        className="rounded-3 p-2.5 text-center position-relative h-100" 
                        style={{ 
                          background: isHabis ? "var(--color-status-danger-bg)" : "var(--color-status-pending-bg)", 
                          fontSize: "11px",
                          border: `1px solid ${isHabis ? "var(--color-status-danger-text)22" : "var(--color-status-pending-text)22"}`
                        }}
                      >
                        {item.image ? (
                          <img 
                            src={item.image} 
                            alt={item.name} 
                            style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px" }}
                          />
                        ) : (
                          <div 
                            style={{ 
                              width: "48px", 
                              height: "48px", 
                              borderRadius: "8px", 
                              background: "#e9ecef", 
                              display: "flex", 
                              alignItems: "center", 
                              justifyContent: "center", 
                              fontSize: "24px",
                              margin: "0 auto"
                            }}
                          >
                            👗
                          </div>
                        )}
                        <div className="fw-bold text-dark mt-2" style={{ fontSize: "11px", lineHeight: "1.2" }}>
                          {item.name}
                        </div>
                        
                        <div className="mt-1">
                          {isHabis ? (
                            <span className="badge bg-danger rounded-pill px-2" style={{ fontSize: "9px" }}>Habis</span>
                          ) : (
                            <span 
                              className="badge rounded-pill px-2 fw-semibold" 
                              style={{ 
                                fontSize: "9px",
                                background: "var(--color-warning)",
                                color: "white"
                              }}
                            >
                              Sisa {item.stock} {item.unit}
                            </span>
                          )}
                        </div>

                        <div className="text-muted mt-2" style={{ fontSize: "9px" }}>
                          Terjual {item.soldToday} {item.unit} hari ini
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: KATALOG MANAGEMENT */
        <div className="d-flex flex-column gap-3">
          {/* Floating/Add button */}
          <button 
            className="btn btn-success w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2"
            style={{ 
              borderRadius: "12px", 
              background: "var(--color-primary)", 
              border: "none", 
              fontSize: "13px",
              boxShadow: "0 4px 12px var(--color-shadow)"
            }}
            onClick={openAddModal}
          >
            <i className="bi bi-plus-circle-fill"></i>
            Tambah Produk Baru
          </button>

          {/* Catalog items */}
          <div className="d-flex flex-column gap-2">
            {products.length === 0 ? (
              <div className="text-center py-5 text-muted bg-white rounded-3 shadow-sm" style={{ fontSize: "13px" }}>
                Belum ada produk di katalog.
              </div>
            ) : (
              products.map((p) => (
                <div 
                  key={p.id} 
                  className="card border-0 shadow-sm" 
                  style={{ borderRadius: "12px", boxShadow: "0 2px 8px var(--color-shadow)" }}
                >
                  <div className="card-body p-2.5 d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-3">
                      {p.image ? (
                        <img 
                          src={p.image} 
                          alt={p.name} 
                          style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "8px" }}
                        />
                      ) : (
                        <div 
                          className="bg-light d-flex align-items-center justify-content-center fs-4" 
                          style={{ width: "48px", height: "48px", borderRadius: "8px" }}
                        >
                          👗
                        </div>
                      )}
                      <div>
                        <div className="fw-bold text-dark" style={{ fontSize: "13px" }}>{p.name}</div>
                        <div className="text-muted" style={{ fontSize: "11px" }}>
                          Rp {p.price.toLocaleString("id-ID")} • Sisa {p.stock} {p.unit}
                        </div>
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="d-flex gap-1.5">
                      <button 
                        className="btn btn-sm btn-light p-1.5 rounded-3 d-flex align-items-center text-primary"
                        onClick={() => openEditModal(p)}
                        aria-label="Edit produk"
                      >
                        <i className="bi bi-pencil-square" style={{ fontSize: "14px" }}></i>
                      </button>
                      <button 
                        className="btn btn-sm btn-light p-1.5 rounded-3 d-flex align-items-center text-danger"
                        onClick={() => handleDelete(p.id)}
                        aria-label="Hapus produk"
                      >
                        <i className="bi bi-trash" style={{ fontSize: "14px" }}></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* FORM MODAL OVERLAY */}
      {showModal && (
        <div 
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
          style={{ 
            background: "rgba(0,0,0,0.5)", 
            zIndex: 1100, 
            padding: "16px" 
          }}
          onClick={() => setShowModal(false)}
        >
          <div 
            className="card border-0 shadow-lg w-100"
            style={{ 
              maxWidth: "390px", 
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)" 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-body p-3.5">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="fw-bold mb-0 text-dark">
                  {editingProduct ? "Edit Detail Produk" : "Tambah Produk Baru"}
                </h6>
                <button 
                  className="btn p-0 border-0 bg-transparent"
                  onClick={() => setShowModal(false)}
                >
                  <i className="bi bi-x-lg text-muted fs-6"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="d-flex flex-column gap-2.5">
                <div>
                  <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Nama Produk *</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{ fontSize: "12px", borderRadius: "8px" }}
                  />
                </div>

                <div>
                  <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Deskripsi Produk *</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm"
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ fontSize: "12px", borderRadius: "8px" }}
                  />
                </div>

                <div>
                  <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Kategori Produk *</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    style={{ fontSize: "12px", borderRadius: "8px" }}
                  />
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Harga (Rp) *</label>
                    <input 
                      type="number" 
                      className="form-control form-control-sm"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      style={{ fontSize: "12px", borderRadius: "8px" }}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Stok *</label>
                    <input 
                      type="number" 
                      step="any"
                      className="form-control form-control-sm"
                      required
                      value={formData.stock}
                      onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                      style={{ fontSize: "12px", borderRadius: "8px" }}
                    />
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Satuan *</label>
                    <select 
                      className="form-select form-select-sm"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      style={{ fontSize: "12px", borderRadius: "8px" }}
                    >
                      <option value="pcs">pcs</option>
                      <option value="porsi">porsi</option>
                      <option value="kg">kg</option>
                      <option value="L">L</option>
                      <option value="box">box</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Min. Stok Alert *</label>
                    <input 
                      type="number" 
                      className="form-control form-control-sm"
                      required
                      value={formData.reorder_point}
                      onChange={(e) => setFormData({ ...formData, reorder_point: e.target.value })}
                      style={{ fontSize: "12px", borderRadius: "8px" }}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label text-muted mb-1" style={{ fontSize: "10px" }}>Link Gambar Produk</label>
                  <input 
                    type="text" 
                    className="form-control form-control-sm"
                    placeholder="https://example.com/image.png"
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    style={{ fontSize: "12px", borderRadius: "8px" }}
                  />
                </div>

                <div className="d-flex gap-2 mt-3">
                  <button 
                    type="submit" 
                    className="btn btn-success flex-grow-1 fw-semibold py-2"
                    style={{ 
                      borderRadius: "8px", 
                      fontSize: "12px",
                      background: "var(--color-primary)",
                      border: "none"
                    }}
                  >
                    Simpan Produk
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-outline-secondary flex-grow-1 fw-semibold py-2"
                    onClick={() => setShowModal(false)}
                    style={{ borderRadius: "8px", fontSize: "12px" }}
                  >
                    Batal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

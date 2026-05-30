// Saat session.state === "awaiting_confirmation" dan pesan adalah "ya"
// lib/constants/confirmation-keywords.ts
// Definisikan di satu tempat, import di webhook handler dan handler lain yang butuh.
// Normalize dulu: toLowerCase().trim() sebelum cek.
export const CONFIRM_KEYWORDS = new Set([
  // Formal / singkat
  "ya", "iya", "yaa", "iyaa",
  // Bahasa Inggris
  "ok", "oke", "okay", "oks", "yes", "yep", "yap", "yup",
  // Slang / gaul
  "gas", "gaskeun", "gass", "sip", "siap", "siipp", "sippp",
  "mantap", "mantapp", "mantab", "deal", "oke sip", "oke gas",
  "lanjut", "lanjutkan", "lanjutin", "lanjut kak", "lanjutt",
  "setuju", "sepakat", "acc", "oke deh", "oke aja",
  "boleh", "boleh kak", "boleh dong",
  "ayo", "hayuk", "yuk", "yok",
  // Konfirmasi informal lain yang umum di WA
  "jadi", "jadi kak", "udah", "udah kak", "push", "go", "go kak",
]);

export const CANCEL_KEYWORDS = new Set([
  // Formal / singkat
  "batal", "batalkan", "dibatalkan",
  // Negasi umum
  "tidak", "gak", "ga", "nggak", "enggak", "ngga", "gakk", "gaklah",
  "nggakk", "enggaklah", "ndak", "tak",
  // Bahasa Inggris
  "cancel", "no", "nope", "stop",
  // Gabungan / gaul
  "gak jadi", "ga jadi", "nggak jadi", "enggak jadi",
  "gak mau", "ga mau", "nggak mau",
  "batal aja", "cancel aja", "hapus",
  "gak deh", "ga deh", "gak ah", "ga ah",
  "tidak jadi", "jangan",
]);
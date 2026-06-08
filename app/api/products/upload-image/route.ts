import { supabaseAdmin } from "@/server/db/client";
import { NextRequest } from "next/server";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png":  "png",
  "image/webp": "webp",
  "image/gif":  "gif",
};
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file" }, { status: 400 });

  if (file.size > MAX_BYTES)
    return Response.json({ error: "File too large (max 5 MB)" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext)
    return Response.json({ error: "File type not allowed" }, { status: 400 });

  const path = `products/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET!;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[upload-image]", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return Response.json({ url: publicUrl });
}

// app/api/test-firebase/route.ts
import { adminDb } from "@/lib/firebase/config";

export async function GET() {
  try {
    const snapshot = await adminDb.collection("debug").limit(1).get();
    return Response.json({ ok: true, docs: snapshot.size });
  } catch (error) {
    console.error("Firebase connection error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message });
  }
}

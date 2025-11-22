// app/api/debug-auth/route.ts (or pages/api/debug-auth.ts for pages router)
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function GET(req: Request) {
  try {
    const authRes = await auth();
    // If using Next.js route handlers, req.headers is available
    const cookieHeader = (req.headers && req.headers.get && req.headers.get("cookie")) ?? null;

    console.log("DEBUG authRes:", authRes);
    console.log("DEBUG cookie header:", cookieHeader);

    return NextResponse.json({ authRes, cookieHeader });
  } catch (err) {
    console.error("DEBUG auth error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

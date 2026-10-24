import { ApiError, handle, ok, readJson } from "@/lib/api/http";
import { getStore, passkeyConfig } from "@/lib/api/env";
import { requireUser } from "@/lib/api/auth";
import { finishRegistration, PasskeyError } from "@/lib/auth/passkey";

// POST /api/v1/auth/passkey/register/verify — { challengeId, response, name? } でパスキーを保存する
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser(request);
    const body = await readJson(request);
    if (typeof body.challengeId !== "string" || !body.response || typeof body.response !== "object") {
      throw new ApiError("bad_request", "challengeId と response が必要です");
    }
    try {
      const saved = await finishRegistration(getStore(), passkeyConfig(), user, {
        challengeId: body.challengeId,
        response: body.response as Parameters<typeof finishRegistration>[3]["response"],
        name: typeof body.name === "string" ? body.name : undefined,
      });
      return ok(saved, { status: 201 });
    } catch (err) {
      if (err instanceof PasskeyError) throw new ApiError("unauthorized", err.message);
      throw err;
    }
  });
}

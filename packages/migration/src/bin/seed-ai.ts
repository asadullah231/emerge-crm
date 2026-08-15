/**
 * Seed a workspace's AI provider config (encrypting the key with ENCRYPTION_KEY),
 * for setups where the admin can't reach the Settings > AI UI yet. Env:
 *   SEED_WS, SEED_API_KEY, [SEED_PROVIDER=anthropic], [SEED_MODEL=claude-sonnet-5]
 */
import { eq } from "drizzle-orm";
import { createDb, withWorkspace, workspaceAiSettings } from "@emerge/db";
import { encryptSecret, last4 } from "@emerge/ai";

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} required`);
  return v;
}

async function main() {
  const ws = need("SEED_WS");
  const apiKey = need("SEED_API_KEY");
  const provider = (process.env.SEED_PROVIDER ?? "anthropic") as "anthropic";
  const model = process.env.SEED_MODEL ?? "claude-sonnet-5";
  const enc = encryptSecret(apiKey);
  const db = createDb();
  try {
    await withWorkspace(db, ws, async (tx) => {
      const [ex] = await tx
        .select()
        .from(workspaceAiSettings)
        .where(eq(workspaceAiSettings.workspaceId, ws));
      const vals = {
        provider,
        model,
        baseUrl: null,
        apiKeyCiphertext: enc.ciphertext,
        apiKeyIv: enc.iv,
        apiKeyTag: enc.tag,
        apiKeyLast4: last4(apiKey),
        updatedAt: new Date()
      };
      if (ex) {
        await tx.update(workspaceAiSettings).set(vals).where(eq(workspaceAiSettings.id, ex.id));
      } else {
        await tx.insert(workspaceAiSettings).values({ workspaceId: ws, ...vals });
      }
    });
    console.log(`seeded ai settings: ${provider} / ${model} for ${ws}`);
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

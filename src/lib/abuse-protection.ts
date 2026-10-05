import "server-only";
import { checkBotId } from "botid/server";

type BotCheck = () => Promise<{ isBot: boolean }>;

export async function enforceBotProtection(check: BotCheck = checkBotId): Promise<Response | null> {
  try {
    const verification = await check();
    if (!verification.isBot) return null;

    return Response.json(
      { error: "Automated requests are not allowed on this endpoint." },
      { status: 403 },
    );
  } catch (error) {
    console.error("BotID verification failed", error instanceof Error ? error.name : "UnknownError");
    return Response.json(
      { error: "Request verification is temporarily unavailable." },
      { status: 503 },
    );
  }
}

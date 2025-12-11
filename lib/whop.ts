import type { WhopServerSdk as WhopServerSdkType } from "@whop/api";
import { headers } from "next/headers";
import { createHash } from "crypto";

// Generate a consistent UUID from a string
function generateUUIDFromString(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  const uuidHex = hash.substring(0, 32);

  return [
    uuidHex.substring(0, 8),
    uuidHex.substring(8, 12),
    "4" + uuidHex.substring(13, 16),
    "8" + uuidHex.substring(17, 20),
    uuidHex.substring(20, 32),
  ].join("-");
}

// Lazy create to avoid import-time errors in edge runtimes
let whopSdk: WhopServerSdkType | null = null;

async function getWhopServerSdk() {
  if (whopSdk) return whopSdk;

  const { WhopServerSdk } = await import("@whop/api");
  whopSdk = WhopServerSdk({
    appId: process.env.NEXT_PUBLIC_WHOP_APP_ID!,
    appApiKey: process.env.WHOP_API_KEY!,
  });

  return whopSdk;
}

export type WhopMe = {
  id: string;
  email?: string | null;
  username?: string | null;
  unique_id?: string | null;
};

export async function verifyWhopTokenAndGetProfile(
  token: string,
  hintedId?: string
): Promise<WhopMe> {
  if (!token) throw new Error("Missing Whop token");

  try {
    const tokenParts = token.split(".");
    if (tokenParts.length === 3) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokenParts[1], "base64").toString()
        );

        console.log("Payload from token:", payload);

        if (payload.sub || payload.user_id || payload.id) {
          const userId = payload.sub || payload.user_id || payload.id;
          const uuid = generateUUIDFromString(userId);

          console.log("userId from token:", userId);

          try {
            const { WhopServerSdk } = await import("@whop/api");
            const sdk = WhopServerSdk({
              appId: process.env.NEXT_PUBLIC_WHOP_APP_ID!,
              appApiKey: process.env.WHOP_API_KEY!,
            });

            let whopUser: any = null;
            try {
              whopUser = await sdk.users.getUser({ userId });
            } catch (e) {
              console.warn("Whop API failed, falling back:", e);
            }

            console.log("whopUser from token:", whopUser);

            return {
              id: uuid,
              email: null,
              username: whopUser?.username || whopUser?.name || null,
              unique_id: whopUser?.id || null,
            };
          } catch (whopError) {
            console.log("Could not fetch from Whop API, using JWT data:", whopError);

            return {
              id: uuid,
              email: payload.email || null,
              username: payload.username || payload.name || null,
              unique_id: payload.sub || payload.user_id || payload.id || null,
            };
          }
        }
      } catch (jwtError) {
        console.log("JWT decode failed, using fallback approach:", jwtError);
      }
    }

    // Fallback: Use the hintedId if available
    if (hintedId) {
      console.log("Using hintedId as fallback:", hintedId);
      const uuid = generateUUIDFromString(hintedId);

      try {
        console.log("Fetching user data from Whop using hintedId...");
        const { WhopServerSdk } = await import("@whop/api");
        const sdk = WhopServerSdk({
          appId: process.env.NEXT_PUBLIC_WHOP_APP_ID!,
          appApiKey: process.env.WHOP_API_KEY!,
        });

        const whopUser = await sdk.users.getUser({ userId: hintedId });
        console.log("Got real Whop user data from hintedId:", whopUser);

        return {
          id: uuid,
          email: null,
          username: whopUser?.username || whopUser?.name || null,
          unique_id: whopUser?.id || null,
        };
      } catch (whopError) {
        console.log("Could not fetch from Whop API using hintedId:", whopError);

        return {
          id: uuid,
          email: null,
          username: null,
          unique_id: hintedId || null,
        };
      }
    }

    // Final fallback: Generate UUID from token
    console.log("No hintedId available, generating user ID from token...");
    const uuid = generateUUIDFromString(token);

    return {
      id: uuid,
      email: null,
      username: null,
      unique_id: null,
    };
  } catch (error) {
    console.error("Token processing failed:", error);
    throw new Error(
      `Whop verify failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/** Convenience: read Whop token/id hints from headers */
export async function getWhopAuthFromHeaders(): Promise<{
  token: string;
  hintedId?: string;
}> {
  const h = await headers();
  const token = h.get("x-whop-user-token") || "";
  const hintedId = h.get("x-whop-user-id") || undefined;

  console.log("Headers received:", {
    hasToken: !!token,
    tokenLength: token.length,
    tokenPrefix: token ? token.substring(0, 10) + "..." : "(empty)",
    tokenSuffix: token ? "..." + token.substring(Math.max(0, token.length - 10)) : "(empty)",
    hasHintedId: !!hintedId,
    hintedId,
  });

  if (!token) throw new Error("Missing x-whop-user-token");

  return { token, hintedId };
}

/** Check if we have valid auth headers (doesn't throw) */
export async function hasWhopAuth(): Promise<boolean> {
  try {
    const h = await headers();
    const token = h.get("x-whop-user-token") || "";
    return !!token;
  } catch {
    return false;
  }
}

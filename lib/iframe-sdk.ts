// lib/iframe-sdk.ts
import { createSdk } from "@whop/iframe";

export const iframeSdk = createSdk({
  appId: process.env.NEXT_PUBLIC_WHOP_APP_ID!,
});

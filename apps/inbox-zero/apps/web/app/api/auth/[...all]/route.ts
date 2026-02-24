import { toNextJsHandler } from "better-auth/next-js";
import { betterAuthConfig } from "@/utils/auth";

export const { POST, GET } = toNextJsHandler(betterAuthConfig);

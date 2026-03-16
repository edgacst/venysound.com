import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./shared/schema.ts", "./shared/models/auth.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});

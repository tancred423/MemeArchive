import { defineConfig } from "npm:drizzle-kit@0.30.4";

const host = Deno.env.get("MYSQL_HOST") ?? "localhost";
const port = Deno.env.get("MYSQL_PORT") ?? "3306";
const user = Deno.env.get("MYSQL_USER") ?? "root";
const password = Deno.env.get("MYSQL_PASSWORD") ?? "";
const database = Deno.env.get("MYSQL_DATABASE") ?? "meme_archive";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host,
    port: parseInt(port),
    user,
    password,
    database,
  },
});

import { drizzle } from "npm:drizzle-orm@0.38.4/mysql2";
import { migrate } from "npm:drizzle-orm@0.38.4/mysql2/migrator";
import mysql from "npm:mysql2@3.11.0/promise";

const host = Deno.env.get("MYSQL_HOST") ?? "localhost";
const port = parseInt(Deno.env.get("MYSQL_PORT") ?? "3306");
const user = Deno.env.get("MYSQL_USER") ?? "root";
const password = Deno.env.get("MYSQL_PASSWORD") ?? "";
const database = Deno.env.get("MYSQL_DATABASE") ?? "meme_archive";

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
});

const db = drizzle(connection);

console.log("Running migrations...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations complete.");

await connection.end();
Deno.exit(0);

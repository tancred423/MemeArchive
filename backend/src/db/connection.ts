import { drizzle, type MySql2Database } from "npm:drizzle-orm@0.38.4/mysql2";
import mysql from "npm:mysql2@3.11.0/promise";

let pool: mysql.Pool | null = null;
let _db: MySql2Database | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: Deno.env.get("MYSQL_HOST") ?? "localhost",
      port: parseInt(Deno.env.get("MYSQL_PORT") ?? "3306"),
      user: Deno.env.get("MYSQL_USER") ?? "root",
      password: Deno.env.get("MYSQL_PASSWORD") ?? "",
      database: Deno.env.get("MYSQL_DATABASE") ?? "meme_archive",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export function getDb(): MySql2Database {
  if (!_db) {
    _db = drizzle(getPool());
  }
  return _db;
}

import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("records", {id:text("id").primaryKey(),payload:text("payload").notNull()});

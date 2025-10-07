// src/database/schema.util.ts
export function T(tableName: string): string {
  const schema = process.env.DB_SCHEMA || 'public';
  return `"${schema}"."${tableName}"`;
}
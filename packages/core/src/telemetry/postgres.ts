import type { Span } from '@opentelemetry/api';
import type { PgRequestHookInformation } from '@opentelemetry/instrumentation-pg';

export function setPostgresQueryName(span: Span, { query }: PgRequestHookInformation): void {
  const queryName = getPostgresQueryName(query);
  span.setAttribute('db.query.name', queryName);
  span.updateName(`sql ${queryName}`);
}

export function getPostgresQueryName(query: { text: string; name?: string }): string {
  if (query.name) return query.name;

  const normalized = normalizeStatement(query.text);
  const operation = getSqlOperation(normalized);
  if (operation === 'BEGIN' || operation === 'COMMIT' || operation === 'ROLLBACK') {
    return `transaction-${operation.toLowerCase()}`;
  }

  const action = getQueryAction(operation, normalized);
  const relation = getPrimaryRelation(operation, normalized);
  return relation ? `${action}-${relation}` : action;
}

function getSqlOperation(statement: string): string {
  if (/^(?:BEGIN|START\s+TRANSACTION)\b/i.test(statement)) return 'BEGIN';
  if (/^COMMIT\b/i.test(statement)) return 'COMMIT';
  if (/^ROLLBACK\b/i.test(statement)) return 'ROLLBACK';
  if (/\bINSERT\s+INTO\b/i.test(statement)) return 'INSERT';
  if (/\bUPDATE\s+[A-Za-z_"]/i.test(statement)) return 'UPDATE';
  if (/\bDELETE\s+FROM\b/i.test(statement)) return 'DELETE';
  if (/\bSELECT\b/i.test(statement)) return 'SELECT';
  return statement.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? 'UNKNOWN';
}

function getQueryAction(operation: string, statement: string): string {
  if (operation !== 'SELECT') return operation.toLowerCase();
  if (/\bSELECT\s+(?:DISTINCT\s+)?count\s*\(/i.test(statement)) return 'count';
  if (/\bSELECT\s+1\b/i.test(statement)) return 'check';
  if (/\bLIMIT\s+1\b/i.test(statement)) return 'get';
  return 'list';
}

function getPrimaryRelation(operation: string, statement: string): string | null {
  const pattern =
    operation === 'INSERT'
      ? /\bINSERT\s+INTO\s+([A-Za-z_"][\w."]*)/i
      : operation === 'UPDATE'
        ? /\bUPDATE\s+([A-Za-z_"][\w."]*)/i
        : operation === 'DELETE'
          ? /\bDELETE\s+FROM\s+([A-Za-z_"][\w."]*)/i
          : /\bFROM\s+([A-Za-z_"][\w."]*)/i;
  const relation = statement.match(pattern)?.[1];
  return relation ? relation.replaceAll('"', '').replaceAll('.', '-').replaceAll('_', '-') : null;
}

function normalizeStatement(statement: string): string {
  return statement
    .replace(/^\s*(?:(?:--[^\n]*(?:\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*/, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

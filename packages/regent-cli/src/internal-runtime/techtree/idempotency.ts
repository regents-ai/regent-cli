import crypto from "node:crypto";

const sanitizeSeed = (seed: string): string => {
  return seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
};

export function makeNodeIdempotencyKey(seed: string): string {
  const normalizedSeed = sanitizeSeed(seed) || "node";
  return `node:${normalizedSeed}:${Date.now()}:${crypto.randomUUID()}`;
}

export function makeCommentIdempotencyKey(nodeId: number): string {
  return `comment:node-${nodeId}:${Date.now()}:${crypto.randomUUID()}`;
}

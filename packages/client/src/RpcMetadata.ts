export type RpcMetadata = Record<string, unknown>;
export type MetadataProvider = () => RpcMetadata | undefined;

export interface RpcCallOptions {
  metadata?: RpcMetadata;
}

/** Shallow merge in provider order; per-call namespaces take precedence. */
export function resolveMetadata(
  providers: readonly MetadataProvider[],
  perCall?: RpcMetadata,
): RpcMetadata | undefined {
  let metadata: RpcMetadata | undefined;
  for (const provider of providers) {
    const value = provider();
    if (value !== undefined) metadata = { ...metadata, ...value };
  }
  if (perCall !== undefined) metadata = { ...metadata, ...perCall };
  return metadata;
}

export type RpcResponse = {
  contents: string;
};

export interface Transport {
  call(name: string, input?: unknown): Promise<RpcResponse>;
}

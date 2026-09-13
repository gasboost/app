export type RpcResponse = {
  contents: string;
};

export interface Transport {
  call(name: string, args: unknown[]): Promise<RpcResponse>;
}

/**
 * Contract writes for the Night Shift. Transactions are prepared with viem, signed by the agent's
 * @bnbagent/sdk wallet provider (keys never leave its keystore), and broadcast to BSC.
 * Calls are serialized per wallet so nonces never collide.
 */
import type { EVMWalletProvider } from "@bnbagent/sdk";
import { type Abi, type Hex, createPublicClient, encodeFunctionData, http } from "viem";
import { bsc } from "viem/chains";

export const publicClient = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org", { retryCount: 3, timeout: 20_000 }) });

const queues = new Map<string, Promise<unknown>>();

export interface SentTx {
  hash: Hex;
  status: "success" | "reverted";
  gasUsed: bigint;
  blockNumber: bigint;
}

export function sendContractTx(wallet: EVMWalletProvider, to: `0x${string}`, abi: Abi, functionName: string, args: readonly unknown[]): Promise<SentTx> {
  return sendTx(wallet, to, encodeFunctionData({ abi, functionName, args } as never), 0n);
}

/** Plain BNB transfer (gas top-ups from the treasury). */
export function sendValueTx(wallet: EVMWalletProvider, to: `0x${string}`, value: bigint): Promise<SentTx> {
  return sendTx(wallet, to, "0x", value);
}

function sendTx(wallet: EVMWalletProvider, to: `0x${string}`, data: Hex, value: bigint): Promise<SentTx> {
  const run = async (): Promise<SentTx> => {
    const from = wallet.address;
    const [nonce, gasPrice, estimate] = await Promise.all([
      publicClient.getTransactionCount({ address: from, blockTag: "pending" }),
      publicClient.getGasPrice(),
      publicClient.estimateGas({ account: from, to, data, value }),
    ]);
    const signed = await wallet.signTransaction({ to, data, value, nonce, gasPrice, gas: (estimate * 13n) / 10n, chainId: bsc.id, type: "legacy" });
    const hash = await publicClient.sendRawTransaction({ serializedTransaction: signed.rawTransaction });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    return { hash, status: receipt.status, gasUsed: receipt.gasUsed, blockNumber: receipt.blockNumber };
  };
  const prev = queues.get(wallet.address) ?? Promise.resolve();
  const next = prev.then(run, run);
  queues.set(wallet.address, next.catch(() => undefined));
  return next;
}

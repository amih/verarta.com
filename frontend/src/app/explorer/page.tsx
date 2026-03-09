'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getChainStats, getRecentBlocks, getActions } from '@/lib/api/chain';
import type { ChainStats, BlockSummary, HyperionAction } from '@/lib/api/chain';

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp + 'Z').getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

interface PaceStatus {
  state: 'AWAKE' | 'SLEEPING';
  headBlock: number;
  idleBlockCount: number;
  healthy: boolean;
  uptime: number;
  config?: {
    sleepDurationMs: number;
    wakeDurationMs: number;
    idleBlockThreshold: number;
  };
}

function usePaceController() {
  const [status, setStatus] = useState<PaceStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_PACE_WS_URL;
    if (!wsUrl) return;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.data) setStatus(msg.data);
        } catch { /* ignore parse errors */ }
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, connected };
}

function ChainStatusBar({ status, connected }: { status: PaceStatus | null; connected: boolean }) {
  if (!connected && !status) return null;

  const isAwake = status?.state === 'AWAKE';
  const isSleeping = status?.state === 'SLEEPING';

  return (
    <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-sm ${
      !connected
        ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'
        : isSleeping
          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
    }`}>
      {/* Connection dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {connected && isAwake && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
          !connected ? 'bg-zinc-400' : isAwake ? 'bg-emerald-500' : 'bg-amber-500'
        }`} />
      </span>

      <span className={`font-medium ${
        !connected
          ? 'text-zinc-500 dark:text-zinc-400'
          : isSleeping
            ? 'text-amber-700 dark:text-amber-400'
            : 'text-emerald-700 dark:text-emerald-400'
      }`}>
        {!connected ? 'Disconnected' : isAwake ? 'Chain Active' : 'Chain Sleeping'}
      </span>

      {status && connected && (
        <>
          <span className="text-zinc-400 dark:text-zinc-600">|</span>
          <span className="font-mono text-zinc-600 dark:text-zinc-400">
            Block {status.headBlock.toLocaleString()}
          </span>
          {isSleeping && (
            <>
              <span className="text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-amber-600 dark:text-amber-400">
                Paused — wakes every {formatUptime((status.config?.sleepDurationMs ?? 3600000) / 1000)} to check for activity
              </span>
            </>
          )}
          {isAwake && status.idleBlockCount > 0 && (
            <>
              <span className="text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {status.idleBlockCount} idle block{status.idleBlockCount !== 1 ? 's' : ''}
              </span>
            </>
          )}
          <span className="ml-auto text-zinc-400 dark:text-zinc-500">
            up {formatUptime(status.uptime)}
          </span>
        </>
      )}
    </div>
  );
}

export default function ExplorerOverview() {
  const router = useRouter();
  const [stats, setStats] = useState<ChainStats | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [actions, setActions] = useState<HyperionAction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { status: paceStatus, connected: paceConnected } = usePaceController();

  useEffect(() => {
    Promise.all([
      getChainStats().then((r) => setStats(r.stats)),
      getRecentBlocks(20).then((r) => setBlocks(r.blocks)),
      getActions({ limit: 10, filter: '!eosio:onblock' }).then((r) => setActions(r.actions)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;

    if (/^\d+$/.test(q)) {
      router.push(`/explorer/block/${q}`);
    } else if (/^[a-f0-9]{64}$/i.test(q)) {
      router.push(`/explorer/transaction/${q}`);
    } else if (/^[a-z1-5.]{1,12}$/.test(q)) {
      router.push(`/explorer/account/${q}`);
    } else {
      router.push(`/explorer/account/${q}`);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Block Explorer</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Browse on-chain data — blocks, transactions, accounts, and artworks.
        </p>
      </div>

      {/* Live Chain Status */}
      <ChainStatusBar status={paceStatus} connected={paceConnected} />

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by account name, block number, or transaction ID..."
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Search
        </button>
      </form>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Head Block', value: (paceStatus?.headBlock ?? stats.head_block_num).toLocaleString(), sub: `LIB: ${stats.last_irreversible_block_num.toLocaleString()}` },
            { label: 'Chain ID', value: stats.chain_id.slice(0, 8) + '...' },
            { label: 'Artworks', value: stats.total_artworks.toLocaleString() },
            { label: 'Files', value: stats.total_files.toLocaleString() },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{card.value}</p>
              {'sub' in card && card.sub && (
                <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">{card.sub}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        </div>
      )}

      {!loading && (
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Recent Blocks */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Blocks</h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Block</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Producer</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Time</th>
                    <th className="px-4 py-2 text-right font-medium text-zinc-500 dark:text-zinc-400">Txns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {blocks.map((block) => (
                    <tr key={block.block_num} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2">
                        <Link href={`/explorer/block/${block.block_num}`} className="font-mono text-blue-600 hover:underline dark:text-blue-400">
                          {block.block_num.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/explorer/account/${block.producer}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {block.producer}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-zinc-500 dark:text-zinc-400">{timeAgo(block.timestamp)}</td>
                      <td className="px-4 py-2 text-right text-zinc-700 dark:text-zinc-300">{block.tx_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Actions */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recent Actions</h2>
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Action</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Actor</th>
                    <th className="px-4 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Tx</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-950">
                  {actions.map((action, i) => (
                    <tr key={`${action.trx_id}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          {action.act.name}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/explorer/account/${action.act.authorization[0]?.actor}`} className="text-blue-600 hover:underline dark:text-blue-400">
                          {action.act.authorization[0]?.actor || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/explorer/transaction/${action.trx_id}`} className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400">
                          {action.trx_id.slice(0, 8)}...
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {actions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-zinc-400">No recent actions</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

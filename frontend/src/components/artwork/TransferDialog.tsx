'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { searchUsers } from '@/lib/api/users';
import { transferArtwork } from '@/lib/api/artworks';
import { queryTable } from '@/lib/api/chain';
import { getKeyPair } from '@/lib/crypto/keys';
import { getAntelopeKey } from '@/lib/crypto/antelope';
import type { ArtworkFile } from '@/types/api';

interface UserResult {
  blockchain_account: string;
  display_name: string;
}

interface Props {
  artworkId: number;
  artworkTitle: string;
  files: ArtworkFile[];
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'search' | 'confirm' | 'processing' | 'done' | 'error';

export function TransferDialog({ artworkId, artworkTitle, files, onClose, onSuccess }: Props) {
  const { user } = useAuthStore();

  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserResult | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchUsers(query);
        // Exclude the current user from results
        setResults(
          data.users.filter((u) => u.blockchain_account !== user?.blockchain_account)
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query, user?.blockchain_account]);

  function handleSelect(u: UserResult) {
    setSelected(u);
    setStep('confirm');
  }

  async function handleTransfer() {
    if (!selected || !user) return;
    setStep('processing');

    try {
      // Step 1: Look up recipient's X25519 public key from chain
      setProgressMsg('Looking up recipient key…');
      const tableResult = await queryTable<{ artwork_id: number; owner: string; creator_public_key: string }>({
        code: 'verarta.core',
        scope: 'verarta.core',
        table: 'artworks',
        index_position: 2,
        key_type: 'name',
        lower_bound: selected.blockchain_account,
        limit: 10,
      });

      const recipientRows = tableResult.rows.filter(
        (r) => r.owner === selected.blockchain_account
      );

      if (recipientRows.length === 0) {
        setErrorMsg(
          "Recipient hasn't created any artwork on Verarta yet — ask them to log in and upload first."
        );
        setStep('error');
        return;
      }

      const recipientPublicKey = recipientRows[0].creator_public_key;

      // Step 2: Get current user's crypto keys
      setProgressMsg(`Re-encrypting ${files.filter((f) => f.upload_complete).length} file(s)…`);
      const keyPair = await getKeyPair(user.email);
      if (!keyPair) {
        setErrorMsg('Your encryption keys were not found in this browser. Please log in again.');
        setStep('error');
        return;
      }

      const antelopeKey = await getAntelopeKey(user.email);
      if (!antelopeKey) {
        setErrorMsg('Your signing key was not found in this browser. Please log in again.');
        setStep('error');
        return;
      }

      // Step 3: Sign and push the transfer transaction
      setProgressMsg('Signing transaction…');
      const { transaction_id } = await transferArtwork(
        artworkId,
        files,
        user.blockchain_account,
        selected.blockchain_account,
        recipientPublicKey,
        keyPair.privateKey,
        antelopeKey.privateKey
      );

      setStep('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transfer failed. Please try again.');
      setStep('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Transfer Artwork
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            "{artworkTitle}"
          </p>

          {step === 'search' && (
            <div className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Search by name, email, or account…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />

              {searching && (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              )}

              {!searching && query.length >= 2 && results.length === 0 && (
                <p className="text-sm text-zinc-500">No users found.</p>
              )}

              {results.length > 0 && (
                <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                  {results.map((u) => (
                    <li key={u.blockchain_account}>
                      <button
                        onClick={() => handleSelect(u)}
                        className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {u.display_name}
                        </span>
                        <span className="text-xs text-zinc-500">{u.blockchain_account}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {step === 'confirm' && selected && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                Transfer{' '}
                <span className="font-semibold">"{artworkTitle}"</span> to{' '}
                <span className="font-semibold">{selected.display_name}</span>{' '}
                <span className="text-zinc-500">({selected.blockchain_account})</span>?
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                This will permanently transfer ownership. Your copy of the decryption keys will no longer work after the transfer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleTransfer}
                  className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Transfer
                </button>
                <button
                  onClick={() => setStep('search')}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="mt-6 flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{progressMsg}</p>
            </div>
          )}

          {step === 'done' && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-green-700 dark:text-green-400">
                Artwork transferred successfully!
              </p>
              <button
                onClick={onSuccess}
                className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Close
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('search'); setErrorMsg(''); }}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Try again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

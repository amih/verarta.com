'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import {
  fetchUsers,
  toggleUserAdmin,
  fetchUserArtworks,
  fetchUserArtists,
  fetchUserCollections,
  fetchAdminKeys,
  registerAdminKey,
  rekeyFiles,
  type AdminUser,
  type AdminArtwork,
  type AdminKey,
} from '@/lib/api/admin';
import { getKeyPair } from '@/lib/crypto/keys';
import { decryptDek, encryptDekForRecipient } from '@/lib/crypto/encryption';
import { queryTable } from '@/lib/api/chain';
import { CheckCircle2, FileIcon, KeyRound, Loader2, RefreshCw, Search, ShieldCheck, ShieldOff, X } from 'lucide-react';
import Link from 'next/link';

const PROTECTED_USER_ID = 1;

interface ArtFile {
  file_id: number;
  iv: string;
  auth_tag: string;
  encrypted_dek: string;
  admin_encrypted_deks: string[];
  upload_complete: boolean;
}

function UserArtworksPanel({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const [artworks, setArtworks] = useState<AdminArtwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState<{ id: number; name: string }[]>([]);
  const [collections, setCollections] = useState<{ id: number; name: string }[]>([]);

  const [q, setQ] = useState('');
  const [artistId, setArtistId] = useState<number | ''>('');
  const [collectionId, setCollectionId] = useState<number | ''>('');
  const [era, setEra] = useState('');

  useEffect(() => {
    fetchUserArtists(user.id).then(setArtists).catch(() => {});
    fetchUserCollections(user.id).then(setCollections).catch(() => {});
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    const filters = {
      ...(q ? { q } : {}),
      ...(artistId ? { artist_id: artistId as number } : {}),
      ...(collectionId ? { collection_id: collectionId as number } : {}),
      ...(era ? { era } : {}),
    };
    fetchUserArtworks(user.id, filters)
      .then(setArtworks)
      .finally(() => setLoading(false));
  }, [user.id, q, artistId, collectionId, era]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative flex w-full max-w-lg flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-5 dark:border-zinc-800">
          <div>
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{user.display_name}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title..."
              className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-2 text-xs focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
          {artists.length > 0 && (
            <select
              value={artistId}
              onChange={(e) => setArtistId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">All artists</option>
              {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {collections.length > 0 && (
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value ? Number(e.target.value) : '')}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">All collections</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <input
            type="text"
            value={era}
            onChange={(e) => setEra(e.target.value)}
            placeholder="Era..."
            className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          ) : artworks.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No artworks found.</p>
          ) : (
            <div className="space-y-2">
              {artworks.map((art) => (
                <Link
                  key={art.id}
                  href={`/dashboard/artworks/${art.id}`}
                  target="_blank"
                  className="flex items-center justify-between rounded-lg border border-zinc-100 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {art.title}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(art.created_at).toLocaleString()} &middot; {art.file_count} file{art.file_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  // Admin key escrow state
  const [myPublicKey, setMyPublicKey] = useState<string | null>(null);
  const [adminKeys, setAdminKeys] = useState<AdminKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');

  // Re-key state
  const [rekeyingFor, setRekeyingFor] = useState<number | null>(null); // key_id being rekeyed
  const [rekeyProgress, setRekeyProgress] = useState('');
  const [rekeyResult, setRekeyResult] = useState<string | null>(null);

  const isMyKeyRegistered = myPublicKey != null && adminKeys.some((k) => k.public_key === myPublicKey);
  const myKeyIndex = adminKeys.findIndex((k) => k.public_key === myPublicKey);

  useEffect(() => {
    if (user && !user.is_admin) {
      router.push('/dashboard');
      return;
    }

    fetchUsers()
      .then(setUsers)
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false));
  }, [user, router]);

  useEffect(() => {
    if (!user?.is_admin) return;

    async function loadKeyData() {
      try {
        const [kp, keys] = await Promise.all([
          getKeyPair(user!.email),
          fetchAdminKeys(),
        ]);
        if (kp) setMyPublicKey(kp.publicKey);
        setAdminKeys(keys);
      } catch {
        // non-fatal
      } finally {
        setKeysLoading(false);
      }
    }

    loadKeyData();
  }, [user]);

  async function handleRegisterKey() {
    if (!myPublicKey || !user) return;
    setRegistering(true);
    setRegisterError('');
    try {
      await registerAdminKey(myPublicKey, `Admin: ${user.display_name || user.email}`);
      const keys = await fetchAdminKeys();
      setAdminKeys(keys);
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  }

  async function handleRekeyFiles(targetKey: AdminKey, targetIndex: number) {
    if (!user || myKeyIndex < 0) return;

    setRekeyingFor(targetKey.key_id);
    setRekeyProgress('');
    setRekeyResult(null);

    try {
      // Load current admin's private key
      setRekeyProgress('Loading your private key…');
      const kp = await getKeyPair(user.email);
      if (!kp) throw new Error('Your private key is not available in this browser');
      const myPrivateKey = kp.privateKey;

      // Paginate all artfiles from chain
      setRekeyProgress('Loading files…');

      const allFiles: ArtFile[] = [];
      let nextKey: string | null | undefined;
      while (true) {
        const res = await queryTable<ArtFile>({
          code: 'verarta.core',
          scope: 'verarta.core',
          table: 'artfiles',
          limit: 100,
          ...(nextKey != null ? { lower_bound: nextKey } : {}),
        });
        allFiles.push(...res.rows.filter((f) => f.upload_complete));
        if (!res.more || !res.next_key) break;
        nextKey = res.next_key;
      }

      // Filter files that need a DEK for the target admin
      const filesToRekey = allFiles.filter(
        (f) => f.admin_encrypted_deks.length === targetIndex
      );
      const skipped = allFiles.filter(
        (f) => f.admin_encrypted_deks.length === 0
      );

      if (filesToRekey.length === 0) {
        const skippedNote = skipped.length > 0
          ? ` (${skipped.length} file${skipped.length !== 1 ? 's' : ''} uploaded before admin key escrow configured — cannot be re-keyed)`
          : '';
        setRekeyResult(`No files need re-keying for this admin key.${skippedNote}`);
        return;
      }

      setRekeyProgress(`Re-keying ${filesToRekey.length} file${filesToRekey.length !== 1 ? 's' : ''} for ${targetKey.admin_account}…`);

      // Decrypt each file's DEK and re-encrypt for target admin
      const batch: Array<{ file_id: number; new_encrypted_dek: string }> = [];
      for (const file of filesToRekey) {
        const myEncDek = file.admin_encrypted_deks[myKeyIndex];
        if (!myEncDek) continue; // shouldn't happen given filter logic

        // Handle embedded ephemeral key format: "encDek.ephPubKey"
        let dekB64 = myEncDek;
        let authTag = file.auth_tag;
        if (myEncDek.includes('.')) {
          const parts = myEncDek.split('.');
          dekB64 = parts[0];
          authTag = parts[1];
        }

        const dek = await decryptDek(dekB64, file.iv, authTag, myPrivateKey);
        const { encryptedDek, ephemeralPublicKey } = await encryptDekForRecipient(dek, file.iv, targetKey.public_key);
        batch.push({ file_id: file.file_id, new_encrypted_dek: `${encryptedDek}.${ephemeralPublicKey}` });
      }

      if (batch.length === 0) {
        setRekeyResult('Nothing to re-key (could not decrypt any files).');
        return;
      }

      const result = await rekeyFiles(batch);
      const skippedWarning = skipped.length > 0
        ? ` Warning: ${skipped.length} file${skipped.length !== 1 ? 's' : ''} uploaded before admin key escrow was configured and cannot be re-keyed.`
        : '';
      setRekeyResult(
        `Done. ${result.processed} file${result.processed !== 1 ? 's' : ''} re-keyed${result.failed > 0 ? `, ${result.failed} failed` : ''}.${skippedWarning}`
      );
    } catch (err) {
      setRekeyResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRekeyingFor(null);
      setRekeyProgress('');
    }
  }

  async function handleToggle(userId: number) {
    setToggling(userId);
    try {
      const updated = await toggleUserAdmin(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? { ...u, is_admin: updated.is_admin } : u))
      );
    } catch {
      // error handled by axios interceptor
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-100">User Management</h1>

      {/* Admin Encryption Keys Card */}
      <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Admin Encryption Keys</h2>
        </div>

        {keysLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading keys…
          </div>
        ) : (
          <div className="space-y-4">
            {/* My key status */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Your X25519 public key</p>
                <p className="truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  {myPublicKey ?? 'Key not found in this browser'}
                </p>
              </div>
              {myPublicKey && (
                isMyKeyRegistered ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Registered
                  </span>
                ) : (
                  <button
                    onClick={handleRegisterKey}
                    disabled={registering}
                    className="inline-flex shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#15803d' }}
                  >
                    {registering ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                    Register my key
                  </button>
                )
              )}
            </div>

            {registerError && (
              <p className="text-xs text-red-600 dark:text-red-400">{registerError}</p>
            )}

            {/* All registered keys */}
            {adminKeys.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  All registered admin keys ({adminKeys.length})
                </p>
                <div className="space-y-1.5">
                  {adminKeys.map((k, idx) => {
                    const isMyKey = k.public_key === myPublicKey;
                    const canRekey = isMyKeyRegistered && !isMyKey;
                    return (
                      <div
                        key={k.key_id}
                        className="flex items-center gap-3 rounded border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800"
                      >
                        <span className="shrink-0 font-mono text-zinc-400">#{k.key_id}</span>
                        <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-300">{k.admin_account}</span>
                        <span className="min-w-0 flex-1 truncate font-mono text-zinc-500 dark:text-zinc-400">{k.public_key}</span>
                        <span className="shrink-0 text-zinc-400">{k.description}</span>
                        {canRekey && (
                          <button
                            onClick={() => handleRekeyFiles(k, idx)}
                            disabled={rekeyingFor !== null}
                            className="inline-flex shrink-0 items-center gap-1 rounded px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:opacity-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          >
                            {rekeyingFor === k.key_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Re-key files
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Re-key progress */}
                {rekeyProgress && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {rekeyProgress}
                  </p>
                )}

                {/* Re-key result */}
                {rekeyResult && (
                  <p className={`mt-2 text-xs ${rekeyResult.startsWith('Error') ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {rekeyResult}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Email</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Display Name</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Blockchain Account</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Admin</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Last Login</th>
              <th className="px-4 py-3 font-medium text-zinc-600 dark:text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id} className="bg-white dark:bg-zinc-950">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedUser(u)}
                    className="text-left text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                  >
                    {u.email}
                  </button>
                </td>
                <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{u.display_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {u.blockchain_account}
                </td>
                <td className="px-4 py-3">
                  {u.is_admin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                  {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggle(u.id)}
                    disabled={u.id === PROTECTED_USER_ID || toggling === u.id}
                    className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    style={
                      u.id === PROTECTED_USER_ID
                        ? undefined
                        : u.is_admin
                          ? { color: '#b91c1c' }
                          : { color: '#15803d' }
                    }
                    title={u.id === PROTECTED_USER_ID ? 'Protected admin — cannot be modified' : undefined}
                  >
                    {toggling === u.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : u.is_admin ? (
                      <>
                        <ShieldOff className="h-3 w-3" /> Revoke
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3 w-3" /> Grant
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <UserArtworksPanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}

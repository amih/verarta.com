'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import {
  getMyProfile,
  updateMyProfile,
  checkUsernameAvailable,
  uploadProfileImage,
} from '@/lib/api/profile';
import { Loader2, Save, Upload, ExternalLink, Check, X, Share2 } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Username availability
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Image upload
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: getMyProfile,
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
    }
  }, [profile]);

  const checkUsername = useCallback((value: string) => {
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (!value.trim() || value === profile?.username) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    usernameTimer.current = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(value);
        setUsernameAvailable(available);
      } catch {
        setUsernameAvailable(null);
      }
      setCheckingUsername(false);
    }, 500);
  }, [profile?.username]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateMyProfile({
        display_name: displayName,
        username: username || undefined,
        bio,
      });
      await queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setSuccess('Profile saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageUpload(file: File, type: 'profile' | 'cover') {
    const setter = type === 'profile' ? setUploadingProfile : setUploadingCover;
    setter(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      await uploadProfileImage(base64, type);
      await queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    } catch {
      setError(`Failed to upload ${type} image`);
    } finally {
      setter(false);
    }
  }

  const usernameSlug = username.replace(/ /g, '_');
  const profileUrl = username ? `/u/${usernameSlug}` : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Profile Settings</h1>

      {/* Cover Image */}
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        <div
          className="relative h-40 bg-zinc-100 dark:bg-zinc-800 cursor-pointer group"
          onClick={() => coverInputRef.current?.click()}
        >
          {profile?.cover_image_url ? (
            <img
              src={`${process.env.NEXT_PUBLIC_API_URL || ''}${profile.cover_image_url}`}
              alt="Cover"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">
              Click to upload cover image
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingCover ? (
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            ) : (
              <Upload className="h-6 w-6 text-white" />
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImageUpload(f, 'cover');
            }}
          />
        </div>

        {/* Profile Image */}
        <div className="px-6 pb-6">
          <div className="-mt-12 mb-4">
            <div
              className="relative h-24 w-24 rounded-full border-4 border-white dark:border-zinc-900 bg-zinc-200 dark:bg-zinc-700 cursor-pointer group overflow-hidden"
              onClick={() => profileInputRef.current?.click()}
            >
              {profile?.profile_image_url ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || ''}${profile.profile_image_url}`}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl font-medium text-zinc-500">
                  {displayName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                {uploadingProfile ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Upload className="h-5 w-5 text-white" />
                )}
              </div>
              <input
                ref={profileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f, 'profile');
                }}
              />
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    checkUsername(e.target.value);
                  }}
                  placeholder="Choose a username"
                  maxLength={32}
                  className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 pr-8 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
                {checkingUsername && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-zinc-400" />
                )}
                {!checkingUsername && usernameAvailable === true && (
                  <Check className="absolute right-2.5 top-2.5 h-4 w-4 text-green-500" />
                )}
                {!checkingUsername && usernameAvailable === false && (
                  <X className="absolute right-2.5 top-2.5 h-4 w-4 text-red-500" />
                )}
              </div>
              {profileUrl && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Your profile: <code className="text-zinc-700 dark:text-zinc-300">verarta.com{profileUrl}</code>
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Tell people about yourself..."
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                {success}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              {profileUrl && (
                <>
                  <Link
                    href={profileUrl}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View my public collection
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}${profileUrl}`;
                      if (navigator.share) {
                        navigator.share({ title: `${displayName}'s Collection`, url });
                      } else {
                        navigator.clipboard.writeText(url);
                        setSuccess('Link copied to clipboard');
                        setTimeout(() => setSuccess(''), 3000);
                      }
                    }}
                    className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

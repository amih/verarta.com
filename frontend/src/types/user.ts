export interface User {
  id: number;
  blockchain_account: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  avatar_url?: string;
}

export interface SessionUser {
  userId: number;
  blockchain_account: string;
  email: string;
  is_admin: boolean;
  avatar_url?: string;
}

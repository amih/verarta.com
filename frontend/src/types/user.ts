export interface User {
  id: number;
  blockchain_account: string;
  email: string;
  display_name: string;
  is_admin: boolean;
}

export interface SessionUser {
  userId: number;
  blockchain_account: string;
  email: string;
  is_admin: boolean;
}

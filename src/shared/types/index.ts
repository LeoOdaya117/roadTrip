export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  avatarUrl?: string;
}

export type Nullable<T> = T | null | undefined;

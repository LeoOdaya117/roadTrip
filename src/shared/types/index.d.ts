export interface User {
	id: string;
	email: string;
	name?: string;
}

export interface apiResponse<T = any> {
  success: boolean;
  // Response shape varies between endpoints; make it permissive so callers can
  // access nested `response.data` or `response.data.message` as in the API examples.
  response?: {
    status?: number;
    data?: T;
    [k: string]: any;
  };
  [k: string]: any;
}

export type Nullable<T> = T | null | undefined;

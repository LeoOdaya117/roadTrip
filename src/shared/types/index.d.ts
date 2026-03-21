export interface User {
	id: string;
	email: string;
	name?: string;
}

export type Nullable<T> = T | null | undefined;

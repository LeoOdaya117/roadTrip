export type SavedPlaceKind = 'home' | 'work' | 'custom';

/** A device-local favorite destination with a user-facing shortcut name. */
export type SavedPlace = {
  id: string;
  kind: SavedPlaceKind;
  name: string;
  addressLabel: string;
  lat: number;
  lng: number;
};

/** Input for creating or updating a saved place. Home and Work names are fixed. */
export type SavedPlaceInput = {
  id?: string;
  kind: SavedPlaceKind;
  name?: string;
  addressLabel: string;
  lat: number;
  lng: number;
};

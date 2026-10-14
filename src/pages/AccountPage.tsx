import {
  IonContent,
  IonPage,
  IonToast,
  IonIcon,
  useIonViewWillEnter,
} from '@ionic/react';
import { pencilOutline } from 'ionicons/icons';
import { useRef, useState, useEffect } from 'react';
import { useRideStore } from '../store/rideStore';
import { loadUserProfile, saveUserProfile } from '../services/user';
import { useThemePreference } from '../context/useThemePreference';
import type { ThemePreference } from '../context/themePreference';
import AppHeader from '../components/AppHeader';
import { PLACE_SEARCH_ATTRIBUTION, searchPlaces, type PlaceSearchResult } from '../services/placeSearch';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { isAndroidPermissionSetupSupported, requestLocationPermissionSetup } from '../services/locationPermissions';
import type { SavedPlace, SavedPlaceKind } from '../types/savedPlace';

type SavedPlaceLocation = Pick<PlaceSearchResult, 'label' | 'lat' | 'lng'>;

const AccountPage: React.FC = () => {
  const currentUser = useRideStore((s) => s.currentUser);
  const updateCurrentUser = useRideStore((s) => s.updateCurrentUser);
  const { preference, setPreference } = useThemePreference();
  const {
    savedPlaces,
    isLoading: isSavedPlacesLoading,
    loadError: savedPlacesError,
    refresh: refreshSavedPlaces,
    save: saveSavedPlace,
    remove: removeSavedPlace,
  } = useSavedPlaces();

  useIonViewWillEnter(() => {
    void refreshSavedPlaces();
  });

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [placeKind, setPlaceKind] = useState<SavedPlaceKind>('home');
  const [placeName, setPlaceName] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [selectedPlaceLocation, setSelectedPlaceLocation] = useState<SavedPlaceLocation | null>(null);
  const [editingPlace, setEditingPlace] = useState<SavedPlace | null>(null);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [placeMutationError, setPlaceMutationError] = useState<string | null>(null);
  const [placeMutationStatus, setPlaceMutationStatus] = useState<string | null>(null);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const [removingPlaceId, setRemovingPlaceId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  useEffect(() => {
    const profile = loadUserProfile();
    setName(profile.name ?? currentUser?.name ?? '');
    setAvatarUrl(profile.avatarUrl ?? currentUser?.avatarUrl);
  }, [currentUser?.avatarUrl, currentUser?.name]);

  useEffect(() => {
    const normalized = placeQuery.trim();
    setPlaceResults([]);
    setPlaceSearchError(null);
    if (normalized.length < 2) {
      setIsSearchingPlaces(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearchingPlaces(true);
      void searchPlaces(normalized, { signal: controller.signal })
        .then((results) => {
          if (!controller.signal.aborted) setPlaceResults(results);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && !(error instanceof Error && error.name === 'AbortError')) {
            setPlaceSearchError(error instanceof Error ? error.message : 'Place search is unavailable.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingPlaces(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [placeQuery]);

  const resetSavedPlaceForm = () => {
    setEditingPlace(null);
    setPlaceKind('home');
    setPlaceName('');
    setPlaceQuery('');
    setPlaceResults([]);
    setSelectedPlaceLocation(null);
    setPlaceMutationError(null);
    setPlaceMutationStatus(null);
  };

  const editSavedPlace = (place: SavedPlace) => {
    setEditingPlace(place);
    setPlaceKind(place.kind);
    setPlaceName(place.kind === 'custom' ? place.name : '');
    setPlaceQuery('');
    setPlaceResults([]);
    setSelectedPlaceLocation({ label: place.addressLabel, lat: place.lat, lng: place.lng });
    setPlaceMutationError(null);
    setPlaceMutationStatus(null);
  };

  const handleSavePlace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = placeName.trim();
    if (!selectedPlaceLocation || ((editingPlace?.kind ?? placeKind) === 'custom' && !name)) return;
    const kind = editingPlace?.kind ?? placeKind;
    setPlaceMutationError(null);
    setPlaceMutationStatus(null);
    setIsSavingPlace(true);
    try {
      const savedPlace = await saveSavedPlace({
        ...(editingPlace ? { id: editingPlace.id } : {}),
        kind,
        ...(kind === 'custom' ? { name } : {}),
        addressLabel: selectedPlaceLocation.label,
        lat: selectedPlaceLocation.lat,
        lng: selectedPlaceLocation.lng,
      });
      resetSavedPlaceForm();
      setPlaceMutationStatus(`${editingPlace ? 'Updated' : 'Saved'} ${savedPlace.name}.`);
    } catch (error) {
      setPlaceMutationError(error instanceof Error ? error.message : 'Could not save this place.');
    } finally {
      setIsSavingPlace(false);
    }
  };

  const handleRemovePlace = async (place: SavedPlace) => {
    setRemovingPlaceId(place.id);
    setPlaceMutationError(null);
    setPlaceMutationStatus(null);
    try {
      await removeSavedPlace(place.id);
      setConfirmingRemoveId(null);
      if (editingPlace?.id === place.id) resetSavedPlaceForm();
      setPlaceMutationStatus(`Removed ${place.name}.`);
    } catch (error) {
      setPlaceMutationError(error instanceof Error ? error.message : 'Could not remove this place.');
    } finally {
      setRemovingPlaceId(null);
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaved(false);
    setSaveError(null);
    // Resize the image to avoid localStorage quota blowups
    const resizeToDataUrl = (file: File, maxWidth = 512, quality = 0.8): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const ratio = img.width / img.height || 1;
            const width = Math.min(maxWidth, img.width);
            const height = Math.round(width / ratio);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Cannot get canvas context'));
            ctx.drawImage(img, 0, 0, width, height);
            try {
              const dataUrl = canvas.toDataURL('image/jpeg', quality);
              resolve(dataUrl);
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = (err) => reject(err);
          img.src = reader.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
    };

    resizeToDataUrl(file).then((dataUrl) => setAvatarUrl(dataUrl)).catch(() => {
      // fallback to original data URL if resize fails
      const reader = new FileReader();
      reader.onload = (ev) => setAvatarUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl(undefined);
    setSaved(false);
    setSaveError(null);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaved(false);
    setSaveError(null);
    // The profile service treats `undefined` as "leave unchanged". An empty
    // string explicitly removes the saved avatar from local storage.
    const ok = saveUserProfile({ name: trimmedName, avatarUrl: avatarUrl ?? '' });
    if (!ok) {
      setSaveError('Failed to save profile — image may be too large. Try a smaller photo.');
      return;
    }
    if (currentUser) {
      updateCurrentUser({ ...currentUser, name: trimmedName, avatarUrl });
    }
    setSaved(true);
  };

  const initials = (name || 'R').slice(0, 2).toUpperCase();

  return (
    <IonPage>
      <AppHeader title="Account" backHref="/home" />

      <IonContent className="app-page page-content account-screen">
        <div className="page-hero account-intro">
          <h1>Your profile<br /><span>your name on the road.</span></h1>
          <p>Personalize your profile and appearance.</p>
        </div>

        {/* Avatar */}
        <div className="account-avatar-section">
          <button className="account-avatar-btn" onClick={handleAvatarClick} aria-label="Change profile photo">
            {avatarUrl ? (
              <img src={avatarUrl} className="account-avatar-img" alt="Profile" />
            ) : (
              <span className="account-avatar-initials">{initials}</span>
            )}
            <span className="account-avatar-edit-badge"><IonIcon icon={pencilOutline} aria-hidden="true" /></span>
          </button>
          <p className="account-avatar-hint">Tap to change photo</p>
          {avatarUrl && (
            <button className="account-remove-avatar" onClick={handleRemoveAvatar}>
              Remove photo
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label="Choose a profile photo"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Name */}
        <div className="glass-card">
          <label className="card-label" htmlFor="profile-name">Display name</label>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              id="profile-name"
              className="custom-input"
              type="text"
              placeholder="Enter your rider name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
                setSaveError(null);
              }}
              maxLength={30}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        <section className="theme-choice" aria-labelledby="theme-choice-title">
          <h2 id="theme-choice-title">Appearance</h2>
          <p>Choose how RoadTrip looks on this device.</p>
          <div className="theme-choice-options" role="group" aria-label="Color theme">
            {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
              <button
                key={option}
                type="button"
                className="theme-choice-option"
                aria-pressed={preference === option}
                onClick={() => setPreference(option)}
              >
                {option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </section>

        {isAndroidPermissionSetupSupported() && (
          <section className="theme-choice" aria-labelledby="ride-permissions-title">
            <h2 id="ride-permissions-title">Ride permissions</h2>
            <p>Set up location and notifications for recording with the screen locked.</p>
            <button type="button" onClick={requestLocationPermissionSetup}>Set up ride permissions</button>
          </section>
        )}

        <section className="account-saved-places" aria-labelledby="saved-places-title">
          <div className="account-saved-places-heading">
            <div>
              <h2 id="saved-places-title">Saved places</h2>
              <p>Keep Home, Work, and other favorites on this device for quick destination picks.</p>
            </div>
          </div>

          {savedPlacesError && (
            <div className="account-saved-places-error" role="alert">
              <span>{savedPlacesError}</span>
              <button type="button" onClick={() => void refreshSavedPlaces()}>Retry</button>
            </div>
          )}
          {isSavedPlacesLoading && <p className="account-saved-places-feedback" role="status">Loading saved places…</p>}
          {!isSavedPlacesLoading && !savedPlacesError && savedPlaces.length === 0 && (
            <p className="account-saved-places-feedback">No saved places yet. Add a place below to use it in ride setup and navigation.</p>
          )}

          {savedPlaces.length > 0 && (
            <div className="account-saved-place-list" aria-label="Your saved places">
              {savedPlaces.map((place) => (
                <article className="account-saved-place" key={place.id} aria-label={`${place.name} saved place`}>
                  <div className="account-saved-place-copy">
                    <span className="account-saved-place-kind">{place.kind === 'custom' ? 'CUSTOM PLACE' : place.kind.toUpperCase()}</span>
                    <strong>{place.name}</strong>
                    <span>{place.addressLabel}</span>
                  </div>
                  <div className="account-saved-place-actions">
                    <button type="button" className="btn-secondary" onClick={() => editSavedPlace(place)} aria-label={`Edit ${place.name}`}>Edit</button>
                    {confirmingRemoveId === place.id ? (
                      <>
                        <button type="button" className="btn-secondary" onClick={() => setConfirmingRemoveId(null)}>Cancel</button>
                        <button type="button" className="account-saved-place-remove" disabled={removingPlaceId === place.id} onClick={() => void handleRemovePlace(place)}>
                          {removingPlaceId === place.id ? 'Removing…' : `Confirm remove ${place.name}`}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="account-saved-place-remove" onClick={() => setConfirmingRemoveId(place.id)} aria-label={`Remove ${place.name}`}>Remove</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <form className="account-saved-place-form" onSubmit={(event) => void handleSavePlace(event)} aria-label={editingPlace ? `Edit ${editingPlace.name}` : 'Add a saved place'}>
            <h3>{editingPlace ? `Edit ${editingPlace.name}` : 'Add a saved place'}</h3>
            {editingPlace ? (
              <p className="account-saved-place-fixed-kind">{editingPlace.kind === 'custom' ? 'Custom place' : `${editingPlace.name} shortcut`}</p>
            ) : (
              <label className="account-saved-place-field">
                <span>Shortcut type</span>
                <select value={placeKind} onChange={(event) => {
                  setPlaceKind(event.target.value as SavedPlaceKind);
                  setPlaceMutationError(null);
                }}>
                  <option value="home">Home</option>
                  <option value="work">Work</option>
                  <option value="custom">Custom place</option>
                </select>
              </label>
            )}
            {(editingPlace?.kind ?? placeKind) === 'custom' && (
              <label className="account-saved-place-field">
                <span>Place name</span>
                <input
                  type="text"
                  value={placeName}
                  onChange={(event) => setPlaceName(event.target.value)}
                  placeholder="e.g. Weekend cabin"
                  maxLength={60}
                  autoComplete="off"
                  required
                />
              </label>
            )}
            <label className="account-saved-place-field" htmlFor="saved-place-search">
              <span>Search for a location</span>
              <input
                id="saved-place-search"
                type="search"
                value={placeQuery}
                onChange={(event) => {
                  setPlaceQuery(event.target.value);
                  setSelectedPlaceLocation(null);
                  setPlaceMutationError(null);
                  setPlaceMutationStatus(null);
                }}
                placeholder="Place, street, or address"
                autoComplete="off"
              />
            </label>
            <p className="account-saved-place-attribution">{PLACE_SEARCH_ATTRIBUTION}</p>
            {selectedPlaceLocation && (
              <p className="account-saved-place-selected" role="status">Selected location: {selectedPlaceLocation.label}</p>
            )}
            {isSearchingPlaces && <p className="account-saved-places-feedback" role="status">Searching places…</p>}
            {placeSearchError && <p className="account-saved-places-error" role="alert">{placeSearchError}</p>}
            {!isSearchingPlaces && placeQuery.trim().length >= 2 && !placeSearchError && placeResults.length === 0 && (
              <p className="account-saved-places-feedback" role="status">No places found.</p>
            )}
            {placeResults.length > 0 && (
              <div className="account-saved-place-results" role="listbox" aria-label="Location search results">
                {placeResults.map((result, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedPlaceLocation?.lat === result.lat && selectedPlaceLocation.lng === result.lng}
                    key={`${result.lat},${result.lng},${index}`}
                    onClick={() => {
                      setSelectedPlaceLocation({ label: result.label, lat: result.lat, lng: result.lng });
                      setPlaceQuery('');
                      setPlaceResults([]);
                      setPlaceSearchError(null);
                    }}
                  >
                    <strong>{result.label}</strong><span aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
            {(placeKind === 'home' || placeKind === 'work') && !editingPlace && savedPlaces.some((place) => place.kind === placeKind) && (
              <p className="account-saved-place-replace-note">Saving {placeKind === 'home' ? 'Home' : 'Work'} replaces the current shortcut.</p>
            )}
            {placeMutationError && <p className="account-saved-places-error" role="alert">{placeMutationError}</p>}
            {placeMutationStatus && <p className="account-saved-places-success" role="status">{placeMutationStatus}</p>}
            <div className="account-saved-place-form-actions">
              {editingPlace && <button type="button" className="btn-secondary" onClick={resetSavedPlaceForm} disabled={isSavingPlace}>Cancel edit</button>}
              <button type="submit" className="btn-primary" disabled={isSavingPlace || !selectedPlaceLocation || ((editingPlace?.kind ?? placeKind) === 'custom' && !placeName.trim())}>
                {isSavingPlace ? 'Saving…' : editingPlace ? 'Save changes' : `Save ${placeKind === 'custom' ? 'custom place' : placeKind === 'home' ? 'Home' : 'Work'}`}
              </button>
            </div>
          </form>
        </section>

        <button
          className="btn-primary account-save"
          onClick={handleSave}
          disabled={!name.trim()}
        >
          Save Profile
        </button>
        {saveError && <p className="home-inline-error" role="alert">{saveError}</p>}

        <IonToast
          isOpen={saved}
          message="Profile saved"
          duration={1800}
          color="success"
          onDidDismiss={() => setSaved(false)}
        />
      </IonContent>
    </IonPage>
  );
};

export default AccountPage;

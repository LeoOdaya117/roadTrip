import {
  IonContent,
  IonPage,
  IonToast,
  IonIcon,
} from '@ionic/react';
import { pencilOutline } from 'ionicons/icons';
import { useRef, useState, useEffect } from 'react';
import { useRideStore } from '../store/rideStore';
import { loadUserProfile, saveUserProfile } from '../services/user';
import { useThemePreference } from '../context/useThemePreference';
import type { ThemePreference } from '../context/themePreference';
import AppHeader from '../components/AppHeader';

const AccountPage: React.FC = () => {
  const currentUser = useRideStore((s) => s.currentUser);
  const updateCurrentUser = useRideStore((s) => s.updateCurrentUser);
  const { preference, setPreference } = useThemePreference();

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const profile = loadUserProfile();
    setName(profile.name ?? currentUser?.name ?? '');
    setAvatarUrl(profile.avatarUrl ?? currentUser?.avatarUrl);
  }, [currentUser?.avatarUrl, currentUser?.name]);

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

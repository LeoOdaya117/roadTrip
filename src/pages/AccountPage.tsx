import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonToast,
} from '@ionic/react';
import { useRef, useState, useEffect } from 'react';
import { useRideStore } from '../store/rideStore';
import { loadUserProfile, saveUserProfile } from '../services/user';

const AccountPage: React.FC = () => {
  const currentUser = useRideStore((s) => s.currentUser);
  const updateCurrentUser = useRideStore((s) => s.updateCurrentUser);

  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const profile = loadUserProfile();
    setName(profile.name ?? currentUser?.name ?? '');
    setAvatarUrl(profile.avatarUrl ?? currentUser?.avatarUrl);
  }, []);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

  const handleRemoveAvatar = () => setAvatarUrl(undefined);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setSaveError(null);
    const ok = saveUserProfile({ name: trimmedName, avatarUrl });
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
      <IonHeader>
        <IonToolbar className="app-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home" />
          </IonButtons>
          <IonTitle>Account</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="app-page page-content">
        {/* Avatar */}
        <div className="account-avatar-section">
          <button className="account-avatar-btn" onClick={handleAvatarClick} aria-label="Change profile photo">
            {avatarUrl ? (
              <img src={avatarUrl} className="account-avatar-img" alt="Profile" />
            ) : (
              <span className="account-avatar-initials">{initials}</span>
            )}
            <span className="account-avatar-edit-badge">✎</span>
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
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* Name */}
        <div className="glass-card">
          <span className="card-label">Display Name</span>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <input
              className="custom-input"
              type="text"
              placeholder="Your rider name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={!name.trim()}
        >
          Save Profile
        </button>

        <IonToast
          isOpen={saved}
          message="Profile saved"
          duration={1800}
          color="success"
          onDidDismiss={() => setSaved(false)}
        />
        <IonToast
          isOpen={!!saveError}
          message={saveError ?? ''}
          duration={3500}
          color="warning"
          onDidDismiss={() => setSaveError(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default AccountPage;

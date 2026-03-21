import React, { useState } from 'react';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonLoading,
  IonText,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import './Login.css';
import HeroIllustration from './HeroIllustration';
import googleIcon from '../../assets/icons/Google.svg.png';
import facebookIcon from '../../assets/icons/facebook.svg.png';
import { useGlobalUI } from '../../shared/ui/GlobalUIProvider';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useGlobalUI();
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});

  const auth = useAuth();
  const history = useHistory();

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
      try {
      const res = await auth.register(email, password, name || undefined);
      if (res && (res as any).success) {
        history.replace('/tab1');
      } else {
        const errs = (res as any).errors as Record<string,string[]> | undefined;
        if (errs) {
          const mapped: Record<string,string> = {};
          Object.entries(errs).forEach(([k, v]) => {
            const key = k === 'username' ? 'email' : k;
            mapped[key] = v.join('; ');
          });
          setFieldErrors(mapped);
        }
        showToast({ message: (res as any).message || 'Sign up failed — try a different email', duration: 3000 });
      }
    } catch (err) {
      console.error('Signup error', err);
      showToast({ message: 'Sign up failed — unexpected error', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  const social = async (provider: 'google' | 'facebook') => {
    setLoading(true);
    try {
      await auth.socialLogin(provider);
      history.replace('/tab1');
    } catch (err) {
      console.error('Social signup error', err);
      showToast({ message: 'Social sign up failed', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen className="login-page">
        <div className="login-card modern">
          <div className="hero-illustration" aria-hidden>
            <HeroIllustration />
          </div>
          <h1 className="title">Create account</h1>
          <p className="subtitle">Start planning your next ride — it's free and easy.</p>

          <form onSubmit={submit} className="login-form">
            <IonItem>
              <IonLabel position="stacked">Full name</IonLabel>
              <IonInput value={name} onIonChange={e => { setName(e.detail.value || ''); setFieldErrors(f => ({ ...f, name: '' })); }} type="text" />
              {fieldErrors.name ? <div className="field-error">{fieldErrors.name}</div> : null}
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput value={email} onIonChange={e => { setEmail(e.detail.value || ''); setFieldErrors(f => ({ ...f, email: '' })); }} type="email" />
              {fieldErrors.email ? <div className="field-error">{fieldErrors.email}</div> : null}
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput value={password} onIonChange={e => { setPassword(e.detail.value || ''); setFieldErrors(f => ({ ...f, password: '' })); }} type="password" />
              {fieldErrors.password ? <div className="field-error">{fieldErrors.password}</div> : null}
            </IonItem>

            <IonButton expand="block" type="submit" className="primary-button">Create account</IonButton>
          </form>

          <div className="divider"><span>or</span></div>

          <div className="social-buttons">
            <button type="button" className="social-icon" onClick={() => social('google')}>
              <img src={googleIcon} alt="Continue with Google" />
            </button>
            <button type="button" className="social-icon" onClick={() => social('facebook')}>
              <img src={facebookIcon} alt="Continue with Facebook" />
            </button>
          </div>

          <div className="footer-actions">
            <IonText>Already have an account?</IonText>
            <IonButton fill="clear" onClick={() => history.push('/login')}>Sign in</IonButton>
          </div>
        </div>

        <IonLoading isOpen={loading} message={'Creating account...'} />
      </IonContent>
    </IonPage>
  );
};

export default Signup;

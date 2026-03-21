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

const Login: React.FC = () => {
  const [email, setEmail] = useState('test@local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useGlobalUI();
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  

  const auth = useAuth();
  const history = useHistory();

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
      try {
      const res = await auth.login(email, password);
      if (res && (res as any).success) {
        history.replace('/tab1');
      } else {
        // map server field errors to inputs
        const errs = (res as any).errors as Record<string,string[]> | undefined;
        if (errs) {
          const mapped: Record<string,string> = {};
          // backend uses 'username' for the login field -> map to 'email'
          Object.entries(errs).forEach(([k, v]) => {
            const key = k === 'username' ? 'email' : k;
            mapped[key] = v.join('; ');
          });
          setFieldErrors(mapped);
        }
        showToast({ message: (res as any).message || 'Sign in failed — check credentials', duration: 3000 });
      }
    } catch (err) {
      console.error('Login error', err);
      showToast({ message: 'Sign in failed — unexpected error', duration: 3000 });
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
      console.error('Social login error', err);
      showToast({ message: 'Social sign in failed', duration: 3000 });
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
          <h1 className="title">RoadTrip</h1>
          <p className="subtitle">Ride together — plan routes, share photos, and keep a riding diary.</p>

          <form onSubmit={submit} className="login-form">

            <IonItem>
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput value={email} onIonChange={e => { setEmail(e.detail.value || ''); setFieldErrors(f => ({ ...f, email: '' })); }} type="text" />
              {fieldErrors.email ? <div className="field-error">{fieldErrors.email}</div> : null}
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput value={password} onIonChange={e => { setPassword(e.detail.value || ''); setFieldErrors(f => ({ ...f, password: '' })); }} type="password" />
              {fieldErrors.password ? <div className="field-error">{fieldErrors.password}</div> : null}
            </IonItem>

            <IonButton expand="block" type="submit" className="primary-button">Sign in</IonButton>
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
            <IonText>Don't have an account?</IonText>
            <IonButton fill="clear" onClick={() => history.push('/signup')}>Sign up</IonButton>
          </div>
        </div>

        <IonLoading isOpen={loading} message={'Signing in...'} />
      </IonContent>
    </IonPage>
  );
};

export default Login;

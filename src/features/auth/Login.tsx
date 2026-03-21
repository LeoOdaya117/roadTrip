import React, { useState } from 'react';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonLabel,
  IonPage,
  IonLoading,
  IonToast,
  IonText,
} from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthProvider';
import './Login.css';
import HeroIllustration from './HeroIllustration';
import googleIcon from '../../assets/icons/Google.svg.png';
import facebookIcon from '../../assets/icons/facebook.svg.png';

const Login: React.FC = () => {
  const [email, setEmail] = useState('test@local');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  

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
        setToast((res as any).message || 'Sign in failed — check credentials');
      }
    } catch (err) {
      console.error('Login error', err);
      setToast('Sign in failed — unexpected error');
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
      setToast('Social sign in failed');
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
              <IonInput value={email} onIonChange={e => setEmail(e.detail.value || '')} type="text" />
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput value={password} onIonChange={e => setPassword(e.detail.value || '')} type="password" />
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
        <IonToast isOpen={!!toast} message={toast || ''} duration={2000} onDidDismiss={() => setToast(null)} />
      </IonContent>
    </IonPage>
  );
};

export default Login;

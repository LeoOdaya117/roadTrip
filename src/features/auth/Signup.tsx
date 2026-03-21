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

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        setToast((res as any).message || 'Sign up failed — try a different email');
      }
    } catch (err) {
      console.error('Signup error', err);
      setToast('Sign up failed — unexpected error');
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
      setToast('Social sign up failed');
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
              <IonInput value={name} onIonChange={e => setName(e.detail.value || '')} type="text" />
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Email</IonLabel>
              <IonInput value={email} onIonChange={e => setEmail(e.detail.value || '')} type="email" />
            </IonItem>

            <IonItem>
              <IonLabel position="stacked">Password</IonLabel>
              <IonInput value={password} onIonChange={e => setPassword(e.detail.value || '')} type="password" />
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
        <IonToast isOpen={!!toast} message={toast || ''} duration={2000} onDidDismiss={() => setToast(null)} />
      </IonContent>
    </IonPage>
  );
};

export default Signup;

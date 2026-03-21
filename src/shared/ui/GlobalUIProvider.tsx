import React, { createContext, useContext, useState } from 'react';
import { IonToast, IonModal, IonContent, IonButton } from '@ionic/react';

type ToastOptions = { message: string; duration?: number; color?: string; position?: 'top'|'bottom'|'middle' };
type ModalOptions = { content: React.ReactNode; onDidDismiss?: () => void };

interface GlobalUIContextValue {
  showToast: (opts: ToastOptions) => void;
  showModal: (opts: ModalOptions) => void;
  hideModal: () => void;
}

const GlobalUIContext = createContext<GlobalUIContextValue | undefined>(undefined);

export const GlobalUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [modal, setModal] = useState<ModalOptions | null>(null);

  const showToast = (opts: ToastOptions) => setToast({ duration: opts.duration ?? 2000, position: opts.position ?? 'bottom', ...opts });
  const showModal = (opts: ModalOptions) => setModal(opts);
  const hideModal = () => {
    try { modal?.onDidDismiss?.(); } catch {}
    setModal(null);
  };

  return (
    <GlobalUIContext.Provider value={{ showToast, showModal, hideModal }}>
      {children}

      <IonToast
        isOpen={!!toast}
        message={toast?.message || ''}
        duration={toast?.duration}
        position={toast?.position}
        color={toast?.color}
        onDidDismiss={() => setToast(null)}
      />

      <IonModal isOpen={!!modal} onDidDismiss={() => { modal?.onDidDismiss?.(); setModal(null); }}>
        <IonContent>
          {modal?.content}
          <div style={{ padding: 16, textAlign: 'center' }}>
            <IonButton onClick={() => setModal(null)}>Close</IonButton>
          </div>
        </IonContent>
      </IonModal>
    </GlobalUIContext.Provider>
  );
};

export function useGlobalUI() {
  const ctx = useContext(GlobalUIContext);
  if (!ctx) throw new Error('useGlobalUI must be used within GlobalUIProvider');
  return ctx;
}

export default GlobalUIProvider;

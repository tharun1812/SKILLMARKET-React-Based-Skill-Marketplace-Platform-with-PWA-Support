import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import toast, { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppProvider from './context/AppProvider';
import './index.css';
import { registerServiceWorker } from './lib/pwa';
import { createService } from './lib/supabase';

const service = createService();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider service={service}>
        <App />
        <Toaster position="bottom-center" containerStyle={{ bottom: 84 }} toastOptions={{ duration: 3500 }} />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorker((activate) => {
  toast((t) => (
    <span className="flex items-center gap-3">
      A new version is ready.
      <button type="button" className="rounded bg-teal-700 px-2 py-1 font-semibold text-white" onClick={() => { toast.dismiss(t.id); activate(); }}>Refresh</button>
    </span>
  ), { duration: Infinity });
});

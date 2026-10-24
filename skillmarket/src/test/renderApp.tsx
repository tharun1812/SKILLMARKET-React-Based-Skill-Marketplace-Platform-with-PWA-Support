import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'react-hot-toast';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import AppProvider from '../context/AppProvider';
import { LocalService, MemoryStorage } from '../lib/localService';
import type { Service } from '../lib/service';

export function makeService(): LocalService {
  return new LocalService({ storage: new MemoryStorage() });
}

export function renderApp(path = '/', service: Service = makeService()) {
  const user = userEvent.setup();
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider service={service}>
        <App />
        <Toaster />
      </AppProvider>
    </MemoryRouter>,
  );
  return { user, service, ...utils };
}

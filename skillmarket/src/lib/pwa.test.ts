// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}

class FakeContainer extends EventTarget {
  controller: object | null = {};
  registration = new FakeRegistration();
  register = vi.fn<(url: string) => Promise<FakeRegistration>>(async () => this.registration);
}

let container: FakeContainer;
const reload = vi.fn();

async function load(prod: boolean) {
  vi.resetModules();
  vi.stubEnv('PROD', prod);
  return (await import('./pwa')).registerServiceWorker;
}
const fireLoad = async () => { window.dispatchEvent(new Event('load')); await new Promise((r) => setTimeout(r, 0)); };

// registerServiceWorker listens for window 'load'. Remove those listeners after each test so one test's
// registration is not triggered again by the next test's simulated page load.
const loadListeners: EventListener[] = [];
const realAdd = window.addEventListener.bind(window);

beforeEach(() => {
  vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    if (type === 'load') loadListeners.push(fn as EventListener);
    realAdd(type, fn, opts);
  });
  container = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
  reload.mockClear();
});
afterEach(() => {
  loadListeners.splice(0).forEach((fn) => window.removeEventListener('load', fn));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registerServiceWorker', () => {
  it('does nothing in development builds', async () => {
    (await load(false))(() => undefined);
    await fireLoad();
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing in browsers without service workers', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const register = await load(true);
    expect(() => register(() => undefined)).not.toThrow();
  });

  it('registers /sw.js once the page has loaded (production)', async () => {
    (await load(true))(() => undefined);
    expect(container.register).not.toHaveBeenCalled();                 // waits for the load event
    await fireLoad();
    expect(container.register).toHaveBeenCalledWith('/sw.js');
  });

  it('announces an update that is already waiting, and activating it sends SKIP_WAITING', async () => {
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    const onUpdate = vi.fn();
    (await load(true))(onUpdate);
    await fireLoad();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    onUpdate.mock.calls[0][0]();                                        // the "Refresh" button
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('announces a newly installed worker when an older one controls the page', async () => {
    const onUpdate = vi.fn();
    (await load(true))(onUpdate);
    await fireLoad();
    const worker = new FakeWorker();
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installing';
    worker.dispatchEvent(new Event('statechange'));
    expect(onUpdate).not.toHaveBeenCalled();                            // still installing
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('stays quiet on the very first install (nothing to update from)', async () => {
    container.controller = null;
    const onUpdate = vi.fn();
    (await load(true))(onUpdate);
    await fireLoad();
    const worker = new FakeWorker();
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('reloads exactly once when the new worker takes control', async () => {
    (await load(true))(() => undefined);
    await fireLoad();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('survives a failed registration', async () => {
    container.register = vi.fn(async () => { throw new Error('blocked'); });
    (await load(true))(() => undefined);
    await expect(fireLoad()).resolves.toBeUndefined();
  });
});

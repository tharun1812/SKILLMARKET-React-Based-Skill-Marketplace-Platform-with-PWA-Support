// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, LocalService, MemoryStorage } from './lib/localService';
import { ServiceError } from './lib/service';
import { makeService, renderApp } from './test/renderApp';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function signedIn(email: string) {
  const service = makeService();
  await service.signIn(email, DEMO_PASSWORD);
  return service;
}

describe('public pages', () => {
  it('landing shows the pitch, demo hint and the latest skills', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { name: /trade skills, not money/i })).toBeInTheDocument();
    expect(screen.getByText(/ana@demo.edu/)).toBeInTheDocument();
    expect((await screen.findAllByRole('article')).length).toBe(6);
  });

  it('shows a friendly 404 page', async () => {
    renderApp('/no/such/page');
    expect(await screen.findByRole('heading', { name: /could not find that page/i })).toBeInTheDocument();
  });

  it('shows the offline banner when the browser goes offline', async () => {
    renderApp('/');
    expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(await screen.findByText(/you are offline/i)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument());
  });
});

describe('authentication', () => {
  it('redirects signed-out visitors from protected pages to sign in, then back after login', async () => {
    const { user } = renderApp('/requests');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /fill in the demo account/i }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Requests' })).toBeInTheDocument();
  });

  it('signs in with the demo account and shows the personal dashboard', async () => {
    const { user } = renderApp('/dashboard');
    await user.click(await screen.findByRole('button', { name: /fill in the demo account/i }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: /hi, ana/i })).toBeInTheDocument();
    expect(screen.getByText('Skills offered')).toBeInTheDocument();
  });

  it('shows an error for a wrong password and stays on the page', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email'), 'ana@demo.edu');
    await user.type(screen.getByLabelText('Password'), 'not-the-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('validates registration fields, then creates the account and lands on the dashboard', async () => {
    const { user } = renderApp('/register');
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Full name'), 'Nora Newcomer');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'nora@uni.edu');
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: /hi, nora/i })).toBeInTheDocument();
  });

  it('signs out', async () => {
    const service = await signedIn('ana@demo.edu');
    const { user } = renderApp('/dashboard', service);
    await screen.findByRole('heading', { name: /hi, ana/i });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: /trade skills/i })).toBeInTheDocument();
    expect(await service.getSession()).toBeNull();
  });
});

describe('marketplace', () => {
  it('searches, filters by type and shows an empty state', async () => {
    const { user } = renderApp('/marketplace');
    expect(await screen.findByText('12 results')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search skills'), 'python');
    expect(await screen.findByText('2 results')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wanted' }));
    expect(await screen.findByText('1 result')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search skills'));
    await user.type(screen.getByLabelText('Search skills'), 'zzzz');
    expect(await screen.findByText(/no skills match your search/i)).toBeInTheDocument();
  });

  it('filters by category', async () => {
    const { user } = renderApp('/marketplace');
    await screen.findByText('12 results');
    await user.selectOptions(screen.getByLabelText('Category'), 'Cooking');
    expect(await screen.findByText('2 results')).toBeInTheDocument();
  });

  it('shows the last saved results with a notice when the network fails', async () => {
    const first = renderApp('/marketplace');
    await screen.findByText('12 results');
    first.unmount();

    class Offline extends LocalService {
      async listSkills(): Promise<never> { throw new ServiceError('network', 'offline'); }
    }
    renderApp('/marketplace', new Offline({ storage: new MemoryStorage() }));
    expect(await screen.findByText(/you are offline: showing results saved/i)).toBeInTheDocument();
    expect(await screen.findByText('12 results')).toBeInTheDocument();
  });
});

describe('requesting a skill', () => {
  it('lets a signed-in student request a skill; guests are asked to sign in', async () => {
    const guest = renderApp('/marketplace');
    await guest.user.click(await screen.findByRole('link', { name: 'Python for beginners' }));
    expect(await screen.findByRole('link', { name: /sign in to send a request/i })).toBeInTheDocument();
    guest.unmount();

    const service = await signedIn('chen@demo.edu');
    const { user } = renderApp('/marketplace', service);
    await user.click(await screen.findByRole('link', { name: 'Python for beginners' }));
    await user.click(await screen.findByRole('button', { name: 'Request this skill' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('Message must be 5 to 500 characters.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/message to ana lopez/i), 'Could we start on Monday?');
    await user.type(within(dialog).getByLabelText(/offer in return/i), 'Calculus tutoring');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('button', { name: 'Request sent' })).toBeDisabled();
    const { outgoing } = await service.listRequests();
    expect(outgoing.find((r) => r.skill_title === 'Python for beginners')).toMatchObject({ status: 'pending', offered_in_return: 'Calculus tutoring' });
  });

  it('does not offer the request button on your own skill', async () => {
    const service = await signedIn('ana@demo.edu');
    const { user } = renderApp('/my-skills', service);
    await user.click(await screen.findByRole('link', { name: 'Python for beginners' }));
    expect(await screen.findByRole('link', { name: /manage in my skills/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request this skill/i })).not.toBeInTheDocument();
  });
});

describe('handling requests and reviews', () => {
  it('accepted request: mark completed, then leave a review', async () => {
    const service = await signedIn('chen@demo.edu');
    const { user } = renderApp('/requests', service);
    expect(await screen.findByText('Dara Okafor')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark completed' }));
    expect(await screen.findByText('Completed')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Leave a review' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    expect(await within(dialog).findByText(/choose a rating/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: '5 stars' }));
    await user.type(within(dialog).getByLabelText(/comment/i), 'Great cook!');
    await user.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByText(/you reviewed this exchange/i)).toBeInTheDocument();
    const dara = (await service.listSkills({ search: 'jollof' }))[0].owner_id;
    expect((await service.listReviewsFor(dara))[0]).toMatchObject({ rating: 5, comment: 'Great cook!' });
  });

  it('a pending request is accepted by the owner, then cancelled by the requester', async () => {
    const service = makeService();                                      // one shared database for both people
    await service.signIn('ben@demo.edu', DEMO_PASSWORD);                // Ana asked Ben for Figma help
    const owner = renderApp('/requests', service);
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();   // the owner cannot cancel a pending request
    await owner.user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    owner.unmount();

    await service.signIn('ana@demo.edu', DEMO_PASSWORD);
    const requester = renderApp('/requests', service);
    await requester.user.click(await screen.findByRole('tab', { name: 'Sent' }));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    await requester.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument();
  });

  it('shows the empty state when you have sent no requests', async () => {
    const service = makeService();
    await service.signUp('fresh@uni.edu', 'long-enough-1', 'Fresh Student');
    const { user } = renderApp('/requests', service);
    await user.click(await screen.findByRole('tab', { name: 'Sent' }));
    expect(await screen.findByText(/you have not sent any requests/i)).toBeInTheDocument();
  });

  it('declining removes the action buttons', async () => {
    const service = await signedIn('ben@demo.edu');
    const { user } = renderApp('/requests', service);
    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Declined')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });
});

describe('my skills and profile', () => {
  it('adds a skill with validation, then deletes it after confirming', async () => {
    const service = await signedIn('dara@demo.edu');
    const { user } = renderApp('/my-skills', service);
    await user.click(await screen.findByRole('button', { name: /add a skill/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'ab');
    await user.click(within(dialog).getByRole('button', { name: 'Post skill' }));
    expect(await within(dialog).findByText('Title must be 3 to 80 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Description must be 10 to 1000 characters.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Title'));
    await user.type(within(dialog).getByLabelText('Title'), 'Budgeting for students');
    await user.type(within(dialog).getByLabelText('Description'), 'Build a simple monthly budget in a spreadsheet.');
    await user.type(within(dialog).getByLabelText(/tags/i), 'money, excel');
    await user.click(within(dialog).getByRole('button', { name: 'Post skill' }));
    expect(await screen.findByRole('link', { name: 'Budgeting for students' })).toBeInTheDocument();
    expect((await service.listSkills({ search: 'budgeting' }))[0].tags).toEqual(['money', 'excel']);

    await user.click(screen.getByRole('button', { name: 'Delete Budgeting for students' }));
    await user.click(await screen.findByRole('button', { name: 'Delete skill' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Budgeting for students' })).not.toBeInTheDocument());
  });

  it('renders dialogs in a portal on <body>, outside the page layout (regression: space-y margins shifted the overlay)', async () => {
    const service = await signedIn('dara@demo.edu');
    const { user } = renderApp('/my-skills', service);
    await user.click(await screen.findByRole('button', { name: /add a skill/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('main')).toBeNull();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('edits an existing skill', async () => {
    const service = await signedIn('ben@demo.edu');
    const { user } = renderApp('/my-skills', service);
    await user.click(await screen.findByRole('button', { name: 'Edit Figma and UI design basics' }));
    const dialog = screen.getByRole('dialog');
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Figma masterclass');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('link', { name: 'Figma masterclass' })).toBeInTheDocument();
  });

  it('edits the profile and shows demo-mode controls', async () => {
    const service = await signedIn('ana@demo.edu');
    const { user } = renderApp('/profile', service);
    const uni = await screen.findByLabelText('University');
    await user.clear(uni);
    await user.type(uni, 'Metro Tech');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Metro Tech', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset demo data/i })).toBeInTheDocument();
  });

  it('shows someone else\'s public profile without edit controls', async () => {
    const service = await signedIn('ana@demo.edu');
    const ben = (await service.listSkills({ search: 'Figma' }))[0].owner_id;
    renderApp(`/u/${ben}`, service);
    expect(await screen.findByRole('heading', { name: 'Ben Carter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save profile' })).not.toBeInTheDocument();
    expect(screen.getByText(/quick learner and great company/i)).toBeInTheDocument();
  });
});

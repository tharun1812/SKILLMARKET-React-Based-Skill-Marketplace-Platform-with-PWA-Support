import { Link } from 'react-router-dom';
import { buttonClass } from '../components/styles';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-6xl font-extrabold text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-bold">We could not find that page</h1>
      <p className="mt-2 text-slate-600">It may have moved, or the link is wrong.</p>
      <Link to="/" className={`${buttonClass()} mt-6`}>Back to home</Link>
    </div>
  );
}

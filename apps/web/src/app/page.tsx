import { redirect } from 'next/navigation';

/** The app has no landing page: the proxy sends signed-out visitors to /login first. */
export default function Home() {
  redirect('/documents');
}

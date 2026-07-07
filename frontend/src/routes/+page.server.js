import { redirect } from '@sveltejs/kit';
import { pb } from '$lib/pocketbase';

export async function load() {
  try {
    const activeEvent = await pb.collection('events').getFirstListItem('active = true');

    if (activeEvent) {
      console.log(`Active event detected: "${activeEvent.name}"`);

      await fetch(`http://localhost:5173/api/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: activeEvent.network_mode })
      });

      throw redirect(307, '/booth');
    }
  } catch (error) {
    if (error.status !== 404) console.error('[SYSTEM ERROR]', error);
  }

  throw redirect(307, '/login');
}

import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export async function POST({ request }) {
  try {
    const { mode } = await request.json();

    if (!['AP', 'LAN', 'WAN'].includes(mode)) {
      return json({ success: false, error: 'INVALID_MODE' }, { status: 400 });
    }
    try {
      console.log(`Simulatie voor mode: ${mode}`);
    } catch (bashError) {
      console.error('/api/network error:', bashError);
    }

    return json({
      success: true,
      mode,
      message: `Network mode successfully set to ${mode}`
    });
  } catch (error) {
    console.error('/api/network error:', error);
    return json({ success: false, error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}

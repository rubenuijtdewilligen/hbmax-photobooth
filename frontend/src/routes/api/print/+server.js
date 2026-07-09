import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = promisify(exec);

export async function POST({ request }) {
  try {
    const { sessionId, printStripFilename } = await request.json();

    if (!sessionId || !printStripFilename) {
      return json({ success: false, error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const collectionId = 'pbc_3660498186';
    const pbStoragePath = path.resolve(
      process.env.HOME || '/home/hbmax',
      `pocketbase/pb_data/storage/${collectionId}/${sessionId}/${printStripFilename}`
    );

    console.log(`Received print request for session: ${sessionId}`);
    console.log(`Path: ${pbStoragePath}`);

    const isPi = process.platform === 'linux';

    if (isPi) {
      if (!fs.existsSync(pbStoragePath)) {
        console.error(`File not found: ${pbStoragePath}`);
        return json({ success: false, error: 'FILE_NOT_FOUND_ON_DISK' }, { status: 404 });
      }

      const printerName = 'dnp01';
      const command = `lp -d ${printerName} -o media=w288h432-div2 -o fit-to-page "${pbStoragePath}"`;

      console.log(`Executing system command: ${command}`);
      const { stdout, stderr } = await execPromise(command);

      if (stderr) console.warn(`CUPS warning: ${stderr}`);
      console.log(`CUPS success: ${stdout}`);

      return json({ success: true, message: 'Printopdracht verzonden naar DNP DS620', stdout });
    } else {
      console.log(`Simulation mode. File would have been printed on Pi.`);
      return json({
        success: true,
        simulated: true,
        message: `Simulatie succesvol. Pad op Pi zou zijn: ${pbStoragePath}`
      });
    }
  } catch (error) {
    console.error('Error while processing print request:', error);
    return json(
      { success: false, error: 'INTERNAL_SERVER_ERROR', details: error.message },
      { status: 500 }
    );
  }
}

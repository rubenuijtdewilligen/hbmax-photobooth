import PocketBase from 'pocketbase';
import { browser } from '$app/environment';

const backendUrl = browser
  ? `${window.location.protocol}//${window.location.hostname}:8090`
  : 'http://127.0.0.1:8090';

export const pb = new PocketBase(backendUrl);

console.log(`PocketBase connected to: ${backendUrl}`);

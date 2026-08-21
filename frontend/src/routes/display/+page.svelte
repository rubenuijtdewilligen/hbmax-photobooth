<script>
  import { onMount } from 'svelte';
  import PocketBase from 'pocketbase';
  import { browser } from '$app/environment';

  const PI_BACKEND = browser
    ? `${window.location.protocol}//${window.location.hostname}:8090`
    : 'http://127.0.0.1:8090';

  const CLOUD_BACKEND = 'https://hbmaxbooth-pb.c.rbnu.nl';

  let pbPi = new PocketBase(PI_BACKEND);
  let pbCloud = new PocketBase(CLOUD_BACKEND);

  let currentImagesToShow = $state([]);
  let imageSourceLabel = $state('');
  let showInterruptOverlay = $state(false);

  let historicalSessions = $state([]);
  let slideshowIndex = $state(0);
  let backgroundKey = $state(0);

  let interruptTimeout = null;

  onMount(async () => {
    try {
      const activeEvent = await pbPi.collection('events').getFirstListItem('active = true');
      if (activeEvent) {
        const localSessions = await pbPi.collection('sessions').getFullList({
          filter: `event = "${activeEvent.id}" && printed = true`,
          sort: '-created'
        });

        historicalSessions = localSessions.map((s) => ({
          id: s.id,
          isCloud: false,
          urls: s.photos.map((p) => `${PI_BACKEND}/api/files/${s.collectionId}/${s.id}/${p}`)
        }));
      }
    } catch (err) {
      console.log('Wachten op foto’s...', err);
    }

    const slideshowInterval = setInterval(() => {
      if (historicalSessions.length > 0 && !showInterruptOverlay) {
        slideshowIndex = (slideshowIndex + 1) % historicalSessions.length;
        backgroundKey++;
      }
    }, 6000);

    try {
      await pbPi.collection('sessions').subscribe('*', (e) => {
        if ((e.action === 'update' || e.action === 'create') && e.record.printed === true) {
          if (e.record.photos && e.record.photos.length > 0) {
            const photoUrls = e.record.photos.map(
              (p) => `${PI_BACKEND}/api/files/${e.record.collectionId}/${e.record.id}/${p}`
            );
            const newSessionObj = { id: e.record.id, isCloud: false, urls: photoUrls };
            historicalSessions = [newSessionObj, ...historicalSessions];
            triggerInterrupt(photoUrls, '📸 Live vanuit de Fotobooth!');
          }
        }
      });
    } catch (err) {
      console.error(err);
    }

    try {
      await pbCloud.collection('sessions').subscribe('*', (e) => {
        if (e.action === 'create' && e.record.photos && e.record.photos.length > 0) {
          const selfieUrl = `${CLOUD_BACKEND}/api/files/${e.record.collectionId}/${e.record.id}/${e.record.photos[0]}`;
          const newCloudObj = { id: e.record.id, isCloud: true, urls: [selfieUrl] };
          historicalSessions = [newCloudObj, ...historicalSessions];
          triggerInterrupt([selfieUrl], '📱 Live Gasten Selfie');
        }
      });
    } catch (err) {
      console.error(err);
    }

    return () => {
      clearInterval(slideshowInterval);
      if (interruptTimeout) clearTimeout(interruptTimeout);
      pbPi.collection('sessions').unsubscribe('*');
      pbCloud.collection('sessions').unsubscribe('*');
    };
  });

  function triggerInterrupt(urls, sourceName) {
    if (interruptTimeout) clearTimeout(interruptTimeout);

    currentImagesToShow = urls;
    imageSourceLabel = sourceName;
    showInterruptOverlay = true;

    interruptTimeout = setTimeout(() => {
      showInterruptOverlay = false;
      interruptTimeout = null;
    }, 8000);
  }
</script>

<div
  class="min-h-screen bg-[#0B3B3C] font-sans text-white relative flex flex-col items-center justify-center p-4 overflow-hidden select-none"
>
  <div class="absolute top-6 left-6 z-20">
    <img src="/vf-logo.png" alt="V&F Logo" class="h-24 w-auto drop-shadow-lg" />
  </div>

  {#if !showInterruptOverlay}
    {#if historicalSessions.length > 0}
      {#key backgroundKey}
        <div
          class="absolute inset-0 flex items-center justify-center p-4 transition-all duration-700 ease-in-out w-full h-full"
        >
          {#if historicalSessions[slideshowIndex].urls.length === 3}
            <div class="relative w-full max-w-5xl h-[90vh] flex items-center justify-center">
              <div
                class="absolute left-[6%] top-[8%] w-[50%] bg-[#08292A] border-4 border-[#D4AF37] p-2 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden -rotate-6 z-10"
              >
                <img
                  src={historicalSessions[slideshowIndex].urls[0]}
                  alt="Dia 1"
                  class="w-full h-full object-cover rounded-xl"
                />
              </div>

              <div
                class="absolute right-[4%] top-[22%] w-[52%] bg-[#08292A] border-4 border-[#D4AF37] p-2 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden rotate-4 z-20"
              >
                <img
                  src={historicalSessions[slideshowIndex].urls[1]}
                  alt="Dia 2"
                  class="w-full h-full object-cover rounded-xl"
                />
              </div>

              <div
                class="absolute left-[14%] bottom-[6%] w-[54%] bg-[#08292A] border-4 border-[#D4AF37] p-2 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden -rotate-3 z-30"
              >
                <img
                  src={historicalSessions[slideshowIndex].urls[2]}
                  alt="Dia 3"
                  class="w-full h-full object-cover rounded-xl"
                />
              </div>
            </div>
          {:else}
            <div
              class="bg-[#08292A] border-4 border-[#D4AF37] p-3 shadow-2xl rounded-2xl h-[85vh] aspect-3/2 overflow-hidden rotate-2 flex justify-center items-center"
            >
              <img
                src={historicalSessions[slideshowIndex].urls[0]}
                alt="Dia cloud"
                class="w-full h-full object-cover rounded-xl"
              />
            </div>
          {/if}
        </div>
      {/key}
    {:else}
      <div
        class="w-full max-w-md bg-[#08292A] border-2 border-[#D4AF37] p-8 shadow-2xl flex flex-col items-center gap-4 rounded-3xl text-center z-10"
      >
        <div
          class="bg-[#E5BA5A] text-[#0B3B3C] px-5 py-1.5 font-black text-xs uppercase tracking-wider rounded-full"
        >
          📸 V&F Food & Events
        </div>
        <p class="text-base font-bold text-white leading-snug">Wachten op de eerste foto's...</p>
        <p class="text-xs text-[#E5BA5A]/80 uppercase tracking-wide">
          Maak een fotostrip bij de booth of stuur direct een selfie via de QR-code!
        </p>
      </div>
    {/if}
  {/if}

  {#if showInterruptOverlay}
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-md flex flex-col items-center justify-center z-40 p-4 animate-fade-in w-full h-full"
    >
      <div
        class="absolute top-6 bg-[#E5BA5A] text-[#0B3B3C] font-black text-sm px-8 py-2.5 border-2 border-[#D4AF37] uppercase tracking-widest shadow-2xl rounded-full z-50"
      >
        {imageSourceLabel}
      </div>

      {#if currentImagesToShow.length === 3}
        <div class="relative w-full max-w-6xl h-[92vh] flex items-center justify-center mt-6">
          <div
            class="absolute left-[4%] top-[10%] w-[51%] bg-[#08292A] border-4 border-[#D4AF37] p-2 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden -rotate-8 z-10"
          >
            <img
              src={currentImagesToShow[0]}
              alt="Live 1"
              class="w-full h-full object-cover rounded-xl"
            />
          </div>

          <div
            class="absolute right-[2%] top-[20%] w-[53%] bg-[#08292A] border-4 border-[#D4AF37] p-2 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden rotate-5 z-20"
          >
            <img
              src={currentImagesToShow[1]}
              alt="Live 2"
              class="w-full h-full object-cover rounded-xl"
            />
          </div>

          <div
            class="absolute left-[16%] bottom-[4%] w-[56%] bg-[#08292A] border-4 border-[#D4AF37] p-3 shadow-2xl rounded-2xl aspect-3/2 overflow-hidden -rotate-2 z-30"
          >
            <img
              src={currentImagesToShow[2]}
              alt="Live 3"
              class="w-full h-full object-cover rounded-xl"
            />
          </div>
        </div>
      {:else}
        <div
          class="bg-[#08292A] border-4 border-[#D4AF37] p-4 shadow-2xl rounded-2xl h-[85vh] aspect-3/2 overflow-hidden rotate-1 mt-8 z-30"
        >
          <img
            src={currentImagesToShow[0]}
            alt="Live cloud selfie"
            class="w-full h-full object-cover rounded-xl"
          />
        </div>
      {/if}
    </div>
  {/if}

  <!-- QR Code widget -->
  <div
    class="absolute bottom-6 right-6 bg-[#08292A] border-2 border-[#D4AF37] p-4 shadow-2xl rounded-3xl flex flex-col items-center gap-2 text-center z-50 max-w-[190px]"
  >
    <div
      class="bg-[#E5BA5A] text-[#0B3B3C] px-3 py-0.5 font-black text-[10px] uppercase tracking-wider rounded-full"
    >
      📱 STUUR FOTO
    </div>

    <p class="text-[9px] font-bold uppercase tracking-tight text-white/80">
      Scan en verschijn live op het scherm!
    </p>

    <div class="border-2 border-[#D4AF37] p-1 bg-white rounded-xl shadow-inner">
      <img
        src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://hbmaxbooth.c.rbnu.nl&ecc=M&margin=0"
        alt="Scan QR"
        class="w-24 h-24 select-none pointer-events-none"
      />
    </div>
  </div>
</div>

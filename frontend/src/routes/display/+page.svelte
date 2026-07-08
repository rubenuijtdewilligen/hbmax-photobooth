<script>
  import { onMount } from 'svelte';
  import PocketBase from 'pocketbase';

  const PI_BACKEND = 'http://localhost:8090';
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

        historicalSessions = localSessions.map((s) => {
          return {
            id: s.id,
            isCloud: false,
            urls: s.photos.map((p) => `${PI_BACKEND}/api/files/${s.collectionId}/${s.id}/${p}`)
          };
        });
      }
    } catch (err) {
      console.log('Wachten op live geprinte snaps...', err);
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

            triggerInterrupt(photoUrls, '📸 Live vanuit de PHOTOBOOTH!');
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

          triggerInterrupt([selfieUrl], '📱 DANSVLOER SNAP');
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
  class="min-h-screen bg-[#FDE24F] font-mono text-neutral-800 relative flex flex-col items-center justify-center p-4 overflow-hidden select-none"
>
  <div
    class="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:40px_40px] z-0"
  ></div>

  {#if !showInterruptOverlay}
    {#if historicalSessions.length > 0}
      {#key backgroundKey}
        <div
          class="absolute inset-0 flex items-center justify-center p-4 transition-all duration-500 ease-in-out w-full h-full"
        >
          {#if historicalSessions[slideshowIndex].urls.length === 3}
            <div class="relative w-full max-w-5xl h-[90vh] flex items-center justify-center">
              <div
                class="absolute left-[6%] top-[8%] w-[50%] bg-white border-4 border-black p-3 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden -rotate-6 z-10"
              >
                <img
                  src={historicalSessions[slideshowIndex].urls[0]}
                  alt="Dia 1"
                  class="w-full h-full object-cover rounded-xl"
                />
              </div>

              <div
                class="absolute right-[4%] top-[22%] w-[52%] bg-white border-4 border-black p-3 shadow-[14px_14px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden rotate-4 z-20"
              >
                <img
                  src={historicalSessions[slideshowIndex].urls[1]}
                  alt="Dia 2"
                  class="w-full h-full object-cover rounded-xl"
                />
              </div>

              <div
                class="absolute left-[14%] bottom-[6%] w-[54%] bg-white border-4 border-black p-3 shadow-[18px_18px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden -rotate-3 z-30"
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
              class="bg-white border-4 border-black p-4 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] rounded-2xl h-[85vh] aspect-3/2 overflow-hidden rotate-2 flex justify-center items-center"
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
        class="w-full max-w-md bg-white border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-3 rounded-2xl text-center z-10"
      >
        <div
          class="bg-[#2AC3A6] text-white border-2 border-black px-4 py-1 font-black text-xs uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          READY FOR ACTION 📸
        </div>
        <p class="text-sm font-bold leading-snug">Wacht op de eerste geprinte snaps...</p>
        <p class="text-[10px] text-neutral-500 uppercase tracking-wide max-w-[90%]">
          Schiet een strip bij de kist of stuur een live selfie vanaf de dansvloer!
        </p>
      </div>
    {/if}
  {/if}

  {#if showInterruptOverlay}
    <div
      class="absolute inset-0 bg-black/30 backdrop-blur-xs flex flex-col items-center justify-center z-40 p-4 animate-fade-in w-full h-full"
    >
      <!-- Zwevende Live Badge -->
      <div
        class="absolute top-6 text-white font-black text-sm px-8 py-3 border-4 border-black uppercase tracking-widest shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-xl z-50
        {imageSourceLabel.includes('PHOTOBOOTH') ? 'bg-[#E94E77]' : 'bg-[#2AC3A6]'}"
      >
        {imageSourceLabel}
      </div>

      {#if currentImagesToShow.length === 3}
        <div class="relative w-full max-w-6xl h-[92vh] flex items-center justify-center mt-6">
          <div
            class="absolute left-[4%] top-[10%] w-[51%] bg-white border-4 border-black p-3 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden -rotate-8 z-10"
          >
            <img
              src={currentImagesToShow[0]}
              alt="Live 1"
              class="w-full h-full object-cover rounded-xl"
            />
          </div>

          <div
            class="absolute right-[2%] top-[20%] w-[53%] bg-white border-4 border-black p-3 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden rotate-5 z-20"
          >
            <img
              src={currentImagesToShow[1]}
              alt="Live 2"
              class="w-full h-full object-cover rounded-xl"
            />
          </div>

          <div
            class="absolute left-[16%] bottom-[4%] w-[56%] bg-white border-8 border-black p-4 shadow-[24px_24px_0px_0px_rgba(0,0,0,1)] rounded-2xl aspect-3/2 overflow-hidden -rotate-2 z-30"
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
          class="bg-white border-8 border-black p-4 shadow-[24px_24px_0px_0px_rgba(0,0,0,1)] rounded-2xl h-[85vh] aspect-3/2 overflow-hidden rotate-1 mt-8 z-30"
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
</div>

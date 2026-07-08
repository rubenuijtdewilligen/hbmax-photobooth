<script>
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';

  let videoElement = $state(null);
  let stream = $state(null);

  let isCountingDown = $state(false);
  let isUploading = $state(false);
  let countdownValue = $state(3);
  let flashActive = $state(false);
  let capturedPhotos = $state([]);

  let showAdminModal = $state(false);
  let adminPin = $state('');
  let adminError = $state('');
  const MASTER_PIN = '2906';

  onMount(async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false
      });
      if (videoElement) videoElement.srcObject = stream;
    } catch (err) {
      console.error(err);
    }

    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  });

  async function startSession() {
    if (isCountingDown || isUploading) return;
    isCountingDown = true;
    capturedPhotos = [];

    for (let i = 0; i < 3; i++) {
      await runCountdown(3);
      triggerFlash();
      captureFrame();
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    isCountingDown = false;
    isUploading = true;

    try {
      const activeEvent = await pb.collection('events').getFirstListItem('active = true');
      if (!activeEvent) throw new Error('Geen actief evenement gevonden.');

      const stripDataUrl = await createStrip(capturedPhotos, activeEvent);

      await uploadToPocketBase(capturedPhotos, stripDataUrl, activeEvent.id);
    } catch (err) {
      console.error(err);
    } finally {
      isUploading = false;
    }
  }

  function createStrip(photos, activeEvent) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');

      const targetWidth = 1280;
      const targetHeight = 853;
      const padding = 40;
      const bottomSpace = 300;

      canvas.width = targetWidth + padding * 2;
      canvas.height = targetHeight * 3 + padding * 4 + bottomSpace;

      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let loadedCount = 0;

      photos.forEach((src, index) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const yOffset = padding + index * (targetHeight + padding);

          const sWidth = img.width;
          const sHeight = img.height;

          let cropWidth = sWidth;
          let cropHeight = sWidth * (2 / 3);

          if (cropHeight > sHeight) {
            cropHeight = sHeight;
            cropWidth = sHeight * (3 / 2);
          }

          const sourceX = (sWidth - cropWidth) / 2;
          const sourceY = (sHeight - cropHeight) / 2;

          ctx.drawImage(
            img,
            sourceX,
            sourceY,
            cropWidth,
            cropHeight,
            padding,
            yOffset,
            targetWidth,
            targetHeight
          );

          loadedCount++;
          if (loadedCount === photos.length) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 48px monospace';
            ctx.textAlign = 'center';

            const nameToDisplay =
              activeEvent && activeEvent.name
                ? activeEvent.name.toUpperCase()
                : 'HB MAX PHOTOBOOTH';
            ctx.fillText(nameToDisplay, canvas.width / 2, canvas.height - 160);

            ctx.font = '32px monospace';
            ctx.fillStyle = '#666666';
            const eventDate =
              activeEvent && activeEvent.date
                ? new Date(activeEvent.date).toLocaleDateString('nl-NL')
                : new Date().toLocaleDateString('nl-NL');
            ctx.fillText(eventDate, canvas.width / 2, canvas.height - 100);

            resolve(canvas.toDataURL('image/jpeg', 0.9));
          }
        };
      });
    });
  }

  function dataURLtoFile(dataurl, filename) {
    let arr = dataurl.split(','),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  async function uploadToPocketBase(photosArray, stripDataUrl, eventId) {
    const formData = new FormData();
    formData.append('event', eventId);

    photosArray.forEach((base64, index) => {
      const file = dataURLtoFile(base64, `photo-${index + 1}.jpg`);
      formData.append('photos', file);
    });

    const stripFile = dataURLtoFile(stripDataUrl, 'print-strip.jpg');
    formData.append('print_strip', stripFile);

    await pb.collection('sessions').create(formData);
  }

  function runCountdown(seconds) {
    return new Promise((resolve) => {
      countdownValue = seconds;
      const interval = setInterval(() => {
        countdownValue--;
        if (countdownValue <= 0) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }

  function triggerFlash() {
    flashActive = true;
    setTimeout(() => (flashActive = false), 150);
  }

  function captureFrame() {
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 1280;
    canvas.height = videoElement.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    capturedPhotos = [...capturedPhotos, canvas.toDataURL('image/jpeg', 0.9)];
  }

  function checkAdminPin() {
    if (adminPin === MASTER_PIN) {
      showAdminModal = false;
      window.location.href = '/setup';
    } else {
      adminError = 'PIN onjuist.';
      adminPin = '';
    }
  }
</script>

<div
  class="min-h-screen bg-[#FDE24F] font-mono text-neutral-800 relative flex flex-col items-center justify-between p-6 overflow-hidden select-none"
>
  {#if flashActive}
    <div class="absolute inset-0 bg-white z-50"></div>
  {/if}

  <button
    type="button"
    onclick={() => {
      showAdminModal = true;
      adminError = '';
      adminPin = '';
    }}
    class="text-neutral-300 absolute top-4 right-4 hover:text-neutral-900 text-sm focus:outline-none cursor-pointer transition-colors"
  >
    🔒
  </button>

  <div class="relative flex-1 w-full max-w-4xl flex flex-col items-center justify-center my-4 z-10">
    <div
      class="bg-[#2AC3A6] text-white border-4 border-black px-6 py-2 font-black text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-2 mb-[-20px] z-20 tracking-wide uppercase"
    >
      Capture Time!
    </div>

    <div
      class="w-full aspect-3/2 bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative flex flex-col"
    >
      <div class="w-full flex-1 bg-neutral-100 border-4 border-[#7BC5E3] overflow-hidden relative">
        <video
          bind:this={videoElement}
          autoplay
          playsinline
          class="w-full h-full object-cover scale-x-[-1]"
        ></video>

        <div class="absolute top-3 left-3 flex gap-1.5 z-20">
          {#each [0, 1, 2] as i (i)}
            <div
              class="w-4 h-4 rounded-full border-2 border-black transition-colors duration-200 {capturedPhotos.length >
              i
                ? 'bg-[#E94E77]'
                : 'bg-white'}"
            ></div>
          {/each}
        </div>

        {#if isCountingDown && countdownValue > 0}
          <div
            class="absolute inset-0 bg-white/60 flex flex-col items-center justify-center backdrop-blur-xs z-30"
          >
            <span
              class="text-9xl font-black text-neutral-900 drop-shadow-[4px_4px_0px_rgba(255,255,255,1)] animate-scale-up"
            >
              {countdownValue}
            </span>
            <span
              class="text-xs uppercase font-black tracking-widest text-white mt-4 bg-[#2AC3A6] border-2 border-black px-3 py-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              Smile! Foto {capturedPhotos.length + 1} van de 3
            </span>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="w-full flex flex-col items-center justify-center pb-4 z-10">
    {#if !isCountingDown && !isUploading}
      <button
        type="button"
        onclick={startSession}
        class="px-10 py-4 bg-[#E94E77] text-white font-black text-lg uppercase tracking-wider rounded-xl border-4 border-black active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]"
      >
        Druk hier om te starten!
      </button>
    {/if}
  </div>

  {#if showAdminModal}
    <div class="absolute inset-0 bg-[#613563] z-50 flex items-center justify-center p-4">
      <div
        class="relative bg-[#c0c0c0] p-1 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-xs text-black font-mono"
      >
        <div
          class="border border-b-white border-r-white border-t-black border-l-black p-4 relative pt-6"
        >
          <div
            class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#c0c0c0] px-2 text-[#a80000] font-bold text-xs whitespace-nowrap"
          >
            ─┤ HB MAX Fotobooth ├─
          </div>
          <p class="text-xs font-bold mb-3">Voer de admin PIN in</p>
          <div
            class="bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white p-2 text-center h-10 flex items-center justify-center text-md font-bold tracking-widest text-[#a80000] mb-3"
          >
            {#if adminPin.length === 0}
              <span class="opacity-20 text-black text-xs font-normal uppercase">[ PIN ]</span>
            {:else}
              {adminPin.replace(/./g, '*')}
            {/if}
          </div>
          {#if adminError}
            <p class="text-[#a80000] text-[10px] font-bold text-center mb-2 uppercase">
              {adminError}
            </p>
          {/if}
          <div class="grid grid-cols-3 gap-1.5 mb-4">
            {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as num (num)}
              <button
                type="button"
                class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black font-bold py-1.5 text-sm active:border-t-black active:border-l-black active:border-b-white active:border-r-white focus:outline-none"
                onclick={() => {
                  adminError = '';
                  if (adminPin.length < 4) adminPin += num;
                }}>{num}</button
              >
            {/each}
            <button
              type="button"
              class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-[#a80000] font-bold py-1.5 text-xs focus:outline-none"
              onclick={() => (adminPin = '')}>CLEAR</button
            >
            <button
              type="button"
              class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black font-bold py-1.5 text-sm focus:outline-none"
              onclick={() => {
                adminError = '';
                if (adminPin.length < 4) adminPin += 0;
              }}>0</button
            >
            <button
              type="button"
              class="bg-[#a80000] border-t-2 border-l-2 border-red-300 border-b-2 border-r-2 border-red-950 text-white font-bold py-1.5 text-xs focus:outline-none"
              onclick={checkAdminPin}>ENTER</button
            >
          </div>
          <button
            type="button"
            class="w-full py-2 text-center text-xs font-bold bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white focus:outline-none cursor-pointer"
            onclick={() => (showAdminModal = false)}
          >
            &lt;Terug naar booth&gt;
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

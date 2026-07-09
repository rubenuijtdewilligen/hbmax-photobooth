<script>
  import { onMount } from 'svelte';
  import { pb } from '$lib/pocketbase';

  let currentView = $state('CAMERA');

  let videoElement = $state(null);
  let stream = $state(null);

  let isCountingDown = $state(false);
  let isUploading = $state(false);
  let countdownValue = $state(3);
  let flashActive = $state(false);
  let capturedPhotos = $state([]);
  let currentSessionRecord = $state(null);

  let finalStripUrl = $state('');

  let showAdminModal = $state(false);
  let adminPin = $state('');
  let adminError = $state('');
  const MASTER_PIN = '2906';

  onMount(async () => {
    await initCamera();
    return () => {
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  });

  async function initCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false
      });
      if (videoElement) videoElement.srcObject = stream;
    } catch (err) {
      console.error(err);
    }
  }

  async function startSession() {
    if (isCountingDown || isUploading) return;
    isCountingDown = true;
    capturedPhotos = [];
    currentView = 'CAMERA';

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

      currentSessionRecord = await uploadToPocketBase(capturedPhotos, stripDataUrl, activeEvent.id);

      finalStripUrl = stripDataUrl;
      currentView = 'RESULT';
    } catch (err) {
      console.error(err);
      alert('Fout bij verwerken of opslaan van de strip.');
    } finally {
      isUploading = false;
    }
  }

  function createStrip(photos, activeEvent) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');

      canvas.width = 1200;
      canvas.height = 1800;

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let loadedCount = 0;
      const totalToLoad = photos.length + 1;

      const logoImg = new Image();
      logoImg.src = '/hbmaxlogo.png';

      const imgObjects = photos.map((src) => {
        const img = new Image();
        img.src = src;
        return img;
      });

      function checkAndRender() {
        loadedCount++;
        if (loadedCount === totalToLoad) {
          const stripWidth = 600;
          const sidePadding = 55;
          const topPadding = 50;

          const targetWidth = stripWidth - sidePadding * 2;
          const targetHeight = 327;
          const gapBetweenPhotos = 45;

          for (let col = 0; col < 2; col++) {
            const xOffset = col * stripWidth;

            imgObjects.forEach((loadedImg, imgIdx) => {
              const yOffset = topPadding + imgIdx * (targetHeight + gapBetweenPhotos);

              const sWidth = loadedImg.width;
              const sHeight = loadedImg.height;

              let cropWidth = sWidth;
              let cropHeight = sWidth * (2 / 3);

              if (cropHeight > sHeight) {
                cropHeight = sHeight;
                cropWidth = sHeight * (3 / 2);
              }

              const sourceX = (sWidth - cropWidth) / 2;
              const sourceY = (sHeight - cropHeight) / 2;

              ctx.drawImage(
                loadedImg,
                sourceX,
                sourceY,
                cropWidth,
                cropHeight,
                xOffset + sidePadding,
                yOffset,
                targetWidth,
                targetHeight
              );
            });

            const nameToDisplay =
              activeEvent && activeEvent.name
                ? activeEvent.name.toUpperCase()
                : 'HB MAX PHOTOBOOTH';

            let fontSize = 54;
            ctx.font = `bold ${fontSize}px monospace`;
            ctx.textAlign = 'center';

            const maxTextWidth = 490;

            while (ctx.measureText(nameToDisplay).width > maxTextWidth && fontSize > 20) {
              fontSize -= 2;
              ctx.font = `bold ${fontSize}px monospace`;
            }

            ctx.fillStyle = '#000000';
            ctx.fillText(nameToDisplay, xOffset + stripWidth / 2, 1320);

            ctx.font = '34px monospace';
            ctx.fillStyle = '#666666';
            const eventDate =
              activeEvent && activeEvent.date
                ? new Date(activeEvent.date).toLocaleDateString('nl-NL')
                : new Date().toLocaleDateString('nl-NL');

            ctx.fillText(eventDate, xOffset + stripWidth / 2, 1380);

            const logoTargetWidth = 420;
            const logoTargetHeight = (logoImg.height / logoImg.width) * logoTargetWidth;

            const logoX = xOffset + (stripWidth - logoTargetWidth) / 2;
            const logoY = 1490;

            ctx.drawImage(logoImg, logoX, logoY, logoTargetWidth, logoTargetHeight);
          }

          resolve(canvas.toDataURL('image/jpeg', 0.9));
        }
      }

      logoImg.onload = checkAndRender;
      logoImg.onerror = () => {
        console.error('Kon het HB MAX logo niet laden.');
        checkAndRender();
      };

      imgObjects.forEach((img) => {
        img.onload = checkAndRender;
      });
    });
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

    return await pb.collection('sessions').create(formData);
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

  async function triggerPrint() {
    if (currentSessionRecord) {
      try {
        const updatedRecord = await pb.collection('sessions').update(currentSessionRecord.id, {
          printed: true
        });

        const printResponse = await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionRecord.id,
            printStripFilename: updatedRecord.print_strip
          })
        });

        const printResult = await printResponse.json();

        if (printResult.success) {
          console.log('Printopdracht verwerkt:', printResult);
        } else {
          console.error('Printer API gaf een fout:', printResult);
        }
      } catch (err) {
        console.error('Kon print status of API niet triggeren:', err);
      }
    }

    resetToHome();
  }

  function resetToHome() {
    capturedPhotos = [];
    finalStripUrl = '';
    currentSessionRecord = null;
    currentView = 'CAMERA';

    setTimeout(() => {
      if (videoElement && stream) videoElement.srcObject = stream;
    }, 50);
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
    class="text-neutral-400 absolute top-4 right-4 hover:text-neutral-900 text-sm focus:outline-none cursor-pointer transition-colors z-50"
  >
    🔒
  </button>

  {#if currentView === 'CAMERA'}
    <div
      class="relative flex-1 w-full max-w-4xl flex flex-col items-center justify-center my-4 z-10"
    >
      <div
        class="bg-[#2AC3A6] text-white border-4 border-black px-6 py-2 font-black text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-2 mb-[-20px] z-20 tracking-wide uppercase"
      >
        Capture Time!
      </div>

      <div
        class="w-full max-w-2xl aspect-3/2 bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative flex flex-col"
      >
        <div class="w-full flex-1 bg-neutral-100 border-4 border-black overflow-hidden relative">
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
                class="text-9xl font-black text-neutral-900 drop-shadow-[4px_4px_0px_rgba(255,255,255,1)]"
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
          class="px-12 py-5 bg-[#E94E77] text-white font-black text-xl uppercase tracking-wider rounded-xl border-4 border-black active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]"
        >
          Druk hier om te starten!
        </button>
      {/if}
    </div>
  {:else if currentView === 'RESULT'}
    <div
      class="w-full max-w-4xl flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 items-center my-4 z-10 animate-fade-in"
    >
      <div class="flex justify-center items-center h-full">
        <img
          src={finalStripUrl}
          alt="Gegenereerde strip"
          class="w-auto h-max border-2 border-neutral-200 bg-white border-4 border-black p-3 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-[75vh]"
        />
      </div>

      <div
        class="flex flex-col gap-5 items-center md:items-start justify-center w-full max-w-xs mx-auto md:mx-0"
      >
        <div
          class="bg-white border-4 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-center md:text-left w-full rounded-xl"
        >
          <p class="font-black text-md uppercase text-[#2AC3A6] tracking-tight">
            Ta-Da! Hier zijn je foto's! ✨
          </p>
        </div>

        <div class="flex flex-col gap-4 w-full">
          <button
            type="button"
            onclick={triggerPrint}
            class="w-full py-5 bg-[#2AC3A6] text-white font-black text-lg uppercase tracking-wider rounded-xl border-4 border-black active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] text-center"
          >
            🖨️ Print
          </button>

          <button
            type="button"
            onclick={resetToHome}
            class="w-full py-5 bg-[#E94E77] text-white font-black text-lg uppercase tracking-wider rounded-xl border-4 border-black active:translate-x-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] text-center"
          >
            🔄 Opnieuw
          </button>
        </div>
      </div>
    </div>
  {/if}

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
            onclick={() => (showAdminModal = false)}>&lt;Terug naar booth&gt;</button
          >
        </div>
      </div>
    </div>
  {/if}
</div>

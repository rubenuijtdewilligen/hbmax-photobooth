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
      ctx.fillStyle = '#0B3B3C';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let loadedCount = 0;
      const totalToLoad = photos.length + 1;

      const logoImg = new Image();
      logoImg.src = '/vf-logo.png';

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

            // Scheidingslijn tussen de twee strips
            if (col === 1) {
              ctx.strokeStyle = '#D4AF37';
              ctx.lineWidth = 2;
              ctx.setLineDash([8, 8]);
              ctx.beginPath();
              ctx.moveTo(stripWidth, 0);
              ctx.lineTo(stripWidth, canvas.height);
              ctx.stroke();
              ctx.setLineDash([]);
            }

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

              // Gouden kader om foto's
              ctx.fillStyle = '#D4AF37';
              ctx.fillRect(
                xOffset + sidePadding - 3,
                yOffset - 3,
                targetWidth + 6,
                targetHeight + 6
              );

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
                : 'V&F FOOD & EVENTS';

            let fontSize = 46;
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';

            const maxTextWidth = 490;
            while (ctx.measureText(nameToDisplay).width > maxTextWidth && fontSize > 20) {
              fontSize -= 2;
              ctx.font = `bold ${fontSize}px sans-serif`;
            }

            ctx.fillStyle = '#E5BA5A';
            ctx.fillText(nameToDisplay, xOffset + stripWidth / 2, 1320);

            ctx.font = '28px sans-serif';
            ctx.fillStyle = '#FFFFFF';
            const eventDate =
              activeEvent && activeEvent.date
                ? new Date(activeEvent.date).toLocaleDateString('nl-NL')
                : new Date().toLocaleDateString('nl-NL');

            ctx.fillText(eventDate, xOffset + stripWidth / 2, 1370);

            const logoTargetWidth = 320;
            const logoTargetHeight = (logoImg.height / logoImg.width) * logoTargetWidth || 90;

            const logoX = xOffset + (stripWidth - logoTargetWidth) / 2;
            const logoY = 1460;

            ctx.drawImage(logoImg, logoX, logoY, logoTargetWidth, logoTargetHeight);
          }

          resolve(canvas.toDataURL('image/jpeg', 0.9));
        }
      }

      logoImg.onload = checkAndRender;
      logoImg.onerror = () => {
        console.error('Kon het logo niet laden.');
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
        }
      } catch (err) {
        console.error('Kon print niet triggeren:', err);
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
  class="min-h-screen bg-[#0B3B3C] font-sans text-white relative flex flex-col items-center justify-between p-6 overflow-hidden select-none"
>
  {#if flashActive}
    <div class="absolute inset-0 bg-white z-50"></div>
  {/if}

  <!-- Logo linksboven (zwevend, drukt view niet omlaag) -->
  <div class="absolute top-6 left-6 z-30 pointer-events-none">
    <img src="/vf-logo.png" alt="V&F Logo" class="h-20 w-auto drop-shadow-md" />
  </div>

  <!-- Admin slotje rechtsboven (zwevend) -->
  <button
    type="button"
    onclick={() => {
      showAdminModal = true;
      adminError = '';
      adminPin = '';
    }}
    class="absolute top-6 right-6 z-30 text-[#E5BA5A]/60 hover:text-[#E5BA5A] text-xl focus:outline-none cursor-pointer transition-colors p-2"
  >
    🔒
  </button>

  {#if currentView === 'CAMERA'}
    <div class="relative flex-1 w-full max-w-3xl flex flex-col items-center justify-center z-10">
      <div
        class="bg-[#E5BA5A] text-[#0B3B3C] border-2 border-[#D4AF37] px-8 py-2 font-black text-sm uppercase tracking-widest rounded-full shadow-lg mb-[-16px] z-20"
      >
        Lach naar de camera
      </div>

      <div
        class="w-full aspect-3/2 bg-[#08292A] border-4 border-[#D4AF37] p-3 rounded-2xl shadow-2xl relative flex flex-col"
      >
        <div
          class="w-full flex-1 bg-black/40 rounded-xl border border-[#D4AF37]/30 overflow-hidden relative"
        >
          <video
            bind:this={videoElement}
            autoplay
            playsinline
            class="w-full h-full object-cover scale-x-[-1]"
          ></video>

          <div class="absolute top-4 left-4 flex gap-2 z-20">
            {#each [0, 1, 2] as i (i)}
              <div
                class="w-4 h-4 rounded-full border-2 border-[#D4AF37] transition-colors duration-300 {capturedPhotos.length >
                i
                  ? 'bg-[#E5BA5A]'
                  : 'bg-black/40'}"
              ></div>
            {/each}
          </div>

          {#if isCountingDown && countdownValue > 0}
            <div
              class="absolute inset-0 bg-[#0B3B3C]/75 flex flex-col items-center justify-center backdrop-blur-xs z-30"
            >
              <span class="text-9xl font-black text-[#E5BA5A] drop-shadow-lg animate-scale">
                {countdownValue}
              </span>
              <span
                class="text-xs uppercase font-bold tracking-widest text-[#0B3B3C] mt-4 bg-[#E5BA5A] px-4 py-1.5 rounded-full shadow-md"
              >
                Foto {capturedPhotos.length + 1} van de 3
              </span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="w-full flex flex-col items-center justify-center pb-2 z-10">
      {#if !isCountingDown && !isUploading}
        <button
          type="button"
          onclick={startSession}
          class="px-12 py-5 bg-[#E5BA5A] hover:bg-[#d8ae4f] text-[#0B3B3C] font-black text-xl uppercase tracking-widest rounded-2xl border-2 border-[#D4AF37] active:scale-95 transition-all cursor-pointer shadow-xl"
        >
          📸 START FOTOSHOOT
        </button>
      {/if}
    </div>
  {:else if currentView === 'RESULT'}
    <div class="w-full max-w-4xl flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 items-center z-10">
      <div class="flex justify-center items-center h-full">
        <div
          class="max-h-[75vh] aspect-[1/3] overflow-hidden border-4 border-[#D4AF37] p-2 bg-[#0B3B3C] shadow-2xl rounded-xl flex justify-start"
        >
          <img
            src={finalStripUrl}
            alt="Gegenereerde strip"
            class="h-full max-w-[200%] object-cover object-left rounded-lg"
          />
        </div>
      </div>

      <div
        class="flex flex-col gap-5 items-center md:items-start justify-center w-full max-w-xs mx-auto md:mx-0"
      >
        <div
          class="bg-[#08292A] border-2 border-[#D4AF37] p-4 text-center md:text-left w-full rounded-2xl shadow-lg"
        >
          <p class="font-black text-lg text-[#E5BA5A] uppercase tracking-wide">
            Prachtig gelukt! ✨
          </p>
          <p class="text-xs text-white/80 mt-1">Druk op print om je fotostrip mee te nemen.</p>
        </div>

        <div class="flex flex-col gap-4 w-full">
          <button
            type="button"
            onclick={triggerPrint}
            class="w-full py-4 bg-[#E5BA5A] hover:bg-[#d8ae4f] text-[#0B3B3C] font-black text-lg uppercase tracking-wider rounded-xl border-2 border-[#D4AF37] active:scale-95 transition-all cursor-pointer shadow-lg text-center"
          >
            🖨️ PRINT STRIP
          </button>

          <button
            type="button"
            onclick={resetToHome}
            class="w-full py-4 bg-[#08292A] hover:bg-[#062021] text-[#E5BA5A] font-black text-lg uppercase tracking-wider rounded-xl border-2 border-[#D4AF37]/50 active:scale-95 transition-all cursor-pointer shadow-lg text-center"
          >
            🔄 OPNIEUW
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if showAdminModal}
    <div
      class="absolute inset-0 bg-[#0B3B3C]/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <div
        class="bg-[#08292A] border-2 border-[#D4AF37] p-6 rounded-2xl shadow-2xl w-full max-w-xs text-white"
      >
        <h3 class="text-center font-bold text-sm uppercase tracking-wider text-[#E5BA5A] mb-4">
          Admin Toegang
        </h3>

        <div
          class="bg-[#0B3B3C] border border-[#D4AF37] p-2 text-center h-12 flex items-center justify-center text-lg font-bold tracking-widest text-[#E5BA5A] rounded-xl mb-4"
        >
          {#if adminPin.length === 0}
            <span class="text-white/30 text-xs font-normal uppercase tracking-normal"
              >[ PIN CODE ]</span
            >
          {:else}
            {adminPin.replace(/./g, '●')}
          {/if}
        </div>

        {#if adminError}
          <p class="text-red-400 text-xs font-bold text-center mb-2">{adminError}</p>
        {/if}

        <div class="grid grid-cols-3 gap-2 mb-4">
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as num (num)}
            <button
              type="button"
              class="bg-[#0B3B3C] border border-[#D4AF37]/40 hover:border-[#D4AF37] font-bold py-2 text-base rounded-xl active:bg-[#E5BA5A] active:text-[#0B3B3C] transition-colors"
              onclick={() => {
                adminError = '';
                if (adminPin.length < 4) adminPin += num;
              }}>{num}</button
            >
          {/each}
          <button
            type="button"
            class="bg-[#0B3B3C] border border-red-400/50 text-red-400 font-bold py-2 text-xs rounded-xl"
            onclick={() => (adminPin = '')}>CLEAR</button
          >
          <button
            type="button"
            class="bg-[#0B3B3C] border border-[#D4AF37]/40 font-bold py-2 text-base rounded-xl"
            onclick={() => {
              adminError = '';
              if (adminPin.length < 4) adminPin += 0;
            }}>0</button
          >
          <button
            type="button"
            class="bg-[#E5BA5A] text-[#0B3B3C] font-bold py-2 text-xs rounded-xl"
            onclick={checkAdminPin}>ENTER</button
          >
        </div>

        <button
          type="button"
          class="w-full py-2 text-center text-xs font-bold text-[#E5BA5A]/70 hover:text-[#E5BA5A]"
          onclick={() => (showAdminModal = false)}>Sluiten</button
        >
      </div>
    </div>
  {/if}
</div>

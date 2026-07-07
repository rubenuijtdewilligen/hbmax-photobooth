<script>
  let pin = $state('');
  let errorMsg = $state('');

  const MASTER_PIN = '2906';

  function handleKeypad(num) {
    errorMsg = '';
    if (pin.length < 4) {
      pin = pin + num;
    }
  }

  function clearPin() {
    pin = '';
    errorMsg = '';
  }

  function checkPin() {
    if (pin === MASTER_PIN) {
      window.location.href = '/setup';
    } else {
      errorMsg = 'Admin PIN onjuist. Probeer opnieuw.';
      pin = '';
    }
  }
</script>

<div
  class="relative bg-[#c0c0c0] p-1 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-sm"
>
  <div class="border border-b-white border-r-white border-t-black border-l-black p-4 relative pt-6">
    <div
      class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#c0c0c0] px-2 text-[#a80000] font-bold text-sm whitespace-nowrap"
    >
      ─┤ HB MAX Fotobooth ├─
    </div>

    <p class="text-black text-sm mb-4 leading-tight">Voer de admin PIN in.</p>

    <div
      class="bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white p-2 text-center h-10 flex items-center justify-center text-lg font-bold tracking-widest text-[#a80000] mb-4"
    >
      {#if pin.length === 0}
        <span class="opacity-20 text-black font-normal text-xs uppercase tracking-normal"
          >[ Voer PIN in ]</span
        >
      {:else}
        {pin.replace(/./g, '*')}
      {/if}
    </div>

    <div class="h-6 mb-2 flex items-center justify-center">
      {#if errorMsg}
        <p class="text-[#a80000] text-xs font-bold uppercase tracking-tighter text-center">
          {errorMsg}
        </p>
      {/if}
    </div>

    <div class="grid grid-cols-3 gap-2">
      {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as num (num)}
        <button
          type="button"
          class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white font-bold py-2 text-sm focus:outline-none"
          onclick={() => handleKeypad(num)}
        >
          {num}
        </button>
      {/each}

      <button
        type="button"
        class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-[#a80000] active:border-t-black active:border-l-black active:border-b-white active:border-r-white font-bold py-2 text-xs focus:outline-none"
        onclick={clearPin}
      >
        CLEAR
      </button>

      <button
        type="button"
        class="bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white font-bold py-2 text-sm focus:outline-none"
        onclick={() => handleKeypad(0)}
      >
        0
      </button>

      <button
        type="button"
        class="bg-[#a80000] border-t-2 border-l-2 border-red-300 border-b-2 border-r-2 border-red-950 text-white active:border-t-red-950 active:border-l-red-950 active:border-b-red-300 active:border-r-red-300 font-bold py-2 text-xs focus:outline-none"
        onclick={checkPin}
      >
        ENTER
      </button>
    </div>
  </div>
</div>

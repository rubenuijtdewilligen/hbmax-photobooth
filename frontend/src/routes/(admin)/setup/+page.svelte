<script>
  import { pb } from '$lib/pocketbase';
  import { onMount } from 'svelte';

  let step = $state(1);
  let subMode = $state('');

  let eventName = $state('');
  let existingEvents = $state([]);
  let selectedEvent = $state(null);

  let loading = $state(false);
  let statusMessage = $state('');

  let selectedIndex = $state(0);

  onMount(async () => {
    try {
      existingEvents = await pb.collection('events').getFullList({ sort: '-created' });
    } catch (error) {
      console.error(error);
    }
  });

  function changeStep(targetStep) {
    step = targetStep;
    selectedIndex = 0;
  }

  function openNewEventSub() {
    subMode = 'NEW';
    eventName = '';
    selectedEvent = null;
    changeStep(2);
  }

  function openExistingEventSub() {
    subMode = 'OPEN';
    if (existingEvents.length > 0) {
      selectedEvent = existingEvents[0];
    }
    changeStep(2);
  }

  function handleOk() {
    if (step === 1) {
      if (selectedIndex === 0) openNewEventSub();
      else openExistingEventSub();
    } else if (step === 2) {
      if (subMode === 'NEW') {
        if (!eventName.trim()) {
          alert('Voer een naam in voor het nieuwe evenement.');
          return;
        }
        changeStep(3);
      } else if (subMode === 'OPEN') {
        if (!selectedEvent) {
          alert('Selecteer een evenement.');
          return;
        }
        eventName = selectedEvent.name;
        changeStep(3);
      }
    } else if (step === 3) {
      const modes = ['AP', 'LAN', 'WAN'];
      initializeSystem(modes[selectedIndex]);
    }
  }

  function handleCancel() {
    if (step === 1) {
      window.location.href = '/login';
    } else if (step === 2) {
      changeStep(1);
    } else if (step === 3) {
      if (subMode === 'NEW') changeStep(2);
      else changeStep(2);
    }
  }

  async function initializeSystem(mode) {
    loading = true;
    statusMessage = `Netwerk modus instellen naar ${mode}...`;
    try {
      const activeEvents = await pb
        .collection('events')
        .getList(1, 50, { filter: 'active = true' });
      for (let actEvent of activeEvents.items) {
        await pb.collection('events').update(actEvent.id, { active: false });
      }

      if (selectedEvent) {
        await pb
          .collection('events')
          .update(selectedEvent.id, { network_mode: mode, active: true });
      } else {
        await pb.collection('events').create({
          name: eventName,
          date: new Date().toISOString(),
          network_mode: mode,
          active: true
        });
      }

      const response = await fetch('/api/network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await response.json();
      if (data.success) {
        statusMessage = 'Systeem gereed. Booth client opstarten...';
        setTimeout(() => (window.location.href = '/booth'), 1500);
      } else {
        statusMessage = 'Netwerkconfiguratie mislukt.';
        loading = false;
      }
    } catch {
      statusMessage = 'Backend server onbereikbaar.';
      loading = false;
    }
  }
</script>

<div
  class="relative bg-[#c0c0c0] p-1 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] w-full max-w-md"
>
  <div
    class="border border-b-white border-r-white border-t-black border-l-black p-4 relative pt-6 text-black"
  >
    <div
      class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#c0c0c0] px-2 text-[#a80000] font-bold text-sm whitespace-nowrap"
    >
      ─┤ HB MAX Fotobooth ├─
    </div>

    {#if loading}
      <div class="py-4">
        <p class="text-sm font-bold text-[#a80000] mb-4 animate-pulse uppercase">{statusMessage}</p>
        <div
          class="w-full bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white h-6 p-0.5"
        >
          <div class="bg-[#a80000] h-full w-2/3 animate-pulse"></div>
        </div>
      </div>
    {:else}
      {#if step === 1}
        <p class="text-sm font-bold mb-4">Selecteer een optie</p>
      {:else if subMode === 'OPEN' && step === 2}
        <p class="text-sm font-bold mb-4">Evenement openen</p>
      {:else if step === 3}
        <p class="text-sm font-bold mb-4">Selecteer een netwerkmodus</p>
      {/if}

      <div class="min-h-[140px] flex flex-col justify-center">
        {#if step === 1}
          <div class="flex flex-col gap-2 text-sm">
            <button
              type="button"
              class="text-left py-3 px-4 w-full font-bold border border-transparent focus:outline-none transition-none cursor-pointer {selectedIndex ===
              0
                ? 'bg-[#a80000] text-white border-red-950'
                : 'text-black bg-black/5'}"
              onclick={() => (selectedIndex = 0)}
            >
              1 Nieuw evenement toevoegen
            </button>
            <button
              type="button"
              class="text-left py-3 px-4 w-full font-bold border border-transparent focus:outline-none transition-none cursor-pointer {selectedIndex ===
              1
                ? 'bg-[#a80000] text-white border-red-950'
                : 'text-black bg-black/5'}"
              onclick={() => (selectedIndex = 1)}
            >
              2 Bestaand evenement openen
            </button>
          </div>
        {:else if step === 2}
          {#if subMode === 'NEW'}
            <div class="w-full">
              <label class="block text-xs font-bold uppercase mb-2" for="ev-name"
                >Voer een naam in:</label
              >
              <input
                id="ev-name"
                type="text"
                bind:value={eventName}
                placeholder="bijv. Bruiloft Bart en Machthold"
                class="w-full bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white p-3 font-bold text-sm focus:outline-none text-[#a80000]"
              />
            </div>
          {:else if subMode === 'OPEN'}
            <div
              class="flex flex-col gap-1 text-sm max-h-40 overflow-y-auto border border-t-black border-l-black border-b-white border-r-white bg-[#c0c0c0]/50 p-1"
            >
              {#if existingEvents.length > 0}
                {#each existingEvents as ev (ev.id)}
                  <button
                    type="button"
                    class="text-left py-2 px-3 font-bold focus:outline-none flex justify-between text-xs transition-none cursor-pointer {selectedEvent?.id ===
                    ev.id
                      ? 'bg-[#a80000] text-white'
                      : 'text-black bg-black/5'}"
                    onclick={() => (selectedEvent = ev)}
                  >
                    <span>{ev.name}</span>
                    <span
                      class="{selectedEvent?.id === ev.id
                        ? 'text-white/80'
                        : 'text-black/50'} font-normal"
                      >{new Date(ev.date).toLocaleDateString('nl-NL')}</span
                    >
                  </button>
                {/each}
              {:else}
                <p class="text-xs opacity-50 italic p-4 text-center">
                  Geen eerdere evenementen gevonden.
                </p>
              {/if}
            </div>
          {/if}
        {:else if step === 3}
          <div class="flex flex-col gap-2 text-sm">
            <div
              class="bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white p-2 mb-2 text-xs font-bold uppercase text-[#a80000] truncate"
            >
              Evenement: {eventName}
            </div>
            {#each ['1 Standalone Mode (Pi Hotspot)', '2 External LAN Link (Router)', '3 Cloud Gateway (Venue Wi-Fi)'] as modeLabel, idx (idx)}
              <button
                type="button"
                class="text-left py-2.5 px-4 font-bold border border-transparent focus:outline-none transition-none cursor-pointer {selectedIndex ===
                idx
                  ? 'bg-[#a80000] text-white border-red-950'
                  : 'text-black bg-black/5'}"
                onclick={() => (selectedIndex = idx)}
              >
                {modeLabel}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-4 pt-4 border-t border-black/10 mt-4">
        <button
          type="button"
          class="py-3 text-center font-black uppercase text-sm bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white cursor-pointer hover:bg-black/5"
          onclick={handleOk}
        >
          &lt;Ok&gt;
        </button>
        <button
          type="button"
          class="py-3 text-center font-black uppercase text-sm bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white cursor-pointer hover:bg-black/5"
          onclick={handleCancel}
        >
          &lt;Annuleren&gt;
        </button>
      </div>
    {/if}
  </div>
</div>

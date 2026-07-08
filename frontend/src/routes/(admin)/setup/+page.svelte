<script>
  import { pb } from '$lib/pocketbase';
  import { onMount } from 'svelte';
  import PocketBase from 'pocketbase';

  const CLOUD_BACKEND = 'https://hbmaxbooth-pb.c.rbnu.nl';
  let pbCloud = new PocketBase(CLOUD_BACKEND);

  let step = $state(1);
  let subMode = $state('');
  let eventName = $state('');
  let existingEvents = $state([]);
  let selectedEvent = $state(null);
  let loading = $state(false);
  let statusMessage = $state('');
  let selectedIndex = $state(0);
  let showKeyboard = $state(false);

  let activeEvent = $state(null);
  let liveSessionsLocal = $state([]);
  let liveSessionsCloud = $state([]);
  let activeTab = $state('SESSIONS');
  let hasCloudConnection = $state(false);

  let allLiveSessions = $derived(
    [
      ...liveSessionsLocal.map((s) => ({ ...s, isCloud: false })),
      ...(hasCloudConnection ? liveSessionsCloud.map((s) => ({ ...s, isCloud: true })) : [])
    ].sort((a, b) => new Date(b.created) - new Date(a.created))
  );

  const keyboardRows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '&'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', ' ']
  ];

  onMount(async () => {
    await checkActiveEventStatus();
    try {
      existingEvents = await pb.collection('events').getFullList({ sort: '-created' });
    } catch (error) {
      console.error(error);
    }
  });

  async function checkActiveEventStatus() {
    try {
      const currentActive = await pb.collection('events').getFirstListItem('active = true');
      if (currentActive) {
        activeEvent = currentActive;
        await loadLocalSessions(currentActive.id);

        if (activeEvent.network_mode !== 'AP') {
          try {
            await pbCloud.collection('events').getList(1, 1, { requestKey: null });
            hasCloudConnection = true;
          } catch {
            hasCloudConnection = false;
          }
        } else {
          hasCloudConnection = false;
        }

        if (hasCloudConnection) {
          await loadCloudSessions(currentActive.name);
        }

        pb.collection('sessions').subscribe('*', async () => {
          await loadLocalSessions(activeEvent.id);
        });

        if (hasCloudConnection) {
          pbCloud.collection('sessions').subscribe('*', async () => {
            await loadCloudSessions(activeEvent.name);
          });
        }
      } else {
        activeEvent = null;
      }
    } catch {
      activeEvent = null;
    }
  }

  async function loadLocalSessions(eventId) {
    try {
      liveSessionsLocal = await pb.collection('sessions').getFullList({
        filter: `event = "${eventId}"`,
        sort: '-created'
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCloudSessions(eventName) {
    if (!hasCloudConnection) return;
    try {
      const cloudEvent = await pbCloud
        .collection('events')
        .getFirstListItem(`name = "${eventName}"`);

      if (cloudEvent) {
        liveSessionsCloud = await pbCloud.collection('sessions').getFullList({
          filter: `event = "${cloudEvent.id}"`,
          sort: '-created'
        });
      }
    } catch (err) {
      console.error('Kon cloud sessies niet matchen op evenementnaam:', err);
    }
  }

  async function reprintSession(sessionId) {
    try {
      await pb.collection('sessions').update(sessionId, { printed: false });
      await pb.collection('sessions').update(sessionId, { printed: true });
    } catch {
      alert('Fout bij triggeren van printer.');
    }
  }

  async function deleteSession(session) {
    const targetDb = session.isCloud ? pbCloud : pb;

    try {
      await targetDb.collection('sessions').delete(session.id);
      if (session.isCloud) {
        liveSessionsCloud = liveSessionsCloud.filter((s) => s.id !== session.id);
      } else {
        liveSessionsLocal = liveSessionsLocal.filter((s) => s.id !== session.id);
      }
    } catch {
      alert('Kon sessie niet verwijderen.');
    }
  }

  async function closeCurrentEvent() {
    loading = true;
    statusMessage = 'Evenement afsluiten...';
    try {
      if (activeEvent) {
        await pb.collection('events').update(activeEvent.id, { active: false });
      }
      pb.collection('sessions').unsubscribe('*');
      if (hasCloudConnection) {
        pbCloud.collection('sessions').unsubscribe('*');
      }
      activeEvent = null;
      hasCloudConnection = false;
      step = 1;
      selectedIndex = 0;
      existingEvents = await pb.collection('events').getFullList({ sort: '-created' });
    } catch {
      alert('Fout bij afsluiten.');
    } finally {
      loading = false;
    }
  }

  function changeStep(targetStep) {
    step = targetStep;
    selectedIndex = 0;
    showKeyboard = false;
  }
  function openNewEventSub() {
    subMode = 'NEW';
    eventName = '';
    selectedEvent = null;
    changeStep(2);
  }
  function openExistingEventSub() {
    subMode = 'OPEN';
    if (existingEvents.length > 0) selectedEvent = existingEvents[0];
    changeStep(2);
  }
  function handleKeyPress(key) {
    eventName += key;
  }
  function handleBackspace() {
    eventName = eventName.slice(0, -1);
  }

  function handleOk() {
    if (showKeyboard) {
      showKeyboard = false;
      return;
    }
    if (step === 1) {
      if (selectedIndex === 0) openNewEventSub();
      else openExistingEventSub();
    } else if (step === 2) {
      if (subMode === 'NEW') {
        if (!eventName.trim()) {
          alert('Voer een naam in.');
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
    if (showKeyboard) {
      showKeyboard = false;
      return;
    }
    if (step === 1) window.location.href = '/login';
    else if (step === 2) changeStep(1);
    else if (step === 3) changeStep(2);
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
        statusMessage = 'Systeem gereed...';
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

{#if activeEvent}
  <div
    class="w-full max-w-5xl bg-[#c0c0c0] p-1 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-black flex flex-col"
  >
    <div
      class="bg-[#a80000] text-white px-3 py-1.5 font-bold text-xs select-none flex justify-between items-center"
    >
      <span>HB MAX FOTOBOOTH | EVENT: {activeEvent.name.toUpperCase()}</span>
      {#if !hasCloudConnection}
        <span class="bg-black text-white px-2 py-0.5 text-[9px] border border-white uppercase"
          >OFFLINE MODUS</span
        >
      {/if}
    </div>

    <div
      class="bg-white/50 border-b border-black/20 px-4 py-2 flex gap-6 text-xs font-bold uppercase tracking-tight select-none"
    >
      {#if hasCloudConnection}
        <div>Totaal: <span class="text-[#a80000]">{allLiveSessions.length}</span></div>
      {/if}
      <div>Fotobooth strips: <span class="text-[#a80000]">{liveSessionsLocal.length}</span></div>
      {#if hasCloudConnection}
        <div>
          Mobiel ingestuurd: <span class="text-[#a80000]">{liveSessionsCloud.length}</span>
        </div>
      {/if}
    </div>

    <div class="flex bg-neutral-300 border-b border-black select-none">
      <button
        type="button"
        onclick={() => (activeTab = 'SESSIONS')}
        class="px-6 py-2.5 text-xs font-black uppercase border-r border-black tracking-wider focus:outline-none {activeTab ===
        'SESSIONS'
          ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-white'
          : 'bg-neutral-300 opacity-60 hover:opacity-100'}"
      >
        Fotogalerij ({allLiveSessions.length})
      </button>
      <button
        type="button"
        onclick={() => (activeTab = 'SYSTEM')}
        class="px-6 py-2.5 text-xs font-black uppercase border-r border-black tracking-wider focus:outline-none {activeTab ===
        'SYSTEM'
          ? 'bg-[#c0c0c0] border-t-2 border-l-2 border-white'
          : 'bg-neutral-300 opacity-60 hover:opacity-100'}"
      >
        Systeembeheer
      </button>
      <div class="flex-1 flex justify-end items-center pr-2">
        <button
          type="button"
          onclick={() => (window.location.href = '/booth')}
          class="bg-[#a80000] text-white px-3 py-1 font-bold text-[10px] border-t border-l border-red-300 border-b-2 border-r-2 border-black active:border-t-black active:border-l-black"
        >
          TERUG NAAR BOOTH
        </button>
      </div>
    </div>

    {#if activeTab === 'SESSIONS'}
      <div class="p-4 flex-1 overflow-y-auto max-h-[65vh] bg-white/40">
        {#if allLiveSessions.length === 0}
          <p class="text-xs italic text-center py-12 opacity-60">
            Nog geen foto's binnengekomen...
          </p>
        {:else}
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 items-start"
          >
            {#each allLiveSessions as session (session.id)}
              <div
                class="bg-[#c0c0c0] border border-t-white border-l-white border-b-black border-r-black p-2 flex flex-col shadow-sm"
              >
                <div
                  class="w-full bg-neutral-900 border border-black flex items-center justify-center relative min-h-[160px] p-1 overflow-hidden"
                >
                  {#if !session.isCloud}
                    <img
                      src="http://localhost:8090/api/files/{session.collectionId}/{session.id}/{session.print_strip}"
                      alt="Strip"
                      class="w-full h-auto object-contain"
                    />
                    <span
                      class="absolute top-1 left-1 bg-[#E94E77] text-white text-[7px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-sm border border-black/10"
                      >FOTOBOOTH</span
                    >
                  {:else}
                    <img
                      src="{CLOUD_BACKEND}/api/files/{session.collectionId}/{session.id}/{session
                        .photos[0]}"
                      alt="Selfie"
                      class="w-full h-auto object-contain"
                    />
                    <span
                      class="absolute top-1 left-1 bg-[#2AC3A6] text-white text-[7px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-sm border border-black/10"
                      >MOBIEL</span
                    >
                  {/if}
                </div>

                <div
                  class="text-[9px] text-neutral-600 font-bold mt-1.5 flex justify-between select-none px-0.5"
                >
                  <span>⏱️ {new Date(session.created).toLocaleTimeString('nl-NL')}</span>
                  <span class="opacity-50 font-mono text-[8px]">{session.id}</span>
                </div>

                <div class="grid grid-cols-2 gap-1 mt-2">
                  <button
                    type="button"
                    disabled={session.isCloud}
                    onclick={() => reprintSession(session.id)}
                    class="py-1 text-center font-black text-[9px] uppercase bg-neutral-200 border border-t-white border-l-white border-b-black border-r-black active:border-t-black active:border-l-black disabled:opacity-20 select-none"
                  >
                    PRINT
                  </button>
                  <button
                    type="button"
                    onclick={() => deleteSession(session)}
                    class="py-1 text-center font-black text-[9px] text-[#a80000] uppercase bg-neutral-200 border border-t-white border-l-white border-b-black border-r-black active:border-t-black active:border-l-black select-none"
                  >
                    DEL
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if activeTab === 'SYSTEM'}
      <div class="p-6 flex-1 bg-white/40 flex flex-col gap-4 select-none">
        <div class="bg-white border border-t-black border-l-black p-4 max-w-xl">
          <h3 class="text-sm font-black text-[#a80000] mb-2 uppercase">Evenement Sluiten</h3>
          <p class="text-xs text-neutral-600 leading-tight mb-4">
            Je kan dit evenement sluiten om een andere te openen.
          </p>
          <button
            type="button"
            onclick={closeCurrentEvent}
            class="bg-[#a80000] border-t-2 border-l-2 border-red-300 border-b-2 border-r-2 border-red-950 text-white font-black py-2.5 px-6 text-xs uppercase active:border-t-red-950 active:border-l-red-950 shadow-md"
          >
            HUIDIG EVENEMENT SLUITEN
          </button>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-6 items-center justify-center w-full max-w-xl">
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
            <p class="text-sm font-bold text-[#a80000] mb-4 animate-pulse uppercase">
              {statusMessage}
            </p>
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
                    readonly
                    placeholder="Klik hier om te typen..."
                    onclick={() => (showKeyboard = true)}
                    class="w-full bg-[#c0c0c0] border border-t-black border-l-black border-b-white border-r-white p-3 font-bold text-sm focus:outline-none text-[#a80000] cursor-pointer"
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
                {#each ['1 Standalone', '2 LAN (Eigen router)', '3 Cloud (Internet vereist)'] as modeLabel, idx (idx)}
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

    {#if showKeyboard && step === 2 && subMode === 'NEW'}
      <div
        class="w-full bg-[#c0c0c0] p-3 border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] text-black select-none transition-all"
      >
        <div
          class="border border-b-white border-r-white border-t-black border-l-black p-2 flex flex-col gap-2"
        >
          {#each keyboardRows as row (row)}
            <div class="flex justify-center gap-1 w-full">
              {#each row as key (key)}
                <button
                  type="button"
                  onclick={() => handleKeyPress(key)}
                  class="flex-1 py-3 text-center bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-xs font-black active:border-t-black active:border-l-black active:border-b-white active:border-r-white active:bg-black/5 cursor-pointer {key ===
                  ' '
                    ? 'max-w-[40%]'
                    : ''}"
                >
                  {key === ' ' ? 'spatie' : key}
                </button>
              {/each}
            </div>
          {/each}

          <div class="flex justify-center gap-1 w-full mt-1">
            <button
              type="button"
              onclick={handleBackspace}
              class="flex-1 py-3 text-center bg-[#c0c0c0] border-t-2 border-l-2 border-white border-b-2 border-r-2 border-black text-xs font-black text-[#a80000] active:border-t-black active:border-l-black active:border-b-white active:border-r-white cursor-pointer"
            >
              [ BACKSPACE ]
            </button>
            <button
              type="button"
              onclick={() => (showKeyboard = false)}
              class="flex-1 py-3 text-center bg-[#a80000] border-t-2 border-l-2 border-red-300 border-b-2 border-r-2 border-red-950 text-white text-xs font-black active:border-t-red-950 active:border-l-red-950 active:border-b-red-300 active:border-r-red-300 cursor-pointer"
            >
              [ OK ]
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
